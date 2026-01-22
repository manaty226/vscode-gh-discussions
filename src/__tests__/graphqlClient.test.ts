/**
 * GraphQL Client Tests
 * Requirements: 9.1, 9.3, 9.5 - Infrastructure layer extraction
 */

import { GraphQLClient } from '../infrastructure/graphqlClient';

// Mock fetch globally
global.fetch = jest.fn();

describe('GraphQLClient', () => {
  let client: GraphQLClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new GraphQLClient();
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
        statusText: 'Unauthorized'
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
  });
});
