/**
 * GraphQL Client - HTTP client for GitHub GraphQL API
 * Requirements: 9.1, 9.3, 9.5 - Infrastructure layer extraction
 * Requirements: 2.5 - Error handling with retry
 */

const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_JITTER_FACTOR = 0.2; // 20% jitter

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; type?: string }>;
}

export interface GraphQLClientOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

export interface IGraphQLClient {
  /**
   * Execute a GraphQL query/mutation
   * @param query The GraphQL query or mutation string
   * @param variables Variables to pass to the query
   * @param token Authentication token
   * @throws Error if the request fails or returns GraphQL errors
   */
  query<T>(query: string, variables: Record<string, unknown>, token: string): Promise<T>;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // Retry on rate limit (403) or server errors (5xx)
  if (statusCode) {
    if (statusCode === 403 || statusCode === 429 || statusCode >= 500) {
      return true;
    }
  }

  // Retry on network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('fetch failed')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param attempt Current attempt number (0-based)
 * @param initialDelayMs Base delay in milliseconds
 * @param maxDelayMs Maximum delay cap
 * @param jitterFactor Jitter factor (0-1), e.g., 0.2 for ±20%
 * @param retryAfterMs Optional Retry-After header value in milliseconds
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  jitterFactor: number,
  retryAfterMs?: number
): number {
  // If Retry-After is provided, use it as the base delay
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }

  // Calculate exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);

  // Apply max delay cap
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Apply jitter: randomize within ±jitterFactor range
  const jitterRange = cappedDelay * jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // Random value between -jitterRange and +jitterRange

  return Math.max(0, Math.floor(cappedDelay + jitter));
}

export class GraphQLClient implements IGraphQLClient {
  private readonly apiUrl: string;
  private readonly userAgent: string;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterFactor: number;

  constructor(
    apiUrl: string = GITHUB_GRAPHQL_API,
    userAgent: string = 'VSCode-GitHub-Discussions',
    options?: GraphQLClientOptions
  ) {
    this.apiUrl = apiUrl;
    this.userAgent = userAgent;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.jitterFactor = options?.jitterFactor ?? DEFAULT_JITTER_FACTOR;
  }

  /**
   * Execute a GraphQL query/mutation with automatic retry on transient failures
   * Uses exponential backoff with jitter and respects Retry-After headers
   */
  async query<T>(
    query: string,
    variables: Record<string, unknown>,
    token: string
  ): Promise<T> {
    let lastError: Error | undefined;
    let retryAfterMs: number | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeQuery<T>(query, variables, token);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Extract status code and retry-after from error if present
        const statusMatch = lastError.message.match(/GitHub API error: (\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

        // Extract Retry-After value if present (in seconds, convert to ms)
        const retryAfterMatch = lastError.message.match(/Retry-After: (\d+)/);
        retryAfterMs = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : undefined;

        // Only retry on retryable errors and if we have attempts left
        if (attempt < this.maxRetries && isRetryableError(error, statusCode)) {
          const delayMs = calculateBackoffDelay(
            attempt,
            this.initialDelayMs,
            this.maxDelayMs,
            this.jitterFactor,
            retryAfterMs
          );
          await sleep(delayMs);
          continue;
        }

        // Not retryable or no retries left
        throw lastError;
      }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError || new Error('Query failed after retries');
  }

  /**
   * Execute a single GraphQL query (no retry)
   */
  private async executeQuery<T>(
    query: string,
    variables: Record<string, unknown>,
    token: string
  ): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      // Include Retry-After header in error message if present
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterInfo = retryAfter ? ` Retry-After: ${retryAfter}` : '';
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}${retryAfterInfo}`);
    }

    const result = await response.json() as GraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL error: ${result.errors.map(e => e.message).join(', ')}`);
    }

    if (!result.data) {
      throw new Error('No data returned from GitHub API');
    }

    return result.data;
  }
}
