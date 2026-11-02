/**
 * Options to configure the smart fetcher instance.
 */
export interface FetcherOptions {
  /**
   * Request timeout in milliseconds (0 or undefined = no timeout).
   * @default 0
   */
  timeout?: number;

  /**
   * Number of retry attempts on network errors, HTTP 429, or HTTP 5xx.
   * @default 0
   */
  retries?: number;

  /**
   * In-memory cache time-to-live in milliseconds (0 or undefined = disabled).
   * @default 0
   */
  cacheTTL?: number;

  /**
   * Base URL prefix for all requests.
   * @default ''
   */
  baseURL?: string;

  /**
   * Initial delay in milliseconds for exponential backoff between retries.
   * @default 100
   */
  retryDelay?: number;

  /**
   * Optional callback function invoked before each retry attempt.
   *
   * @param error The error that caused the retry attempt.
   * @param attempt The 1-based index of the retry attempt.
   * @param delayMs The backoff delay in milliseconds before the attempt runs.
   */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

/**
 * Smart fetch client instance.
 */
export interface SmartFetchClient {
  /**
   * Fetches JSON data from a URL with automatic timeout, retries, caching, and deduplication.
   *
   * @template T The expected type of the response data.
   * @param url Target URL or endpoint path.
   * @param init Optional Fetch RequestInit configuration.
   * @returns A promise resolving to the parsed JSON data.
   */
  getJSON<T = any>(url: string, init?: RequestInit): Promise<T>;

  /**
   * Clears all in-memory cached entries.
   */
  clearCache(): void;
}

/**
 * Error thrown when an HTTP response has a non-2xx status code.
 */
export class HttpError extends Error {
  readonly name: 'HttpError';
  readonly status: number;
  readonly statusText: string;
  readonly body: any;
  readonly data: any;
  readonly response: Response;

  constructor(response: Response, body?: any);
}

/**
 * Error thrown when a request exceeds the configured timeout duration.
 */
export class TimeoutError extends Error {
  readonly name: 'TimeoutError';

  constructor(message?: string);
}

/**
 * Creates a smart fetch client instance with timeout, retry, cache, and deduplication capabilities.
 *
 * @param options Configuration options for the fetcher.
 * @returns A smart fetch client instance.
 */
export function createFetcher(options?: FetcherOptions): SmartFetchClient;

export default createFetcher;

