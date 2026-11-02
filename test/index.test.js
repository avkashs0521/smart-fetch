import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFetcher, HttpError, TimeoutError } from '../index.js';

describe('@avkashhhh/smart-fetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Input validation', () => {
    it('rejects invalid options', () => {
      assert.throws(() => createFetcher('invalid'), /options must be an object/);
      assert.throws(() => createFetcher(null), /options must be an object/);
      assert.throws(() => createFetcher([]), /options must be an object/);
      assert.throws(() => createFetcher({ timeout: -10 }), /timeout must be a non-negative number/);
      assert.throws(() => createFetcher({ timeout: '500' }), /timeout must be a non-negative number/);
      assert.throws(() => createFetcher({ retries: -1 }), /retries must be a non-negative integer/);
      assert.throws(() => createFetcher({ retries: 1.5 }), /retries must be a non-negative integer/);
      assert.throws(() => createFetcher({ cacheTTL: -50 }), /cacheTTL must be a non-negative number/);
      assert.throws(() => createFetcher({ baseURL: 123 }), /baseURL must be a string/);
      assert.throws(() => createFetcher({ retryDelay: -1 }), /retryDelay must be a non-negative number/);
    });

    it('rejects invalid getJSON arguments', async () => {
      const client = createFetcher();
      await assert.rejects(() => client.getJSON(''), /url must be a non-empty string/);
      await assert.rejects(() => client.getJSON(123), /url must be a non-empty string/);
      await assert.rejects(() => client.getJSON('   '), /url must be a non-empty string/);
      await assert.rejects(() => client.getJSON('/ok', 'invalid-init'), /init must be an object/);
    });
  });

  describe('Success & BaseURL', () => {
    it('fetches JSON successfully', async () => {
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://api.example.com/data');
        return new Response(JSON.stringify({ hello: 'world' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher();
      const result = await client.getJSON('https://api.example.com/data');
      assert.deepEqual(result, { hello: 'world' });
    });

    it('resolves URL against baseURL properly', async () => {
      const called = [];
      globalThis.fetch = async (url) => {
        called.push(url);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ baseURL: 'https://api.example.com/v1' });
      await client.getJSON('/users');
      await client.getJSON('weather');
      await client.getJSON('https://other.com/resource');

      assert.equal(called[0], 'https://api.example.com/v1/users');
      assert.equal(called[1], 'https://api.example.com/v1/weather');
      assert.equal(called[2], 'https://other.com/resource');
    });
  });

  describe('Timeout', () => {
    it('aborts and throws TimeoutError when request exceeds timeout', async () => {
      globalThis.fetch = async (_url, { signal }) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(new Response('{}', { status: 200 }));
          }, 100);

          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const client = createFetcher({ timeout: 20 });
      await assert.rejects(
        () => client.getJSON('https://example.com/slow'),
        (err) => {
          assert.ok(err instanceof TimeoutError);
          assert.equal(err.name, 'TimeoutError');
          assert.match(err.message, /timed out after 20ms/);
          return true;
        }
      );
    });
  });

  describe('Retries & Exponential Backoff', () => {
    it('retries on network errors and succeeds', async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        if (attempts < 3) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ retries: 2, retryDelay: 10 });
      const data = await client.getJSON('https://api.example.com/network-flaky');
      assert.deepEqual(data, { success: true });
      assert.equal(attempts, 3);
    });

    it('retries on 500 server error and succeeds', async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ error: 'Server error' }), {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ recovered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ retries: 2, retryDelay: 10 });
      const data = await client.getJSON('https://api.example.com/server-flaky');
      assert.deepEqual(data, { recovered: true });
      assert.equal(attempts, 2);
    });

    it('retries on 429 Too Many Requests and succeeds', async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ error: 'Rate limit' }), {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ afterRateLimit: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ retries: 1, retryDelay: 10 });
      const data = await client.getJSON('https://api.example.com/rate-limited');
      assert.deepEqual(data, { afterRateLimit: true });
      assert.equal(attempts, 2);
    });

    it('exhausts retries and throws HttpError with response body', async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        return new Response(JSON.stringify({ detail: 'Persistent failure' }), {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ retries: 2, retryDelay: 10 });
      await assert.rejects(
        () => client.getJSON('https://api.example.com/unavailable'),
        (err) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 503);
          assert.equal(err.statusText, 'Service Unavailable');
          assert.deepEqual(err.body, { detail: 'Persistent failure' });
          assert.deepEqual(err.data, { detail: 'Persistent failure' });
          return true;
        }
      );
      assert.equal(attempts, 3); // initial + 2 retries
    });
  });

  describe('No Retry on 4xx', () => {
    it('does not retry on 404 Not Found', async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        return new Response('Not Found', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain' },
        });
      };

      const client = createFetcher({ retries: 3, retryDelay: 10 });
      await assert.rejects(
        () => client.getJSON('https://api.example.com/not-found'),
        (err) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 404);
          assert.equal(err.body, 'Not Found');
          return true;
        }
      );
      assert.equal(attempts, 1); // Only 1 attempt, no retries!
    });

    it('does not retry on 400 Bad Request', async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        return new Response(JSON.stringify({ error: 'Bad query' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ retries: 3, retryDelay: 10 });
      await assert.rejects(
        () => client.getJSON('https://api.example.com/bad-request'),
        (err) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 400);
          assert.deepEqual(err.body, { error: 'Bad query' });
          return true;
        }
      );
      assert.equal(attempts, 1);
    });
  });

  describe('Caching & Expiry', () => {
    it('serves subsequent requests from cache within TTL', async () => {
      let fetchCount = 0;
      globalThis.fetch = async () => {
        fetchCount++;
        return new Response(JSON.stringify({ count: fetchCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ cacheTTL: 500 });
      const first = await client.getJSON('https://api.example.com/cached');
      const second = await client.getJSON('https://api.example.com/cached');

      assert.equal(fetchCount, 1);
      assert.deepEqual(first, { count: 1 });
      assert.deepEqual(second, { count: 1 });
    });

    it('refetches once cache TTL expires', async () => {
      let fetchCount = 0;
      globalThis.fetch = async () => {
        fetchCount++;
        return new Response(JSON.stringify({ count: fetchCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ cacheTTL: 30 });
      const first = await client.getJSON('https://api.example.com/expiring');
      assert.equal(fetchCount, 1);
      assert.deepEqual(first, { count: 1 });

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 40));

      const second = await client.getJSON('https://api.example.com/expiring');
      assert.equal(fetchCount, 2);
      assert.deepEqual(second, { count: 2 });
    });

    it('clears cache manually via clearCache', async () => {
      let fetchCount = 0;
      globalThis.fetch = async () => {
        fetchCount++;
        return new Response(JSON.stringify({ count: fetchCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher({ cacheTTL: 10000 });
      await client.getJSON('https://api.example.com/item');
      assert.equal(fetchCount, 1);

      client.clearCache();

      await client.getJSON('https://api.example.com/item');
      assert.equal(fetchCount, 2);
    });
  });

  describe('In-flight Request Deduplication', () => {
    it('deduplicates identical concurrent GET requests into a single fetch call', async () => {
      let fetchCount = 0;
      globalThis.fetch = async () => {
        fetchCount++;
        // Simulate slight delay so both calls overlap
        await new Promise((resolve) => setTimeout(resolve, 25));
        return new Response(JSON.stringify({ data: 'shared' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createFetcher(); // cacheTTL is 0
      const [res1, res2, res3] = await Promise.all([
        client.getJSON('https://api.example.com/dedupe'),
        client.getJSON('https://api.example.com/dedupe'),
        client.getJSON('https://api.example.com/dedupe'),
      ]);

      assert.equal(fetchCount, 1);
      assert.deepEqual(res1, { data: 'shared' });
      assert.deepEqual(res2, { data: 'shared' });
      assert.deepEqual(res3, { data: 'shared' });

      // After in-flight request finishes and without cache, next call triggers a new fetch
      const res4 = await client.getJSON('https://api.example.com/dedupe');
      assert.equal(fetchCount, 2);
      assert.deepEqual(res4, { data: 'shared' });
    });
  });

  describe('User abort signal', () => {
    it('respects user-provided abort signal', async () => {
      globalThis.fetch = async (_url, { signal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('User cancelled');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const controller = new AbortController();
      const client = createFetcher();
      const promise = client.getJSON('https://example.com/cancel', { signal: controller.signal });
      controller.abort();

      await assert.rejects(
        () => promise,
        (err) => {
          assert.equal(err.name, 'AbortError');
          return true;
        }
      );
    });
  });
});
