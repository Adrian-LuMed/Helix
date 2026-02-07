// tests/learning.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createClassificationLog } from '../clawcondos/condo-management/lib/classification-log.js';
import { createGoalsStore } from '../clawcondos/condo-management/lib/goals-store.js';
import { analyzeCorrections, applyLearning } from '../clawcondos/condo-management/lib/learning.js';

const TEST_DIR = join(import.meta.dirname, '__fixtures__', 'learning-test');

describe('Learning', () => {
  let log, store;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    log = createClassificationLog(TEST_DIR);
    store = createGoalsStore(TEST_DIR);

    // Seed a condo
    const data = store.load();
    data.condos.push({
      id: 'condo:system', name: 'System', description: '', color: null,
      keywords: ['infra'], telegramTopicIds: [], createdAtMs: Date.now(), updatedAtMs: Date.now(),
    });
    store.save(data);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('extracts keywords from corrections', () => {
    // Simulate: messages were misrouted, corrected to condo:system
    const e1 = log.append({ sessionKey: 's1', tier: 1, predictedCondo: 'condo:other', confidence: 0.5 });
    const e2 = log.append({ sessionKey: 's2', tier: 1, predictedCondo: 'condo:other', confidence: 0.5 });
    log.recordFeedback(e1.id, { accepted: false, correctedTo: 'condo:system' });
    log.recordFeedback(e2.id, { accepted: false, correctedTo: 'condo:system' });

    const suggestions = analyzeCorrections(log);
    expect(suggestions).toBeInstanceOf(Array);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].condoId).toBe('condo:system');
    expect(suggestions[0].correctionCount).toBe(2);
  });

  it('requires 2+ corrections to suggest', () => {
    const e1 = log.append({ sessionKey: 's1', tier: 1, predictedCondo: 'condo:other', confidence: 0.5 });
    log.recordFeedback(e1.id, { accepted: false, correctedTo: 'condo:system' });

    const suggestions = analyzeCorrections(log);
    expect(suggestions).toHaveLength(0);
  });

  it('applyLearning adds keywords to condos', () => {
    const suggestions = [{ condoId: 'condo:system', suggestedKeywords: ['scraper', 'deploy'] }];
    const applied = applyLearning(store, suggestions);
    expect(applied).toHaveLength(1);
    expect(applied[0].addedKeywords).toContain('scraper');

    const data = store.load();
    const condo = data.condos.find(c => c.id === 'condo:system');
    expect(condo.keywords).toContain('scraper');
    expect(condo.keywords).toContain('infra'); // Existing preserved
  });

  it('applyLearning skips unknown condos', () => {
    const suggestions = [{ condoId: 'condo:nonexistent', suggestedKeywords: ['foo'] }];
    const applied = applyLearning(store, suggestions);
    expect(applied).toHaveLength(0);
  });

  it('applyLearning dryRun does not save', () => {
    const suggestions = [{ condoId: 'condo:system', suggestedKeywords: ['test'] }];
    const applied = applyLearning(store, suggestions, true);
    expect(applied).toHaveLength(1);

    const data = store.load();
    const condo = data.condos.find(c => c.id === 'condo:system');
    expect(condo.keywords).not.toContain('test');
  });
});
