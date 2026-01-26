/**
 * Discussion File System Provider Tests - TDD
 * Requirements: 4.1, 4.2, 6.2, 4.3, 6.3
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { DiscussionFileSystemProvider } from '../providers/discussionFileSystemProvider';
import { GitHubService } from '../services/githubService';
import { CacheService } from '../services/cacheService';
import { Discussion, DiscussionSummary, DiscussionSummariesPage, DiscussionCategory, User } from '../models';

// Mock vscode FileType
const FileType = {
  File: 1,
  Directory: 2
};

describe('DiscussionFileSystemProvider', () => {
  let provider: DiscussionFileSystemProvider;
  let mockGitHubService: jest.Mocked<GitHubService>;
  let cacheService: CacheService;

  const mockUser: User = {
    id: '123',
    login: 'testuser',
    name: 'Test User',
    avatarUrl: 'https://github.com/testuser.png'
  };

  const mockCategory: DiscussionCategory = {
    id: 'C_1',
    name: 'General',
    description: 'General discussions',
    emoji: ':speech_balloon:',
    isAnswerable: false
  };

  const mockDiscussion: Discussion = {
    id: 'D_1',
    number: 1,
    title: 'TestDiscussion', // No spaces to avoid URL encoding issues in tests
    body: '# Hello World\n\nThis is a test discussion.',
    bodyHTML: '<h1>Hello World</h1><p>This is a test discussion.</p>',
    author: mockUser,
    category: mockCategory,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    isAnswered: false,
    comments: [],
    reactions: []
  };

  const mockDiscussionSummary: DiscussionSummary = {
    id: 'D_1',
    number: 1,
    title: 'TestDiscussion',
    url: 'https://github.com/owner/repo/discussions/1',
    author: mockUser,
    category: mockCategory,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    isAnswered: false,
    commentsCount: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGitHubService = {
      getRepositoryInfo: jest.fn().mockResolvedValue({
        id: 'R_123',
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo',
        hasDiscussionsEnabled: true
      }),
      getDiscussionSummaries: jest.fn().mockResolvedValue({
        discussions: [mockDiscussionSummary],
        pageInfo: { hasNextPage: false, endCursor: null }
      } as DiscussionSummariesPage),
      getDiscussion: jest.fn().mockResolvedValue(mockDiscussion),
      createDiscussion: jest.fn().mockResolvedValue(mockDiscussion),
      updateDiscussion: jest.fn().mockResolvedValue(mockDiscussion),
      getDiscussionCategories: jest.fn().mockResolvedValue([mockCategory]),
      addComment: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn()
    } as any;

    cacheService = new CacheService();
    provider = new DiscussionFileSystemProvider(mockGitHubService, cacheService);
  });

  afterEach(() => {
    provider.dispose();
  });

  describe('Unit Tests', () => {
    describe('URI scheme', () => {
      it('should use ghd:// scheme', () => {
        expect(DiscussionFileSystemProvider.scheme).toBe('ghd');
      });
    });

    describe('stat', () => {
      it('should return directory stat for root path', async () => {
        const uri = vscode.Uri.parse('ghd:///');
        const stat = await provider.stat(uri);

        expect(stat.type).toBe(FileType.Directory);
      });

      it('should return directory stat for discussion folder', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1');
        const stat = await provider.stat(uri);

        expect(stat.type).toBe(FileType.Directory);
      });

      it('should return file stat for discussion markdown file', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/TestDiscussion.md');
        const stat = await provider.stat(uri);

        expect(stat.type).toBe(FileType.File);
      });

      it('should return file stat for _metadata.json', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/_metadata.json');
        const stat = await provider.stat(uri);

        expect(stat.type).toBe(FileType.File);
      });

      it('should return file stat for _comments.json', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/_comments.json');
        const stat = await provider.stat(uri);

        expect(stat.type).toBe(FileType.File);
      });

      it('should throw FileNotFound for unknown paths', async () => {
        const uri = vscode.Uri.parse('ghd:///unknown/path');

        await expect(provider.stat(uri)).rejects.toThrow();
      });
    });

    describe('readDirectory', () => {
      it('should list discussions at root', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions');
        const entries = await provider.readDirectory(uri);

        expect(entries).toContainEqual(['1', FileType.Directory]);
      });

      it('should list files in discussion folder', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1');
        const entries = await provider.readDirectory(uri);

        expect(entries).toContainEqual(['TestDiscussion.md', FileType.File]);
        expect(entries).toContainEqual(['_metadata.json', FileType.File]);
        expect(entries).toContainEqual(['_comments.json', FileType.File]);
      });
    });

    describe('readFile', () => {
      it('should return markdown content for discussion file', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/TestDiscussion.md');
        const content = await provider.readFile(uri);
        const text = new TextDecoder().decode(content);

        // Body only (title is in filename)
        expect(text).toContain('# Hello World');
      });

      it('should return JSON for _metadata.json', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/_metadata.json');
        const content = await provider.readFile(uri);
        const text = new TextDecoder().decode(content);
        const metadata = JSON.parse(text);

        expect(metadata.id).toBe('D_1');
        expect(metadata.number).toBe(1);
        expect(metadata.title).toBe('TestDiscussion');
        expect(metadata.author.login).toBe('testuser');
      });

      it('should return JSON for _comments.json', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/_comments.json');
        const content = await provider.readFile(uri);
        const text = new TextDecoder().decode(content);
        const commentsData = JSON.parse(text);

        expect(commentsData).toHaveProperty('totalCount');
        expect(commentsData).toHaveProperty('comments');
        expect(Array.isArray(commentsData.comments)).toBe(true);
      });

      it('should throw for unknown files', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/unknown.txt');

        await expect(provider.readFile(uri)).rejects.toThrow();
      });
    });

    describe('writeFile', () => {
      it('should update discussion when saving markdown file', async () => {
        // Title is in filename now
        const uri = vscode.Uri.parse('ghd:///discussions/1/Updated%20Title.md');
        const newContent = new TextEncoder().encode('Updated body content');

        await provider.writeFile(uri, newContent, { create: false, overwrite: true });

        expect(mockGitHubService.updateDiscussion).toHaveBeenCalledWith(
          'D_1',
          expect.objectContaining({
            title: 'Updated Title',
            body: 'Updated body content'
          })
        );
      });

      it('should create new discussion when saving to new path', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/new/New%20Discussion.md');
        const newContent = new TextEncoder().encode('New body');

        // Set pending category (as extension.ts does)
        provider.setPendingCategory(uri.path, 'C_1');

        mockGitHubService.createDiscussion.mockResolvedValue({
          ...mockDiscussion,
          id: 'D_new',
          number: 2,
          title: 'New Discussion',
          body: 'New body'
        });

        await provider.writeFile(uri, newContent, { create: true, overwrite: false });

        expect(mockGitHubService.createDiscussion).toHaveBeenCalledWith({
          repositoryId: 'R_123',
          categoryId: 'C_1',
          title: 'New Discussion',
          body: 'New body'
        });
      });

      it('should fire onDidChangeFile event after write', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/Test.md');
        const newContent = new TextEncoder().encode('Body');

        // Access the internal emitter's fire method
        const fireMethod = (provider as any)._onDidChangeFile.fire;

        await provider.writeFile(uri, newContent, { create: false, overwrite: true });

        // Verify fire was called
        expect(fireMethod).toHaveBeenCalled();
      });

      it('should show progress notification while saving', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1/Test.md');
        const newContent = new TextEncoder().encode('Body');

        await provider.writeFile(uri, newContent, { create: false, overwrite: true });

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
          expect.objectContaining({
            location: vscode.ProgressLocation.Notification,
            title: 'Saving discussion to GitHub...',
            cancellable: false
          }),
          expect.any(Function)
        );
      });

      it('should show progress notification when creating new discussion', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/new/New%20Discussion.md');
        const newContent = new TextEncoder().encode('New body');

        provider.setPendingCategory(uri.path, 'C_1');

        mockGitHubService.createDiscussion.mockResolvedValue({
          ...mockDiscussion,
          id: 'D_new',
          number: 2,
          title: 'New Discussion',
          body: 'New body'
        });

        await provider.writeFile(uri, newContent, { create: true, overwrite: false });

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
          expect.objectContaining({
            location: vscode.ProgressLocation.Notification,
            title: 'Saving discussion to GitHub...'
          }),
          expect.any(Function)
        );
      });
    });

    describe('createDirectory', () => {
      it('should create discussion folder for new discussions', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/new');

        await expect(
          provider.createDirectory(uri)
        ).resolves.not.toThrow();
      });
    });

    describe('delete', () => {
      it('should throw for delete operations (not supported)', async () => {
        const uri = vscode.Uri.parse('ghd:///discussions/1');

        await expect(
          provider.delete(uri, { recursive: false })
        ).rejects.toThrow();
      });
    });

    describe('rename', () => {
      it('should throw for rename operations (not supported)', async () => {
        const oldUri = vscode.Uri.parse('ghd:///discussions/1');
        const newUri = vscode.Uri.parse('ghd:///discussions/2');

        await expect(
          provider.rename(oldUri, newUri, { overwrite: false })
        ).rejects.toThrow();
      });
    });

    describe('cache invalidation', () => {
      it('should invalidate cache for a specific discussion', async () => {
        // First read to populate cache - use URL-encoded filename
        const uri = vscode.Uri.parse('ghd:///discussions/1/TestDiscussion.md');
        await provider.readFile(uri);
        expect(mockGitHubService.getDiscussion).toHaveBeenCalledTimes(1);

        // Second read should use cache
        await provider.readFile(uri);
        expect(mockGitHubService.getDiscussion).toHaveBeenCalledTimes(1);

        // Invalidate cache
        provider.invalidateCache(1);

        // Third read should fetch again
        await provider.readFile(uri);
        expect(mockGitHubService.getDiscussion).toHaveBeenCalledTimes(2);
      });

      it('should invalidate all cache when no argument provided', async () => {
        const mockDiscussion2: Discussion = {
          ...mockDiscussion,
          id: 'D_2',
          number: 2,
          title: 'TestDiscussion2'
        };

        mockGitHubService.getDiscussion
          .mockResolvedValueOnce(mockDiscussion)
          .mockResolvedValueOnce(mockDiscussion2)
          .mockResolvedValueOnce(mockDiscussion)
          .mockResolvedValueOnce(mockDiscussion2);

        // Read two discussions
        await provider.readFile(vscode.Uri.parse('ghd:///discussions/1/TestDiscussion.md'));
        await provider.readFile(vscode.Uri.parse('ghd:///discussions/2/TestDiscussion2.md'));
        expect(mockGitHubService.getDiscussion).toHaveBeenCalledTimes(2);

        // Invalidate all cache
        provider.invalidateCache();

        // Both should fetch again
        await provider.readFile(vscode.Uri.parse('ghd:///discussions/1/TestDiscussion.md'));
        await provider.readFile(vscode.Uri.parse('ghd:///discussions/2/TestDiscussion2.md'));
        expect(mockGitHubService.getDiscussion).toHaveBeenCalledTimes(4);
      });
    });

    describe('notifyDiscussionsUpdated', () => {
      it('should fire change events for cached discussions', async () => {
        // Access the internal EventEmitter
        const internalEmitter = (provider as any)._onDidChangeFile;
        const fireSpy = jest.spyOn(internalEmitter, 'fire');

        // Populate cache
        await provider.readFile(vscode.Uri.parse('ghd:///discussions/1/TestDiscussion.md'));

        // Reset the spy to only capture notifyDiscussionsUpdated events
        fireSpy.mockClear();

        // Notify update
        provider.notifyDiscussionsUpdated();

        // Should have called fire with change events
        expect(fireSpy).toHaveBeenCalled();
        expect(fireSpy).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: expect.any(Number),
              uri: expect.anything()
            })
          ])
        );
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property 6: Virtual File System Operation Correctness
     * Validates: Requirements 4.1, 4.2, 6.2
     */
    it('should correctly parse discussion paths', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 99999 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 1, maxLength: 20 }),
        (discussionNumber, title) => {
          const fileName = encodeURIComponent(`${title}.md`);
          const uri = vscode.Uri.parse(`ghd:///discussions/${discussionNumber}/${fileName}`);

          // Parse the path
          const pathParts = uri.path.split('/').filter(Boolean);

          expect(pathParts[0]).toBe('discussions');
          expect(pathParts[1]).toBe(discussionNumber.toString());
          expect(pathParts[2]).toBe(`${title}.md`);
        }
      ), { numRuns: 100 });
    });

    /**
     * Property 12: Discussion Round-Trip Integrity
     * Reading a file, modifying it, and saving should preserve non-modified content
     * Validates: Requirement 6.3
     */
    it('should preserve content integrity through read-modify-write cycle', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          // Generate simple titles: alphanumeric only (no spaces to avoid URL encoding issues)
          title: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 1, maxLength: 50 }),
          body: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'), { minLength: 1, maxLength: 100 })
        }),
        async ({ title, body }) => {
          // Create fresh mock service for each iteration
          const freshMockGitHubService = {
            getRepositoryInfo: jest.fn().mockResolvedValue({
              id: 'R_123',
              owner: 'owner',
              name: 'repo',
              fullName: 'owner/repo',
              hasDiscussionsEnabled: true
            }),
            getDiscussions: jest.fn().mockResolvedValue([mockDiscussion]),
            getDiscussion: jest.fn(),
            createDiscussion: jest.fn(),
            updateDiscussion: jest.fn(),
            getDiscussionCategories: jest.fn().mockResolvedValue([mockCategory]),
            addComment: jest.fn(),
            dispose: jest.fn()
          } as any;

          // Create a discussion with test data
          const testDiscussion: Discussion = {
            ...mockDiscussion,
            title,
            body
          };

          freshMockGitHubService.getDiscussion.mockResolvedValue(testDiscussion);
          freshMockGitHubService.updateDiscussion.mockResolvedValue(testDiscussion);

          const testProvider = new DiscussionFileSystemProvider(freshMockGitHubService);

          try {
            // Read the file using title as filename (no spaces, no encoding needed)
            const uri = vscode.Uri.parse(`ghd:///discussions/1/${title}.md`);
            const content = await testProvider.readFile(uri);
            const text = new TextDecoder().decode(content);

            // Verify body is in the content (title is in filename now)
            expect(text).toContain(body);

            // Write back (simulating save without changes)
            await testProvider.writeFile(uri, content, { create: false, overwrite: true });

            // Verify updateDiscussion was called with preserved content
            // Note: body is trimmed in writeFile
            expect(freshMockGitHubService.updateDiscussion).toHaveBeenCalledWith(
              'D_1',
              expect.objectContaining({
                title,
                body: body.trim()
              })
            );
          } finally {
            testProvider.dispose();
          }
        }
      ), { numRuns: 20 });
    });
  });
});
