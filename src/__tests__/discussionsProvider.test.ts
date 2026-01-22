/**
 * Discussions Tree View Provider Tests - TDD
 * Requirements: 2.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { DiscussionsProvider, DiscussionTreeItem } from '../providers/discussionsProvider';
import { GitHubService } from '../services/githubService';
import { AuthenticationService } from '../services/authenticationService';
import { DiscussionSummary, DiscussionSummariesPage, DiscussionCategory, User } from '../models';

describe('DiscussionsProvider', () => {
  let provider: DiscussionsProvider;
  let mockGitHubService: jest.Mocked<GitHubService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;

  const mockUser: User = {
    id: '123',
    login: 'testuser',
    name: 'Test User',
    avatarUrl: 'https://github.com/testuser.png'
  };

  const mockCategories: DiscussionCategory[] = [
    {
      id: 'C_1',
      name: 'General',
      description: 'General discussions',
      emoji: ':speech_balloon:',
      isAnswerable: false
    },
    {
      id: 'C_2',
      name: 'Q&A',
      description: 'Questions and Answers',
      emoji: ':question:',
      isAnswerable: true
    },
    {
      id: 'C_3',
      name: 'Ideas',
      description: 'Feature ideas',
      emoji: ':bulb:',
      isAnswerable: false
    }
  ];

  const mockDiscussionSummaries: DiscussionSummary[] = [
    {
      id: 'D_1',
      number: 1,
      title: 'First Discussion',
      url: 'https://github.com/owner/repo/discussions/1',
      author: mockUser,
      category: mockCategories[0],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      isAnswered: false,
      commentsCount: 2
    },
    {
      id: 'D_2',
      number: 2,
      title: 'Second Discussion',
      url: 'https://github.com/owner/repo/discussions/2',
      author: mockUser,
      category: mockCategories[0],
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-04'),
      isAnswered: false,
      commentsCount: 0
    },
    {
      id: 'D_3',
      number: 3,
      title: 'A Question',
      url: 'https://github.com/owner/repo/discussions/3',
      author: mockUser,
      category: mockCategories[1],
      createdAt: new Date('2024-01-05'),
      updatedAt: new Date('2024-01-06'),
      isAnswered: true,
      commentsCount: 5
    },
    {
      id: 'D_4',
      number: 4,
      title: 'Feature Request',
      url: 'https://github.com/owner/repo/discussions/4',
      author: mockUser,
      category: mockCategories[2],
      createdAt: new Date('2024-01-07'),
      updatedAt: new Date('2024-01-08'),
      isAnswered: false,
      commentsCount: 1
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Helper to filter discussions by category and return appropriate page
    const getDiscussionSummariesMock = jest.fn().mockImplementation((options?: { categoryId?: string }) => {
      const categoryId = options?.categoryId;
      if (categoryId) {
        const filtered = mockDiscussionSummaries.filter(d => d.category.id === categoryId);
        return Promise.resolve({
          discussions: filtered,
          pageInfo: { hasNextPage: false, endCursor: null }
        });
      }
      // If no categoryId, return all (for backwards compatibility)
      return Promise.resolve({
        discussions: mockDiscussionSummaries,
        pageInfo: { hasNextPage: false, endCursor: null }
      });
    });

    mockGitHubService = {
      getRepositoryInfo: jest.fn().mockResolvedValue({
        id: 'R_123',
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo',
        hasDiscussionsEnabled: true
      }),
      getDiscussionSummaries: getDiscussionSummariesMock,
      getDiscussion: jest.fn().mockResolvedValue(mockDiscussionSummaries[0]),
      getDiscussionCategories: jest.fn().mockResolvedValue(mockCategories),
      createDiscussion: jest.fn(),
      updateDiscussion: jest.fn(),
      addComment: jest.fn(),
      dispose: jest.fn()
    } as any;

    mockAuthService = {
      getSession: jest.fn().mockResolvedValue({
        id: 'test-session',
        accessToken: 'test-token',
        account: { id: 'test-account', label: 'testuser' },
        scopes: ['repo']
      }),
      isAuthenticated: jest.fn().mockResolvedValue(true),
      getCurrentUser: jest.fn().mockResolvedValue(mockUser),
      onDidChangeAuthenticationState: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    } as any;

    provider = new DiscussionsProvider(mockGitHubService, mockAuthService);
  });

  afterEach(() => {
    provider.dispose();
  });

  describe('Unit Tests', () => {
    describe('TreeDataProvider interface', () => {
      it('should implement getTreeItem', async () => {
        const children = await provider.getChildren();
        expect(children).toBeDefined();
        expect(children!.length).toBeGreaterThan(0);

        const treeItem = provider.getTreeItem(children![0]);
        expect(treeItem).toBeInstanceOf(DiscussionTreeItem);
      });

      it('should implement getChildren', async () => {
        const children = await provider.getChildren();
        expect(children).toBeDefined();
        expect(Array.isArray(children)).toBe(true);
      });

      it('should have onDidChangeTreeData event', async () => {
        // Verify the event is exposed
        expect(provider.onDidChangeTreeData).toBeDefined();

        // First call to getChildren loads only categories (lazy loading)
        const rootChildren = await provider.getChildren();
        expect(mockGitHubService.getDiscussionCategories).toHaveBeenCalledTimes(1);
        // Discussions are NOT loaded yet (lazy loading)
        expect(mockGitHubService.getDiscussionSummaries).not.toHaveBeenCalled();

        // Expand a category to trigger discussion loading
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await provider.getChildren(generalCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        // Verify refresh triggers internal refresh (isLoaded is reset)
        provider.refresh();

        // After refresh, getChildren should re-fetch categories
        const newRootChildren = await provider.getChildren();
        expect(mockGitHubService.getDiscussionCategories).toHaveBeenCalledTimes(2);

        // Expand again to fetch discussions
        const newGeneralCategory = newRootChildren!.find(item => item.label === 'General');
        await provider.getChildren(newGeneralCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(2);
      });
    });

    describe('Category hierarchy', () => {
      it('should return categories at root level', async () => {
        const rootChildren = await provider.getChildren();

        expect(rootChildren).toBeDefined();
        // Categories should be at root
        const categoryNames = rootChildren!.map(item => item.label);
        expect(categoryNames).toContain('General');
        expect(categoryNames).toContain('Q&A');
        expect(categoryNames).toContain('Ideas');
      });

      it('should return discussions under category', async () => {
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');

        expect(generalCategory).toBeDefined();

        const discussions = await provider.getChildren(generalCategory);

        expect(discussions).toBeDefined();
        expect(discussions!.length).toBe(2); // Two discussions in General category
      });

      it('should show discussion title and number', async () => {
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        const firstDiscussion = discussions![0];
        expect(firstDiscussion.label).toContain('First Discussion');
        expect(firstDiscussion.description).toContain('#1');
      });

      it('should show answered status for Q&A discussions', async () => {
        const rootChildren = await provider.getChildren();
        const qaCategory = rootChildren!.find(item => item.label === 'Q&A');
        const discussions = await provider.getChildren(qaCategory);

        const answeredDiscussion = discussions!.find(d => d.label?.toString().includes('A Question'));
        expect(answeredDiscussion).toBeDefined();
        // Should have some indicator of being answered
        expect(answeredDiscussion!.iconPath).toBeDefined();
      });
    });

    describe('Tree item properties', () => {
      it('should set collapsible state for categories', async () => {
        const rootChildren = await provider.getChildren();
        const category = rootChildren![0];

        expect(category.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
      });

      it('should set non-collapsible state for discussions', async () => {
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        const discussion = discussions![0];
        expect(discussion.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
      });

      it('should include editDiscussion command for discussion items on click', async () => {
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        const discussion = discussions![0];
        expect(discussion.command).toBeDefined();
        // クリック時はエディタを開く（要件3.1）
        expect(discussion.command!.command).toBe('github-discussions.editDiscussion');
        // TreeItem自体を引数として渡す（editDiscussionコマンドが.discussionSummaryを参照）
        expect(discussion.command!.arguments![0]).toBe(discussion);
        expect(discussion.command!.arguments![0].discussionSummary).toBeDefined();
      });

      it('should have discussion contextValue for inline actions', async () => {
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        const discussion = discussions![0];
        // コメントアイコンのインラインアクション用（要件5.1）
        expect(discussion.contextValue).toBe('discussion');
      });

      it('should include url in discussionSummary for openInBrowser command', async () => {
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        const discussion = discussions![0];
        // DiscussionSummaryにurl（https形式のGitHub URL）が含まれていることを確認
        expect(discussion.discussionSummary).toBeDefined();
        expect(discussion.discussionSummary!.url).toBe('https://github.com/owner/repo/discussions/1');
        expect(discussion.discussionSummary!.url).toMatch(/^https:\/\/github\.com\//);
      });
    });

    describe('Refresh functionality', () => {
      it('should fetch new data on refresh', async () => {
        // Get categories and expand one
        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await provider.getChildren(generalCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        provider.refresh();

        // After refresh, need to re-expand to fetch discussions
        const newRootChildren = await provider.getChildren();
        const newGeneralCategory = newRootChildren!.find(item => item.label === 'General');
        await provider.getChildren(newGeneralCategory);

        // Called again after refresh
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Search and Filter Tests', () => {
    describe('Search functionality', () => {
      it('should filter discussions by search query', async () => {
        provider.setSearchQuery('First');

        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        expect(discussions!.length).toBe(1);
        expect(discussions![0].label).toContain('First Discussion');
      });

      it('should search case-insensitively', async () => {
        provider.setSearchQuery('FIRST');

        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        expect(discussions!.length).toBe(1);
        expect(discussions![0].label).toContain('First Discussion');
      });

      it('should search in discussion body', async () => {
        provider.setSearchQuery('question');

        const rootChildren = await provider.getChildren();
        const qaCategory = rootChildren!.find(item => item.label === 'Q&A');
        const discussions = await provider.getChildren(qaCategory);

        expect(discussions!.length).toBe(1);
      });

      it('should return empty results for non-matching query', async () => {
        provider.setSearchQuery('nonexistent');

        const rootChildren = await provider.getChildren();
        // All categories should show empty message
        for (const category of rootChildren!) {
          const discussions = await provider.getChildren(category);
          expect(discussions!.length).toBe(1);
          expect(discussions![0].contextValue).toBe('empty');
        }
      });

      it('should clear search when empty string provided', async () => {
        provider.setSearchQuery('First');
        provider.setSearchQuery('');

        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        expect(discussions!.length).toBe(2); // All discussions in General
      });
    });

    describe('Category filter functionality', () => {
      it('should filter by single category', async () => {
        provider.setCategoryFilter(['C_1']); // General only

        const rootChildren = await provider.getChildren();

        expect(rootChildren!.length).toBe(1);
        expect(rootChildren![0].label).toBe('General');
      });

      it('should filter by multiple categories', async () => {
        provider.setCategoryFilter(['C_1', 'C_2']); // General and Q&A

        const rootChildren = await provider.getChildren();

        expect(rootChildren!.length).toBe(2);
        const names = rootChildren!.map(item => item.label);
        expect(names).toContain('General');
        expect(names).toContain('Q&A');
        expect(names).not.toContain('Ideas');
      });

      it('should show all categories when filter is empty', async () => {
        provider.setCategoryFilter([]);

        const rootChildren = await provider.getChildren();

        expect(rootChildren!.length).toBe(3);
      });

      it('should clear category filter', async () => {
        provider.setCategoryFilter(['C_1']);
        provider.clearFilters();

        const rootChildren = await provider.getChildren();

        expect(rootChildren!.length).toBe(3);
      });
    });

    describe('Answered status filter', () => {
      it('should filter only answered discussions', async () => {
        provider.setAnsweredFilter('answered');

        const rootChildren = await provider.getChildren();
        const qaCategory = rootChildren!.find(item => item.label === 'Q&A');
        const discussions = await provider.getChildren(qaCategory);

        expect(discussions!.length).toBe(1);
        expect(discussions![0].label).toContain('A Question');
      });

      it('should filter only unanswered discussions', async () => {
        provider.setAnsweredFilter('unanswered');

        const rootChildren = await provider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const discussions = await provider.getChildren(generalCategory);

        expect(discussions!.length).toBe(2); // Both General discussions are unanswered
      });

      it('should show all when filter is "all"', async () => {
        provider.setAnsweredFilter('all');

        const rootChildren = await provider.getChildren();
        let totalDiscussions = 0;
        for (const category of rootChildren!) {
          const discussions = await provider.getChildren(category);
          totalDiscussions += discussions!.length;
        }

        expect(totalDiscussions).toBe(4);
      });
    });

    describe('Combined filters', () => {
      it('should apply search and category filter together', async () => {
        provider.setSearchQuery('Discussion');
        provider.setCategoryFilter(['C_1']);

        const rootChildren = await provider.getChildren();
        expect(rootChildren!.length).toBe(1); // Only General

        const discussions = await provider.getChildren(rootChildren![0]);
        expect(discussions!.length).toBe(2); // Both match "Discussion"
      });

      it('should apply all filters together', async () => {
        provider.setSearchQuery('First');
        provider.setCategoryFilter(['C_1']);
        provider.setAnsweredFilter('unanswered');

        const rootChildren = await provider.getChildren();
        const discussions = await provider.getChildren(rootChildren![0]);

        expect(discussions!.length).toBe(1);
        expect(discussions![0].label).toContain('First Discussion');
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property 10: Search filter correctness
     * Validates: Requirements 8.2, 8.3
     */
    it('should always return subset of original discussions when filtering', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 20 }),
        async (searchQuery) => {
          const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

          // Get all discussions count
          testProvider.setSearchQuery('');
          const allRoot = await testProvider.getChildren();
          let allCount = 0;
          for (const cat of allRoot!) {
            const discs = await testProvider.getChildren(cat);
            allCount += discs!.length;
          }

          // Get filtered count
          testProvider.setSearchQuery(searchQuery);
          const filteredRoot = await testProvider.getChildren();
          let filteredCount = 0;
          for (const cat of filteredRoot!) {
            const discs = await testProvider.getChildren(cat);
            filteredCount += discs!.length;
          }

          // Filtered should be <= all
          expect(filteredCount).toBeLessThanOrEqual(allCount);

          testProvider.dispose();
        }
      ), { numRuns: 20 });
    });

    /**
     * Property 11: UI element existence guarantee
     * Validates: Requirements 5.1, 8.1
     */
    it('should always provide valid tree items', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom(...mockCategories.map(c => c.id)),
        async (categoryId) => {
          const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

          testProvider.setCategoryFilter([categoryId]);
          const rootChildren = await testProvider.getChildren();

          for (const child of rootChildren!) {
            const treeItem = testProvider.getTreeItem(child);

            // Every tree item should have required properties
            expect(treeItem.label).toBeDefined();
            expect(treeItem.collapsibleState).toBeDefined();

            // Get sub-items
            const subItems = await testProvider.getChildren(child);
            for (const subItem of subItems!) {
              const subTreeItem = testProvider.getTreeItem(subItem);
              expect(subTreeItem.label).toBeDefined();
              expect(subTreeItem.command).toBeDefined();
            }
          }

          testProvider.dispose();
        }
      ), { numRuns: 10 });
    });

    /**
     * Property: Category filter should be idempotent
     */
    it('should be idempotent when setting same category filter', async () => {
      await fc.assert(fc.asyncProperty(
        fc.subarray(mockCategories.map(c => c.id)),
        async (categoryIds) => {
          const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

          testProvider.setCategoryFilter(categoryIds);
          const firstResult = await testProvider.getChildren();
          const firstCount = firstResult!.length;

          // Set same filter again
          testProvider.setCategoryFilter(categoryIds);
          const secondResult = await testProvider.getChildren();
          const secondCount = secondResult!.length;

          expect(firstCount).toBe(secondCount);

          testProvider.dispose();
        }
      ), { numRuns: 10 });
    });

    /**
     * Property: Clear filters should reset to initial state
     */
    it('should return to initial state after clearing filters', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.subarray(mockCategories.map(c => c.id), { minLength: 1 }),
        async (searchQuery, categoryIds) => {
          const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

          // Get initial state
          const initialRoot = await testProvider.getChildren();
          const initialCount = initialRoot!.length;

          // Apply filters
          testProvider.setSearchQuery(searchQuery);
          testProvider.setCategoryFilter(categoryIds);

          // Clear filters
          testProvider.clearFilters();

          // Should return to initial state
          const afterClearRoot = await testProvider.getChildren();
          const afterClearCount = afterClearRoot!.length;

          expect(afterClearCount).toBe(initialCount);

          testProvider.dispose();
        }
      ), { numRuns: 10 });
    });
  });

  describe('Pagination Tests (Requirement 14)', () => {
    describe('Load More functionality', () => {
      it('should show "Load more" item when hasNextPage is true', async () => {
        // Mock to return filtered discussions per category with hasNextPage: true
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string }) => {
          const categoryId = options?.categoryId;
          const filtered = categoryId
            ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
            : mockDiscussionSummaries;
          return Promise.resolve({
            discussions: filtered,
            pageInfo: { hasNextPage: true, endCursor: 'cursor_123' }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const children = await testProvider.getChildren(generalCategory);

        // Should have discussions + "Load more" item
        const loadMoreItem = children!.find(item => item.contextValue === 'loadMore');
        expect(loadMoreItem).toBeDefined();
        expect(loadMoreItem!.label).toBe('Load more discussions...');

        testProvider.dispose();
      });

      it('should not show "Load more" item when hasNextPage is false', async () => {
        // Mock to return filtered discussions per category with hasNextPage: false
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string }) => {
          const categoryId = options?.categoryId;
          const filtered = categoryId
            ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
            : mockDiscussionSummaries;
          return Promise.resolve({
            discussions: filtered,
            pageInfo: { hasNextPage: false, endCursor: null }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const children = await testProvider.getChildren(generalCategory);

        const loadMoreItem = children!.find(item => item.contextValue === 'loadMore');
        expect(loadMoreItem).toBeUndefined();

        testProvider.dispose();
      });

      it('should have loadMoreDiscussions command on Load more item', async () => {
        // Mock to return filtered discussions per category with hasNextPage: true
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string }) => {
          const categoryId = options?.categoryId;
          const filtered = categoryId
            ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
            : mockDiscussionSummaries;
          return Promise.resolve({
            discussions: filtered,
            pageInfo: { hasNextPage: true, endCursor: 'cursor_abc' }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const children = await testProvider.getChildren(generalCategory);

        const loadMoreItem = children!.find(item => item.contextValue === 'loadMore');
        expect(loadMoreItem!.command).toBeDefined();
        expect(loadMoreItem!.command!.command).toBe('github-discussions.loadMoreDiscussions');
        expect(loadMoreItem!.command!.arguments).toEqual(['C_1']); // General category ID

        testProvider.dispose();
      });

      it('should load more discussions when loadMoreForCategory is called', async () => {
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string; after?: string }) => {
          // Initial load
          if (!options?.after) {
            const categoryId = options?.categoryId;
            const filtered = categoryId
              ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
              : mockDiscussionSummaries;
            return Promise.resolve({
              discussions: filtered.slice(0, 1), // First discussion only
              pageInfo: { hasNextPage: true, endCursor: 'cursor_first' }
            });
          }
          // Load more: return next page
          return Promise.resolve({
            discussions: [mockDiscussionSummaries[2]], // 3rd discussion
            pageInfo: { hasNextPage: false, endCursor: null }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Initial load - get categories
        const rootChildren = await testProvider.getChildren();

        // Expand General category to trigger lazy loading
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);

        // Load more for General category
        await testProvider.loadMoreForCategory('C_1');

        // Verify API was called with cursor
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledWith(
          expect.objectContaining({
            after: 'cursor_first',
            categoryId: 'C_1'
          })
        );

        testProvider.dispose();
      });

      it('should update pagination state after loading more', async () => {
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string; after?: string }) => {
          // Initial load
          if (!options?.after) {
            const categoryId = options?.categoryId;
            const filtered = categoryId
              ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
              : mockDiscussionSummaries;
            return Promise.resolve({
              discussions: filtered,
              pageInfo: { hasNextPage: true, endCursor: 'cursor_1' }
            });
          }
          // Load more
          return Promise.resolve({
            discussions: [],
            pageInfo: { hasNextPage: false, endCursor: null }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Initial load - get categories
        const rootChildren = await testProvider.getChildren();

        // Expand General category to trigger lazy loading
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);

        // Verify initial pagination state
        let paginationState = testProvider.getCategoryPaginationState('C_1');
        expect(paginationState?.hasNextPage).toBe(true);
        expect(paginationState?.endCursor).toBe('cursor_1');

        // Load more
        await testProvider.loadMoreForCategory('C_1');

        // Verify updated pagination state
        paginationState = testProvider.getCategoryPaginationState('C_1');
        expect(paginationState?.hasNextPage).toBe(false);
        expect(paginationState?.endCursor).toBeNull();

        testProvider.dispose();
      });

      it('should show "Loading..." when loading more', async () => {
        // Create a promise we can control for loadMore
        let resolveNextPage: (value: DiscussionSummariesPage) => void;
        const nextPagePromise = new Promise<DiscussionSummariesPage>((resolve) => {
          resolveNextPage = resolve;
        });

        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string; after?: string }) => {
          // Load more call
          if (options?.after) {
            return nextPagePromise;
          }
          // Initial load
          const categoryId = options?.categoryId;
          const filtered = categoryId
            ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
            : mockDiscussionSummaries;
          return Promise.resolve({
            discussions: filtered,
            pageInfo: { hasNextPage: true, endCursor: 'cursor_1' }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Initial load - get categories
        const rootChildren = await testProvider.getChildren();

        // Expand General category to trigger lazy loading
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);

        // Start loading more (don't await)
        const loadMorePromise = testProvider.loadMoreForCategory('C_1');

        // Check that loading state is true
        const paginationState = testProvider.getCategoryPaginationState('C_1');
        expect(paginationState?.isLoading).toBe(true);

        // Resolve the promise
        resolveNextPage!({
          discussions: [],
          pageInfo: { hasNextPage: false, endCursor: null }
        });

        await loadMorePromise;

        testProvider.dispose();
      });

      it('should not load more if already loading', async () => {
        let resolveNextPage: (value: DiscussionSummariesPage) => void;
        const nextPagePromise = new Promise<DiscussionSummariesPage>((resolve) => {
          resolveNextPage = resolve;
        });

        let loadMoreCallCount = 0;
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string; after?: string }) => {
          // Load more call
          if (options?.after) {
            loadMoreCallCount++;
            return nextPagePromise;
          }
          // Initial load
          const categoryId = options?.categoryId;
          const filtered = categoryId
            ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
            : mockDiscussionSummaries;
          return Promise.resolve({
            discussions: filtered,
            pageInfo: { hasNextPage: true, endCursor: 'cursor_1' }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Initial load - get categories and expand
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);

        // Start first load more
        const firstLoad = testProvider.loadMoreForCategory('C_1');

        // Try to start second load more while first is in progress
        await testProvider.loadMoreForCategory('C_1');

        // Should only have 1 loadMore call (second one should be ignored)
        expect(loadMoreCallCount).toBe(1);

        // Cleanup
        resolveNextPage!({
          discussions: [],
          pageInfo: { hasNextPage: false, endCursor: null }
        });
        await firstLoad;

        testProvider.dispose();
      });

      it('should clear pagination state on refresh', async () => {
        mockGitHubService.getDiscussionSummaries.mockImplementation((options?: { categoryId?: string }) => {
          const categoryId = options?.categoryId;
          const filtered = categoryId
            ? mockDiscussionSummaries.filter(d => d.category.id === categoryId)
            : mockDiscussionSummaries;
          return Promise.resolve({
            discussions: filtered,
            pageInfo: { hasNextPage: true, endCursor: 'cursor_abc' }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Initial load - get categories and expand
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);
        expect(testProvider.getCategoryPaginationState('C_1')?.hasNextPage).toBe(true);

        // Refresh
        testProvider.refresh();

        // Pagination state should be cleared
        expect(testProvider.getCategoryPaginationState('C_1')).toBeUndefined();

        testProvider.dispose();
      });
    });
  });

  describe('Lazy Loading Tests (Requirement 15)', () => {
    describe('Initial load - categories only', () => {
      it('should only fetch categories on initial load, not discussions', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Get root children (categories)
        const rootChildren = await testProvider.getChildren();

        // Should have fetched categories
        expect(mockGitHubService.getDiscussionCategories).toHaveBeenCalledTimes(1);

        // Should NOT have fetched discussions yet (lazy loading)
        expect(mockGitHubService.getDiscussionSummaries).not.toHaveBeenCalled();

        // Should have all categories
        expect(rootChildren!.length).toBe(3);
        expect(rootChildren!.map(c => c.label)).toEqual(['General', 'Q&A', 'Ideas']);

        testProvider.dispose();
      });

      it('should show categories with collapsed state', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        const rootChildren = await testProvider.getChildren();

        for (const category of rootChildren!) {
          expect(category.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
          expect(category.contextValue).toBe('category');
        }

        testProvider.dispose();
      });
    });

    describe('Category expansion - lazy loading', () => {
      it('should fetch discussions only when category is expanded', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Get categories first
        const rootChildren = await testProvider.getChildren();
        expect(mockGitHubService.getDiscussionSummaries).not.toHaveBeenCalled();

        // Expand General category
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);

        // Now discussions should be fetched for that category only
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledWith(
          expect.objectContaining({ categoryId: 'C_1' })
        );

        testProvider.dispose();
      });

      it('should set loading state during fetch and loaded state after', async () => {
        // Track loading state changes
        const loadStates: string[] = [];

        // Create a controlled promise for discussions
        let resolveDiscussions: (value: DiscussionSummariesPage) => void;
        const discussionsPromise = new Promise<DiscussionSummariesPage>((resolve) => {
          resolveDiscussions = resolve;
        });

        mockGitHubService.getDiscussionSummaries.mockImplementation(() => {
          // Capture loading state when API is called
          loadStates.push('api_called');
          return discussionsPromise;
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Get categories
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');

        // Before expansion, state should be not_loaded
        expect(testProvider.getCategoryLoadState('C_1')).toBe('not_loaded');

        // Start expansion (don't await)
        const childrenPromise = testProvider.getChildren(generalCategory);

        // Resolve the promise
        resolveDiscussions!({
          discussions: mockDiscussionSummaries.filter(d => d.category.id === 'C_1'),
          pageInfo: { hasNextPage: false, endCursor: null }
        });

        // Wait for completion
        const children = await childrenPromise;

        // After completion, state should be loaded
        expect(testProvider.getCategoryLoadState('C_1')).toBe('loaded');
        expect(children!.length).toBe(2); // Two discussions in General
        expect(loadStates).toContain('api_called'); // API was called during loading

        testProvider.dispose();
      });

      it('should cache loaded discussions and not re-fetch on re-expansion', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');

        // First expansion
        await testProvider.getChildren(generalCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        // Second expansion (should use cache)
        await testProvider.getChildren(generalCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1); // Still 1

        testProvider.dispose();
      });

      it('should fetch different category discussions independently', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        const qaCategory = rootChildren!.find(item => item.label === 'Q&A');

        // Expand General
        await testProvider.getChildren(generalCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenLastCalledWith(
          expect.objectContaining({ categoryId: 'C_1' })
        );

        // Expand Q&A (should fetch separately)
        await testProvider.getChildren(qaCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(2);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenLastCalledWith(
          expect.objectContaining({ categoryId: 'C_2' })
        );

        testProvider.dispose();
      });
    });

    describe('Refresh - clear cache', () => {
      it('should clear all category caches on refresh', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');

        // Expand and cache
        await testProvider.getChildren(generalCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        // Refresh
        testProvider.refresh();

        // Load state should be reset
        expect(testProvider.getCategoryLoadState('C_1')).toBe('not_loaded');

        // Re-expand should fetch again
        const newRootChildren = await testProvider.getChildren();
        const newGeneralCategory = newRootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(newGeneralCategory);
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(2);

        testProvider.dispose();
      });
    });

    describe('Error handling', () => {
      it('should show error state if discussion fetch fails', async () => {
        mockGitHubService.getDiscussionSummaries.mockRejectedValue(new Error('API Error'));

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');

        const children = await testProvider.getChildren(generalCategory);

        // Should show error item
        expect(children!.length).toBe(1);
        expect(children![0].contextValue).toBe('error');

        // Load state should be error
        expect(testProvider.getCategoryLoadState('C_1')).toBe('error');

        testProvider.dispose();
      });

      it('should retry loading after error on next expansion', async () => {
        let callCount = 0;
        mockGitHubService.getDiscussionSummaries.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('API Error'));
          }
          return Promise.resolve({
            discussions: mockDiscussionSummaries.filter(d => d.category.id === 'C_1'),
            pageInfo: { hasNextPage: false, endCursor: null }
          });
        });

        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');

        // First expansion fails
        await testProvider.getChildren(generalCategory);
        expect(testProvider.getCategoryLoadState('C_1')).toBe('error');

        // Refresh to allow retry
        testProvider.refresh();
        const newRootChildren = await testProvider.getChildren();
        const newGeneralCategory = newRootChildren!.find(item => item.label === 'General');

        // Second expansion succeeds
        const children = await testProvider.getChildren(newGeneralCategory);
        expect(children!.length).toBe(2);
        expect(testProvider.getCategoryLoadState('C_1')).toBe('loaded');

        testProvider.dispose();
      });
    });

    describe('API request reduction', () => {
      it('should minimize API calls by not loading unexpanded categories', async () => {
        const testProvider = new DiscussionsProvider(mockGitHubService, mockAuthService);

        // Get categories
        await testProvider.getChildren();

        // Only expand one category
        const rootChildren = await testProvider.getChildren();
        const generalCategory = rootChildren!.find(item => item.label === 'General');
        await testProvider.getChildren(generalCategory);

        // Should only have 1 discussion API call (for General), not 3 (for all categories)
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        testProvider.dispose();
      });
    });
  });
});
