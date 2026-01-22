/**
 * Discussions Tree View Provider Tests - TDD
 * Requirements: 2.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { DiscussionsProvider, DiscussionTreeItem } from '../providers/discussionsProvider';
import { GitHubService } from '../services/githubService';
import { AuthenticationService } from '../services/authenticationService';
import { DiscussionSummary, DiscussionCategory, User } from '../models';

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

    mockGitHubService = {
      getRepositoryInfo: jest.fn().mockResolvedValue({
        id: 'R_123',
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo',
        hasDiscussionsEnabled: true
      }),
      getDiscussionSummaries: jest.fn().mockResolvedValue(mockDiscussionSummaries),
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

        // First call to getChildren loads data
        await provider.getChildren();
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        // Verify refresh triggers internal refresh (isLoaded is reset)
        provider.refresh();

        // After refresh, getChildren should re-fetch data
        await provider.getChildren();
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
        await provider.getChildren();
        expect(mockGitHubService.getDiscussionSummaries).toHaveBeenCalledTimes(1);

        provider.refresh();
        await provider.getChildren();

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
});
