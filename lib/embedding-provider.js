/**
 * Embedding provider abstraction.
 * Supports OpenAI text-embedding-3-small (default) and a null fallback for FTS5-only mode.
 */

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMS = 1536;
const MAX_BATCH = 2048;

export function createEmbeddingProvider(config = {}) {
  const provider = config.provider || 'openai';
  const apiKey = config.apiKey || '';
  const model = config.model || DEFAULT_MODEL;
  const dims = config.dims || DEFAULT_DIMS;

  if (provider === 'none' || !apiKey) {
    return {
      async embed() { return null; },
      getDimensions() { return dims; },
      getProviderName() { return 'none'; },
      isAvailable() { return false; },
    };
  }

  async function embed(texts) {
    if (!texts || texts.length === 0) return [];

    const results = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const body = { input: batch, model, dimensions: dims };

      const resp = await fetch(OPENAI_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`OpenAI embedding API error ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const data = await resp.json();
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error(`Invalid OpenAI response: ${JSON.stringify(data).slice(0, 200)}`);
      }
      for (const item of data.data) {
        results.push(item.embedding);
      }
    }

    return results;
  }

  return {
    embed,
    getDimensions() { return dims; },
    getProviderName() { return 'openai'; },
    isAvailable() { return true; },
  };
}
