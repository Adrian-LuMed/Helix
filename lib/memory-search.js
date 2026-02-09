/**
 * Read-only search across OpenClaw memory SQLite databases.
 * Discovers *.sqlite files in ~/.openclaw/memory/ and queries them
 * using FTS5 (BM25) + sqlite-vec (vector similarity) hybrid search.
 */

import { readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const DEFAULT_LIMIT = 20;
const CANDIDATE_MULTIPLIER = 4;

export function createMemorySearch({ stateDir, embeddingProvider, logger }) {
  const log = logger || console;
  const memoryDir = join(stateDir, 'memory');
  const dbs = new Map(); // agentId -> { db, hasFts, hasVec }
  let initialized = false;

  function discoverDbs() {
    if (!existsSync(memoryDir)) {
      log.log('[memory-search] Memory directory not found:', memoryDir);
      return;
    }

    let files;
    try {
      files = readdirSync(memoryDir).filter(f => f.endsWith('.sqlite'));
    } catch (err) {
      log.error('[memory-search] Failed to read memory dir:', err.message);
      return;
    }

    for (const file of files) {
      const agentId = basename(file, '.sqlite');
      if (dbs.has(agentId)) continue;

      const dbPath = join(memoryDir, file);
      try {
        const st = statSync(dbPath);
        if (st.size < 100) continue; // skip empty files

        const db = new Database(dbPath, { readonly: true, fileMustExist: true });
        try { db.pragma('journal_mode = WAL'); } catch {} // WAL may fail on read-only

        // Load sqlite-vec extension
        let hasVec = false;
        try {
          sqliteVec.load(db);
          hasVec = true;
        } catch {
          // sqlite-vec not available for this DB
        }

        // Check for FTS5 table
        let hasFts = false;
        try {
          const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'").get();
          hasFts = !!row;
        } catch {}

        // Check for chunks table
        const chunksTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'").get();
        if (!chunksTable) {
          db.close();
          continue;
        }

        dbs.set(agentId, { db, hasFts, hasVec, path: dbPath, sizeBytes: st.size });
        log.log(`[memory-search] Opened ${file} (${(st.size / 1024 / 1024).toFixed(1)}MB, fts=${hasFts}, vec=${hasVec})`);
      } catch (err) {
        log.error(`[memory-search] Failed to open ${file}:`, err.message);
      }
    }
  }

  function init() {
    discoverDbs();
    initialized = true;
  }

  function ftsSearch(db, query, limit) {
    try {
      // Escape FTS5 special characters and build a simpler query
      const terms = query.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replace(/"/g, '""')}"`);
      const ftsQuery = terms.join(' ');
      if (!ftsQuery) return [];

      const stmt = db.prepare(`
        SELECT c.id, c.path, c.text, c.start_line, c.end_line, c.source,
               chunks_fts.rank AS fts_rank
        FROM chunks_fts
        JOIN chunks c ON c.rowid = chunks_fts.rowid
        WHERE chunks_fts MATCH ?
        ORDER BY chunks_fts.rank
        LIMIT ?
      `);
      return stmt.all(ftsQuery, limit);
    } catch (err) {
      log.error('[memory-search] FTS query failed:', err.message);
      return [];
    }
  }

  function vecSearch(db, queryEmbedding, limit) {
    try {
      const stmt = db.prepare(`
        SELECT id, distance
        FROM chunks_vec
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `);
      const buf = float32ArrayToBuffer(queryEmbedding);
      return stmt.all(buf, limit);
    } catch (err) {
      log.error('[memory-search] Vector query failed:', err.message);
      return [];
    }
  }

  function getChunkById(db, id) {
    try {
      return db.prepare('SELECT id, path, text, start_line, end_line, source FROM chunks WHERE id = ?').get(id);
    } catch {
      return null;
    }
  }

  async function search(query, opts = {}) {
    if (!initialized) init();

    const limit = opts.limit || DEFAULT_LIMIT;
    const candidateLimit = limit * CANDIDATE_MULTIPLIER;

    // Get query embedding if vector search is available
    let queryEmbedding = null;
    if (embeddingProvider?.isAvailable()) {
      try {
        const embeddings = await embeddingProvider.embed([query]);
        if (embeddings && embeddings.length > 0) {
          queryEmbedding = embeddings[0];
        }
      } catch (err) {
        log.error('[memory-search] Query embedding failed:', err.message);
      }
    }

    const allResults = [];

    for (const [agentId, info] of dbs) {
      const { db, hasFts, hasVec } = info;
      const scored = new Map(); // id -> { score, chunk }

      // FTS5 search
      if (hasFts) {
        const ftsResults = ftsSearch(db, query, candidateLimit);
        if (ftsResults.length > 0) {
          // Normalize BM25 scores (rank is negative, more negative = better match)
          const minRank = Math.min(...ftsResults.map(r => r.fts_rank));
          const maxRank = Math.max(...ftsResults.map(r => r.fts_rank));
          const range = maxRank - minRank || 1;

          for (const r of ftsResults) {
            const normalizedScore = 1 - (r.fts_rank - minRank) / range;
            scored.set(r.id, {
              ftsScore: normalizedScore,
              vecScore: 0,
              chunk: { id: r.id, path: r.path, text: r.text, startLine: r.start_line, endLine: r.end_line, source: r.source },
            });
          }
        }
      }

      // Vector search
      if (hasVec && queryEmbedding) {
        const vecResults = vecSearch(db, queryEmbedding, candidateLimit);
        if (vecResults.length > 0) {
          // Normalize distances (lower = better)
          const maxDist = Math.max(...vecResults.map(r => r.distance)) || 1;

          for (const r of vecResults) {
            const normalizedScore = 1 - r.distance / maxDist;
            const existing = scored.get(r.id);
            if (existing) {
              existing.vecScore = normalizedScore;
            } else {
              const chunk = getChunkById(db, r.id);
              if (chunk) {
                scored.set(r.id, {
                  ftsScore: 0,
                  vecScore: normalizedScore,
                  chunk: { id: chunk.id, path: chunk.path, text: chunk.text, startLine: chunk.start_line, endLine: chunk.end_line, source: chunk.source },
                });
              }
            }
          }
        }
      }

      // Merge scores: 0.7 vector + 0.3 BM25
      for (const [id, entry] of scored) {
        const finalScore = queryEmbedding
          ? 0.7 * entry.vecScore + 0.3 * entry.ftsScore
          : entry.ftsScore;

        allResults.push({
          agentId,
          path: entry.chunk.path,
          startLine: entry.chunk.startLine,
          endLine: entry.chunk.endLine,
          snippet: truncateSnippet(entry.chunk.text, query, 300),
          score: finalScore,
          source: entry.chunk.source,
        });
      }
    }

    // Sort by score descending and limit
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, limit);
  }

  function getAgentDbs() {
    return Array.from(dbs.entries()).map(([agentId, info]) => ({
      agentId,
      sizeBytes: info.sizeBytes,
      hasFts: info.hasFts,
      hasVec: info.hasVec,
    }));
  }

  function close() {
    for (const [, info] of dbs) {
      try { info.db.close(); } catch {}
    }
    dbs.clear();
    initialized = false;
  }

  return { init, search, getAgentDbs, close };
}

function truncateSnippet(text, query, maxLen) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const qLower = (query || '').toLowerCase();
  const terms = qLower.split(/\s+/).filter(Boolean);

  // Find best position (where most terms cluster)
  let bestPos = 0;
  if (terms.length > 0) {
    const firstIdx = terms.reduce((best, term) => {
      const idx = lower.indexOf(term);
      return idx >= 0 && (best < 0 || idx < best) ? idx : best;
    }, -1);
    if (firstIdx > 0) bestPos = Math.max(0, firstIdx - 40);
  }

  let snippet = text.slice(bestPos, bestPos + maxLen);
  if (bestPos > 0) snippet = '...' + snippet;
  if (bestPos + maxLen < text.length) snippet += '...';
  return snippet.replace(/\n+/g, ' ').trim();
}

function float32ArrayToBuffer(arr) {
  const fa = new Float32Array(arr);
  return Buffer.from(fa.buffer);
}
