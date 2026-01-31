/**
 * GraphQL Client Tests
 * Requirements: 9.1, 9.3, 9.5 - Infrastructure layer extraction
 * Requirements: 2.5 - Error handling with retry
 */

import { GraphQLClient } from '../infrastructure/graphqlClient';

// Mock fetch globally
global.fetch = jest.fn();

describe('GraphQLClient', () => {
  let client: GraphQLClient;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    client = new GraphQLClient();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('query', () => {
    it('should execute a GraphQL query successfully', async () => {
      const mockData = { repository: { id: 'R_123' } };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockData })
      });

      const result = await client.query(
        'query { repository { id } }',
        {},
        'test-token'
      );

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should pass variables to the query', async () => {
      const mockData = { repository: { id: 'R_123' } };
      const variables = { owner: 'testowner', name: 'testrepo' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockData })
      });

      await client.query('query { repository { id } }', variables, 'test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            query: 'query { repository { id } }',
            variables
          })
        })
      );
    });

    it('should throw error on HTTP error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: () => null }
      });

      await expect(
        client.query('query { repository { id } }', {}, 'bad-token')
      ).rejects.toThrow('GitHub API error: 401 Unauthorized');
    });

    it('should throw error on GraphQL errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: 'Field not found' }]
        })
      });

      await expect(
        client.query('query { invalid }', {}, 'test-token')
      ).rejects.toThrow('GraphQL error: Field not found');
    });

    it('should throw error when no data is returned', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({})
      });

      await expect(
        client.query('query { repository { id } }', {}, 'test-token')
      ).rejects.toThrow('No data returned from GitHub API');
    });

    it('should use custom API URL and user agent', async () => {
      const customClient = new GraphQLClient(
        'https://custom.api.com/graphql',
        'CustomAgent'
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: { test: true } })
      });

      await customClient.query('query { test }', {}, 'test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/graphql',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'CustomAgent'
          })
        })
      );
    });

    it('should include Retry-After header in error message', async () => {
      // Create a client with no retries for this test
      const noRetryClient = new GraphQLClient(
        'https://api.github.com/graphql',
        'VSCode-GitHub-Discussions',
        { maxRetries: 0 }
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => name === 'Retry-After' ? '60' : null
        }
      });

      await expect(
        noRetryClient.query('query { test }', {}, 'test-token')
      ).rejects.toThrow('GitHub API error: 429 Too Many Requests Retry-After: 60');
    });
  });

  describe('retry with exponential backoff', () => {
    it('should retry on 5xx errors with exponential backoff', async () => {
      const mockData = { repository: { id: 'R_123' } };

      // First call fails with 503, second succeeds
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: { get: () => null }
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: mockData })
        });

      const queryPromise = client.query('query { repository { id } }', {}, 'test-token');

      // Advance timer to trigger retry (initial delay ~1000ms with jitter)
      await jest.advanceTimersByTimeAsync(1500);

      const result = await queryPromise;

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 rate limit errors', async () => {
      const mockData = { repository: { id: 'R_123' } };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: () => null }
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: mockData })
        });

      const queryPromise = client.query('query { repository { id } }', {}, 'test-token');

      await jest.advanceTimersByTimeAsync(1500);

      const result = await queryPromise;

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should respect Retry-After header for delay', async () => {
      const mockData = { repository: { id: 'R_123' } };

      // Return Retry-After: 5 (seconds)
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: (name: string) => name === 'Retry-After' ? '5' : null }
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: mockData })
        });

      const queryPromise = client.query('query { repository { id } }', {}, 'test-token');

      // Should wait for Retry-After (5000ms)
      await jest.advanceTimersByTimeAsync(5000);

      const result = await queryPromise;

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null }
      });

      await expect(
        client.query('query { repository { id } }', {}, 'test-token')
      ).rejects.toThrow('GitHub API error: 404 Not Found');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
      // Use real timers for this test since we need to wait for actual Promise resolution
      jest.useRealTimers();

      // Configure client with 2 retries and short delays for fast test
      const retryClient = new GraphQLClient(
        'https://api.github.com/graphql',
        'VSCode-GitHub-Discussions',
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50, jitterFactor: 0 }
      );

      // All calls fail with 503
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: { get: () => null }
      });

      await expect(
        retryClient.query('query { test }', {}, 'test-token')
      ).rejects.toThrow('GitHub API error: 503 Service Unavailable');

      // 1 initial + 2 retries = 3 calls
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should use custom options for backoff', async () => {
      const customClient = new GraphQLClient(
        'https://api.github.com/graphql',
        'VSCode-GitHub-Discussions',
        {
          maxRetries: 1,
          initialDelayMs: 500,
          maxDelayMs: 2000,
          jitterFactor: 0
        }
      );

      const mockData = { test: true };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: { get: () => null }
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: mockData })
        });

      const queryPromise = customClient.query('query { test }', {}, 'test-token');

      // With jitter=0 and initialDelay=500, first retry should be exactly at 500ms
      await jest.advanceTimersByTimeAsync(500);

      const result = await queryPromise;

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
