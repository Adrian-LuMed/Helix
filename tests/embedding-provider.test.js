import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmbeddingProvider } from '../lib/embedding-provider.js';

describe('createEmbeddingProvider', () => {
  describe('null provider (no API key)', () => {
    it('returns null from embed()', async () => {
      const provider = createEmbeddingProvider({ provider: 'openai', apiKey: '' });
      const result = await provider.embed(['hello']);
      expect(result).toBeNull();
    });

    it('reports not available', () => {
      const provider = createEmbeddingProvider({ provider: 'none' });
      expect(provider.isAvailable()).toBe(false);
      expect(provider.getProviderName()).toBe('none');
    });

    it('returns dimensions even when unavailable', () => {
      const provider = createEmbeddingProvider({ provider: 'none' });
      expect(provider.getDimensions()).toBe(1536);
    });

    it('falls back to none when no apiKey provided', () => {
      const provider = createEmbeddingProvider({});
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('openai provider', () => {
    it('reports available when API key is set', () => {
      const provider = createEmbeddingProvider({ provider: 'openai', apiKey: 'test-key' });
      expect(provider.isAvailable()).toBe(true);
      expect(provider.getProviderName()).toBe('openai');
      expect(provider.getDimensions()).toBe(1536);
    });

    it('calls OpenAI API with correct params', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      const provider = createEmbeddingProvider({ provider: 'openai', apiKey: 'test-key' });
      const result = await provider.embed(['hello world']);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockEmbedding);
      expect(global.fetch).toHaveBeenCalledOnce();

      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/embeddings');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer test-key');

      const body = JSON.parse(opts.body);
      expect(body.input).toEqual(['hello world']);
      expect(body.model).toBe('text-embedding-3-small');
      expect(body.dimensions).toBe(1536);
    });

    it('returns empty array for empty input', async () => {
      const provider = createEmbeddingProvider({ provider: 'openai', apiKey: 'test-key' });
      const result = await provider.embed([]);
      expect(result).toEqual([]);
    });

    it('throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const provider = createEmbeddingProvider({ provider: 'openai', apiKey: 'bad-key' });
      await expect(provider.embed(['hello'])).rejects.toThrow('OpenAI embedding API error 401');
    });

    it('supports custom dimensions', () => {
      const provider = createEmbeddingProvider({ provider: 'openai', apiKey: 'k', dims: 768 });
      expect(provider.getDimensions()).toBe(768);
    });
  });
});
