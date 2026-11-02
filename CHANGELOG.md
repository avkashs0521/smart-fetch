# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-02

### Added
- Initial release of `@avkashhhh/smart-fetch`.
- `createFetcher` factory function supporting `timeout`, `retries`, `cacheTTL`, `baseURL`, and `retryDelay`.
- `getJSON(url, init)` method returning parsed JSON with support for typed generics.
- Custom `HttpError` error class containing `status`, `statusText`, `body`, `data`, and original `response`.
- Custom `TimeoutError` error class for aborted requests exceeding the timeout duration.
- Automatic retries with exponential backoff on network failures, HTTP 429, and HTTP 5xx.
- No retrying on client errors (HTTP 4xx except 429) or timeouts.
- In-memory GET request cache with configurable TTL.
- In-flight deduplication of concurrent identical GET requests.
- Full TypeScript typings (`index.d.ts`).
- Comprehensive test suite covering Node 18+ and modern browser standards with zero runtime dependencies.
