/**
 * @module @avkashhhh/smart-fetch
 * A tiny, zero-dependency wrapper around built-in fetch with timeout, retries,
 * exponential backoff, in-memory caching, and in-flight request deduplication.
 */

/**
 * Error thrown when an HTTP response has a non-2xx status code.
 *
 * @extends Error
 */
export class HttpError extends Error {
  /**
   * @param {Response} response - The Fetch Response object.
   * @param {any} [body=null] - The parsed response body or raw text.
   */
  constructor(response, body = null) {
    const statusText = response.statusText || 'Error';
    super(`HTTP ${response.status} ${statusText}`);
    this.name = 'HttpError';
    this.status = response.status;
    this.statusText = statusText;
    this.body = body;
    this.data = body;
    this.response = response;
  }
}

/**
 * Error thrown when a request exceeds the configured timeout duration.
 *
 * @extends Error
 */
export class TimeoutError extends Error {
  /**
   * @param {string} [message='Request timed out'] - Error message describing the timeout.
   */
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Sleep helper for exponential backoff.
 *
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves a URL against an optional baseURL.
 *
 * @param {string} url - Target URL or path.
 * @param {string} [baseURL=''] - Optional base URL.
 * @returns {string} The resolved absolute or prefixed URL.
 */
function resolveURL(url, baseURL = '') {
  if (!baseURL) {
    return url;
  }
  // Absolute URLs (e.g. http://, https://, //)
  if (/^([a-zA-Z][a-zA-Z0-9+.-]*:)?\/\//.test(url)) {
    return url;
  }
  const cleanBase = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Options to configure the smart fetcher instance.
 *
 * @typedef {Object} FetcherOptions
 * @property {number} [timeout=0] - Request timeout in milliseconds (0 = no timeout).
 * @property {number} [retries=0] - Number of retry attempts on network errors, 429, or 5xx.
 * @property {number} [cacheTTL=0] - In-memory cache time-to-live in milliseconds (0 = disabled).
 * @property {string} [baseURL=''] - Base URL prefix for all requests.
 * @property {number} [retryDelay=100] - Initial delay in milliseconds for exponential backoff.
 */

/**
 * Creates a smart fetch client instance with timeout, retry, cache, and deduplication capabilities.
 *
 * @param {FetcherOptions} [options={}] - Configuration options for the fetcher.
 * @returns {{ getJSON: <T = any>(url: string, init?: RequestInit) => Promise<T>, clearCache: () => void }}
 * @throws {TypeError} If any option has an invalid type or value.
 */
export function createFetcher(options = {}) {
  if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
    throw new TypeError('options must be an object');
  }

  const {
    timeout = 0,
    retries = 0,
    cacheTTL = 0,
    baseURL = '',
    retryDelay = 100,
  } = options || {};

  if (typeof timeout !== 'number' || timeout < 0 || !Number.isFinite(timeout)) {
    throw new TypeError('timeout must be a non-negative number');
  }
  if (typeof retries !== 'number' || retries < 0 || !Number.isInteger(retries)) {
    throw new TypeError('retries must be a non-negative integer');
  }
  if (typeof cacheTTL !== 'number' || cacheTTL < 0 || !Number.isFinite(cacheTTL)) {
    throw new TypeError('cacheTTL must be a non-negative number');
  }
  if (typeof baseURL !== 'string') {
    throw new TypeError('baseURL must be a string');
  }
  if (typeof retryDelay !== 'number' || retryDelay < 0 || !Number.isFinite(retryDelay)) {
    throw new TypeError('retryDelay must be a non-negative number');
  }

  /** @type {Map<string, { data: any, expiresAt: number }>} */
  const cache = new Map();

  /** @type {Map<string, Promise<any>>} */
  const inflight = new Map();

  /**
   * Fetches JSON data from a URL with automatic timeout, retries, caching, and deduplication.
   *
   * @template T
   * @param {string} url - Target URL or endpoint path.
   * @param {RequestInit} [init={}] - Fetch RequestInit options.
   * @returns {Promise<T>} Parsed JSON response.
   * @throws {TypeError} If the URL or init is invalid.
   * @throws {HttpError} If the server responds with a non-2xx status code.
   * @throws {TimeoutError} If the request times out.
   */
  async function getJSON(url, init = {}) {
    if (typeof url !== 'string' || url.trim() === '') {
      throw new TypeError('url must be a non-empty string');
    }
    if (init !== undefined && (typeof init !== 'object' || init === null || Array.isArray(init))) {
      throw new TypeError('init must be an object');
    }

    const method = (init.method || 'GET').toUpperCase();
    const isGet = method === 'GET';
    const resolvedUrl = resolveURL(url, baseURL);
    const cacheKey = resolvedUrl;

    // Check in-memory cache for GET requests
    if (isGet && cacheTTL > 0) {
      const cached = cache.get(cacheKey);
      if (cached) {
        if (cached.expiresAt > Date.now()) {
          return cached.data;
        }
        cache.delete(cacheKey);
      }
    }

    // In-flight request deduplication for concurrent identical GET requests
    if (isGet && inflight.has(cacheKey)) {
      return inflight.get(cacheKey);
    }

    const execute = async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        let timeoutId = null;
        let timedOut = false;
        const controller = new AbortController();

        if (timeout > 0) {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeout);
        }

        let userSignalListener = null;
        if (init.signal) {
          if (init.signal.aborted) {
            if (timeoutId) clearTimeout(timeoutId);
            controller.abort(init.signal.reason);
          } else {
            userSignalListener = () => {
              if (timeoutId) clearTimeout(timeoutId);
              controller.abort(init.signal.reason);
            };
            init.signal.addEventListener('abort', userSignalListener, { once: true });
          }
        }

        try {
          const response = await globalThis.fetch(resolvedUrl, {
            ...init,
            method,
            signal: controller.signal,
          });

          if (!response.ok) {
            let body = null;
            try {
              const contentType = response.headers?.get?.('content-type') || '';
              if (contentType.includes('application/json')) {
                body = await response.json();
              } else {
                body = await response.text();
              }
            } catch {
              body = null;
            }

            const httpError = new HttpError(response, body);

            // Retry only on 429 and 5xx
            if (attempt < retries && (response.status === 429 || (response.status >= 500 && response.status <= 599))) {
              const delay = retryDelay * Math.pow(2, attempt);
              await sleep(delay);
              continue;
            }

            throw httpError;
          }

          const data = await response.json();
          return data;
        } catch (err) {
          if (timedOut) {
            throw new TimeoutError(`Request to ${resolvedUrl} timed out after ${timeout}ms`);
          }
          if (err instanceof HttpError) {
            throw err;
          }
          if (err?.name === 'AbortError') {
            throw err;
          }

          // Retry on network errors
          if (attempt < retries) {
            const delay = retryDelay * Math.pow(2, attempt);
            await sleep(delay);
            continue;
          }

          throw err;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          if (init.signal && userSignalListener) {
            init.signal.removeEventListener('abort', userSignalListener);
          }
        }
      }
    };

    const fetchPromise = (async () => {
      try {
        const data = await execute();
        if (isGet && cacheTTL > 0) {
          cache.set(cacheKey, {
            data,
            expiresAt: Date.now() + cacheTTL,
          });
        }
        return data;
      } finally {
        if (isGet) {
          inflight.delete(cacheKey);
        }
      }
    })();

    if (isGet) {
      inflight.set(cacheKey, fetchPromise);
    }

    return fetchPromise;
  }

  /**
   * Clears the in-memory cache.
   */
  function clearCache() {
    cache.clear();
  }

  return {
    getJSON,
    clearCache,
  };
}

export default createFetcher;
