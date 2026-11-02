# @avkashhhh/smart-fetch

[![npm version](https://img.shields.io/npm/v/@avkashhhh/smart-fetch.svg)](https://www.npmjs.com/package/@avkashhhh/smart-fetch)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A tiny, zero-dependency wrapper around the built-in `fetch` for apps that call public APIs, featuring timeout, automatic exponential backoff retries, in-memory caching, and in-flight request deduplication. Works seamlessly in both modern browsers and Node.js 18+.

---

## Features

- 🪶 **Zero dependencies**: Uses native `fetch` and `AbortController`.
- ⏱️ **Configurable Timeout**: Automatically cancels hanging requests with `TimeoutError`.
- 🔁 **Smart Retries**: Exponential backoff retries for network failures, HTTP 429 (rate limits), and 5xx (server errors). Never retries client 4xx errors.
- 📦 **In-Memory Caching**: Cache GET responses with configurable TTL.
- 🚦 **In-Flight Deduplication**: Prevents duplicate concurrent requests to the same URL.
- 🛡️ **Custom Error Classes**: Distinct `HttpError` (with status, statusText, and response body) and `TimeoutError`.
- 🌐 **Isomorphic**: Runs in Node.js 18+ and modern browser environments.
- 📘 **TypeScript Ready**: Includes comprehensive JSDoc comments and `index.d.ts` type declarations.

---

## Installation

```bash
npm install @avkashhhh/smart-fetch
```

---

## Quick Start

```javascript
import { createFetcher, HttpError, TimeoutError } from '@avkashhhh/smart-fetch';

const api = createFetcher({
  baseURL: 'https://api.example.com',
  timeout: 5000,      // 5 seconds timeout
  retries: 2,         // Retry up to 2 times on network error or 5xx/429
  cacheTTL: 60000,    // Cache successful GET responses for 1 minute
});

try {
  const data = await api.getJSON('/weather?city=Toronto');
  console.log('Weather data:', data);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Request timed out:', error.message);
  } else if (error instanceof HttpError) {
    console.error(`HTTP error ${error.status}:`, error.body);
  } else {
    console.error('Network or unknown error:', error);
  }
}
```

---

## API Reference

### `createFetcher(options?)`

Creates a smart fetch client instance.

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseURL` | `string` | `''` | Base URL prefix applied to all relative request paths. |
| `timeout` | `number` | `0` | Timeout in milliseconds per attempt. `0` disables timeout. |
| `retries` | `number` | `0` | Maximum number of retry attempts for network errors, 429, and 5xx responses. |
| `cacheTTL` | `number` | `0` | In-memory cache duration in milliseconds for GET requests. `0` disables caching. |
| `retryDelay`| `number` | `100` | Base delay in milliseconds for exponential backoff (`delay * 2^attempt`). |

#### Return Value

Returns an object with the following methods:

- **`getJSON<T>(url: string, init?: RequestInit): Promise<T>`**
  - Fetches the URL, parses the response as JSON, and returns the data.
  - Automatically deduplicates concurrent identical GET requests.
  - Uses cached data if available and not expired.
- **`clearCache(): void`**
  - Clears all cached responses from memory.

---

### Error Handling

#### `HttpError`

Thrown when a response has a non-2xx HTTP status code.

- `error.name`: `'HttpError'`
- `error.status`: The HTTP status number (e.g. `404`, `500`).
- `error.statusText`: The HTTP status text (e.g. `'Not Found'`).
- `error.body`: Parsed JSON body or raw text returned by the server.
- `error.data`: Alias to `error.body`.
- `error.response`: The raw Fetch `Response` object.

#### `TimeoutError`

Thrown when a request exceeds the configured `timeout`.

- `error.name`: `'TimeoutError'`
- `error.message`: Description of the timeout and target URL.

---

## Examples

### Node.js Example

```javascript
import { createFetcher, HttpError, TimeoutError } from '@avkashhhh/smart-fetch';

const client = createFetcher({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 3000,
  retries: 3,
});

async function run() {
  try {
    const post = await client.getJSON('/posts/1');
    console.log('Post title:', post.title);
  } catch (err) {
    if (err instanceof HttpError) {
      console.error(`Failed with status ${err.status}:`, err.body);
    } else if (err instanceof TimeoutError) {
      console.error('Request timed out:', err.message);
    }
  }
}

run();
```

### Browser Example

```javascript
import { createFetcher } from '@avkashhhh/smart-fetch';

// In a frontend dashboard or React/Vue/Vite app
const weatherClient = createFetcher({
  baseURL: 'https://api.open-meteo.com/v1',
  timeout: 5000,
  retries: 2,
  cacheTTL: 5 * 60 * 1000, // 5 minutes cache
});

export async function fetchCityWeather(lat, lon) {
  return weatherClient.getJSON(`/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
}
```

---

## Retry Policy & In-Flight Deduplication

- **When retries occur**: Retries are triggered only when a network error occurs (e.g., DNS failure, connection refused) or when the server responds with HTTP 429 (Too Many Requests) or HTTP 5xx (Server Error).
- **Client errors (4xx)**: Non-429 client errors (like 400, 401, 403, 404) fail immediately without retrying.
- **In-flight deduplication**: If multiple components or functions trigger `getJSON` for the exact same URL concurrently while the request is still pending, only a single network request is dispatched. All callers receive the same resolved response.

---

## License

[MIT](LICENSE) © [Avkash Singh](https://github.com/avkashs0521)
