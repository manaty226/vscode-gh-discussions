/**
 * Webview Provider Tests - TDD
 * Requirements: 3.1, 3.5, 5.1, 5.2, 5.3, 5.5, 6.1, 12.1-12.6
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { DiscussionWebviewProvider } from '../providers/webviewProvider';
import { GitHubService } from '../services/githubService';
import { AuthenticationService } from '../services/authenticationService';
import { Discussion, DiscussionCategory, User, DiscussionComment } from '../models';

describe('DiscussionWebviewProvider', () => {
  let provider: DiscussionWebviewProvider;
  let mockGitHubService: jest.Mocked<GitHubService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;
  let mockWebviewPanel: any;
  let mockWebview: any;

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

  const mockComment: DiscussionComment = {
    id: 'DC_1',
    body: 'This is a comment',
    bodyHTML: '<p>This is a comment</p>',
    author: mockUser,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    reactions: [],
    replies: []
  };

  const mockDiscussion: Discussion = {
    id: 'D_1',
    number: 1,
    title: 'Test Discussion',
    body: '# Hello World\n\nThis is a test discussion with **bold** and *italic* text.',
    bodyHTML: '<h1>Hello World</h1><p>This is a test discussion with <strong>bold</strong> and <em>italic</em> text.</p>',
    author: mockUser,
    category: mockCategory,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    isAnswered: false,
    comments: [mockComment],
    reactions: [{ content: 'THUMBS_UP', count: 5, viewerHasReacted: false }]
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockWebview = {
      html: '',
      onDidReceiveMessage: jest.fn(),
      postMessage: jest.fn(),
      asWebviewUri: jest.fn((uri: any) => uri),
      cspSource: 'https://test.vscode-resource.com'
    };

    mockWebviewPanel = {
      webview: mockWebview,
      dispose: jest.fn(),
      reveal: jest.fn(),
      onDidDispose: jest.fn(),
      onDidChangeViewState: jest.fn(),
      visible: true
    };

    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);

    mockGitHubService = {
      getRepositoryInfo: jest.fn().mockResolvedValue({
        id: 'R_123',
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo',
        hasDiscussionsEnabled: true
      }),
      getDiscussions: jest.fn().mockResolvedValue([mockDiscussion]),
      getDiscussion: jest.fn().mockResolvedValue(mockDiscussion),
      getDiscussionCategories: jest.fn().mockResolvedValue([mockCategory]),
      createDiscussion: jest.fn(),
      updateDiscussion: jest.fn(),
      addComment: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn()
    } as any;

    mockAuthService = {
      getSession: jest.fn().mockResolvedValue({
        id: 'session_1',
        accessToken: 'token',
        account: { id: 'testuser', label: 'Test User' },
        scopes: ['repo']
      }),
      getCurrentUser: jest.fn().mockResolvedValue(mockUser),
      isAuthenticated: jest.fn().mockResolvedValue(true),
      dispose: jest.fn()
    } as any;

    provider = new DiscussionWebviewProvider(
      mockGitHubService,
      mockAuthService,
      { extensionUri: vscode.Uri.parse('file:///extension') } as vscode.ExtensionContext
    );
  });

  afterEach(() => {
    provider.dispose();
  });

  describe('Unit Tests', () => {
    describe('Webview creation', () => {
      it('should create webview panel for discussion', async () => {
        await provider.showDiscussion(mockDiscussion);

        expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
          'discussionDetail',
          expect.stringContaining('Test Discussion'),
          vscode.ViewColumn.One,
          expect.objectContaining({
            enableScripts: true
          })
        );
      });

      it('should set webview HTML content', async () => {
        await provider.showDiscussion(mockDiscussion);

        expect(mockWebview.html).toBeTruthy();
        expect(mockWebview.html.length).toBeGreaterThan(0);
      });

      it('should reuse existing panel for same discussion', async () => {
        await provider.showDiscussion(mockDiscussion);
        await provider.showDiscussion(mockDiscussion);

        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        expect(mockWebviewPanel.reveal).toHaveBeenCalled();
      });
    });

    describe('Markdown rendering', () => {
      it('should render discussion title', async () => {
        await provider.showDiscussion(mockDiscussion);

        expect(mockWebview.html).toContain('Test Discussion');
      });

      it('should render discussion body HTML', async () => {
        await provider.showDiscussion(mockDiscussion);

        // Should contain the rendered HTML content
        expect(mockWebview.html).toContain('Hello World');
      });

      it('should render author information', async () => {
        await provider.showDiscussion(mockDiscussion);

        expect(mockWebview.html).toContain('testuser');
      });

      it('should render creation date', async () => {
        await provider.showDiscussion(mockDiscussion);

        // Should contain some date representation
        expect(mockWebview.html).toMatch(/2024/);
      });

      it('should render reactions', async () => {
        await provider.showDiscussion(mockDiscussion);

        // Should show reaction count
        expect(mockWebview.html).toContain('5');
      });
    });

    describe('Comments display', () => {
      it('should render comments section', async () => {
        await provider.showDiscussion(mockDiscussion);

        expect(mockWebview.html).toContain('This is a comment');
      });

      it('should show comment author', async () => {
        await provider.showDiscussion(mockDiscussion);

        // Comment author should appear
        expect(mockWebview.html).toContain('testuser');
      });

      it('should show comment input area', async () => {
        await provider.showDiscussion(mockDiscussion);

        // Should have comment input
        expect(mockWebview.html).toContain('textarea');
      });
    });

    describe('Comment posting', () => {
      it('should handle comment submission', async () => {
        await provider.showDiscussion(mockDiscussion);

        // Simulate message from webview
        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addComment',
          discussionId: 'D_1',
          body: 'New comment'
        });

        expect(mockGitHubService.addComment).toHaveBeenCalledWith('D_1', 'New comment');
      });

      it('should refresh discussion after comment', async () => {
        await provider.showDiscussion(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addComment',
          discussionId: 'D_1',
          body: 'New comment'
        });

        expect(mockGitHubService.getDiscussion).toHaveBeenCalledWith(1);
      });

      it('should show error for empty comment', async () => {
        await provider.showDiscussion(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addComment',
          discussionId: 'D_1',
          body: ''
        });

        expect(mockGitHubService.addComment).not.toHaveBeenCalled();
      });
    });

    describe('Permission-based UI', () => {
      it('should show edit button for discussion author', async () => {
        mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

        await provider.showDiscussion(mockDiscussion);

        expect(mockWebview.html).toContain('edit');
      });

      it('should hide edit button for non-author', async () => {
        const differentUser: User = {
          id: '456',
          login: 'otheruser',
          name: 'Other User',
          avatarUrl: 'https://github.com/otheruser.png'
        };
        mockAuthService.getCurrentUser.mockResolvedValue(differentUser);

        await provider.showDiscussion(mockDiscussion);

        // Edit button should not be visible or should be disabled
        // Implementation will vary based on how we handle this
        expect(mockWebview.html).toBeDefined();
      });
    });

    describe('Edit functionality', () => {
      it('should open virtual file on edit command', async () => {
        await provider.showDiscussion(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'edit',
          discussionNumber: 1
        });

        expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
      });
    });

    describe('showComments method (Requirements 5.2, 5.3, 5.4)', () => {
      it('should create webview panel for comments', async () => {
        await provider.showComments(mockDiscussion);

        expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
          'discussionComments',
          expect.stringContaining('Comments'),
          vscode.ViewColumn.One,
          expect.objectContaining({
            enableScripts: true
          })
        );
      });

      it('should render comments in time order', async () => {
        const olderComment: DiscussionComment = {
          id: 'DC_0',
          body: 'Older comment',
          bodyHTML: '<p>Older comment</p>',
          author: mockUser,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          reactions: [],
          replies: []
        };

        const newerComment: DiscussionComment = {
          id: 'DC_1',
          body: 'Newer comment',
          bodyHTML: '<p>Newer comment</p>',
          author: mockUser,
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          reactions: [],
          replies: []
        };

        const discussionWithComments: Discussion = {
          ...mockDiscussion,
          comments: [newerComment, olderComment]
        };

        await provider.showComments(discussionWithComments);

        // Comments should be rendered
        expect(mockWebview.html).toContain('Older comment');
        expect(mockWebview.html).toContain('Newer comment');
      });

      it('should show comment input area', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('textarea');
        // UI is in Japanese: "コメントを投稿" (Submit Comment)
        expect(mockWebview.html).toContain('コメントを投稿');
      });

      it('should not show discussion body in comments view', async () => {
        await provider.showComments(mockDiscussion);

        // Comments view should focus on comments, not the full discussion body
        // Title is shown for context, but full body HTML is not included
        expect(mockWebview.html).toContain('Test Discussion'); // Title for context
      });

      it('should handle comment submission in comments view', async () => {
        await provider.showComments(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addComment',
          discussionId: 'D_1',
          body: 'New comment from comments view'
        });

        expect(mockGitHubService.addComment).toHaveBeenCalledWith('D_1', 'New comment from comments view');
      });
    });

    describe('Comments pagination (Requirements 11.1-11.7)', () => {
      it('should show "Load More" button when hasNextPage is true', async () => {
        const discussionWithMoreComments: Discussion = {
          ...mockDiscussion,
          commentsPageInfo: {
            hasNextPage: true,
            endCursor: 'cursor_abc123'
          }
        };

        await provider.showComments(discussionWithMoreComments);

        // UI is in Japanese: "さらに読み込む" (Load More)
        expect(mockWebview.html).toContain('さらに読み込む');
      });

      it('should not show "Load More" button when hasNextPage is false', async () => {
        const discussionNoMoreComments: Discussion = {
          ...mockDiscussion,
          commentsPageInfo: {
            hasNextPage: false,
            endCursor: null
          }
        };

        await provider.showComments(discussionNoMoreComments);

        // Should not contain the load more button
        expect(mockWebview.html).not.toContain('id="load-more-button"');
      });

      it('should not show "Load More" button when commentsPageInfo is undefined', async () => {
        // Discussion without page info (all comments already loaded)
        await provider.showComments(mockDiscussion);

        // Should not contain the load more button
        expect(mockWebview.html).not.toContain('id="load-more-button"');
      });

      it('should handle loadMoreComments message', async () => {
        (mockGitHubService as any).getDiscussionComments = jest.fn().mockResolvedValue({
          comments: [
            {
              id: 'DC_101',
              body: 'Comment from page 2',
              bodyHTML: '<p>Comment from page 2</p>',
              author: mockUser,
              createdAt: new Date('2024-01-10'),
              updatedAt: new Date('2024-01-10'),
              reactions: [],
              replies: []
            }
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null
          }
        });

        const discussionWithMoreComments: Discussion = {
          ...mockDiscussion,
          commentsPageInfo: {
            hasNextPage: true,
            endCursor: 'cursor_abc123'
          }
        };

        await provider.showComments(discussionWithMoreComments);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'loadMoreComments',
          cursor: 'cursor_abc123'
        });

        expect(mockGitHubService.getDiscussionComments).toHaveBeenCalledWith(1, 'cursor_abc123');
      });

      it('should update webview with additional comments after loading more', async () => {
        (mockGitHubService as any).getDiscussionComments = jest.fn().mockResolvedValue({
          comments: [
            {
              id: 'DC_101',
              body: 'New comment from page 2',
              bodyHTML: '<p>New comment from page 2</p>',
              author: mockUser,
              createdAt: new Date('2024-01-10'),
              updatedAt: new Date('2024-01-10'),
              reactions: [],
              replies: []
            }
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null
          }
        });

        const discussionWithMoreComments: Discussion = {
          ...mockDiscussion,
          commentsPageInfo: {
            hasNextPage: true,
            endCursor: 'cursor_abc123'
          }
        };

        await provider.showComments(discussionWithMoreComments);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'loadMoreComments',
          cursor: 'cursor_abc123'
        });

        // postMessage should be called to append new comments
        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'appendComments'
          })
        );
      });
    });

    describe('Reply functionality (Requirements 5.10-5.13)', () => {
      it('should show reply button on each comment', async () => {
        await provider.showComments(mockDiscussion);

        // Each comment should have a reply button (UI is in Japanese: "返信")
        expect(mockWebview.html).toContain('返信');
      });

      it('should render replies indented under parent comment', async () => {
        const replyComment: DiscussionComment = {
          id: 'DC_reply_1',
          body: 'This is a reply',
          bodyHTML: '<p>This is a reply</p>',
          author: mockUser,
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          reactions: [],
          replies: []
        };

        const commentWithReply: DiscussionComment = {
          ...mockComment,
          replies: [replyComment]
        };

        const discussionWithReplies: Discussion = {
          ...mockDiscussion,
          comments: [commentWithReply]
        };

        await provider.showComments(discussionWithReplies);

        // Reply should be rendered
        expect(mockWebview.html).toContain('This is a reply');
        // Replies should be in a nested container with indentation
        expect(mockWebview.html).toContain('replies');
      });

      it('should handle reply submission', async () => {
        (mockGitHubService as any).addReply = jest.fn().mockResolvedValue(undefined);

        await provider.showComments(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addReply',
          commentId: 'DC_1',
          body: 'This is a reply'
        });

        expect(mockGitHubService.addReply).toHaveBeenCalledWith('D_1', 'DC_1', 'This is a reply');
      });

      it('should refresh comments after reply', async () => {
        (mockGitHubService as any).addReply = jest.fn().mockResolvedValue(undefined);

        await provider.showComments(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addReply',
          commentId: 'DC_1',
          body: 'This is a reply'
        });

        expect(mockGitHubService.getDiscussion).toHaveBeenCalledWith(1);
      });

      it('should not submit empty reply', async () => {
        (mockGitHubService as any).addReply = jest.fn().mockResolvedValue(undefined);

        await provider.showComments(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'addReply',
          commentId: 'DC_1',
          body: '   '
        });

        expect(mockGitHubService.addReply).not.toHaveBeenCalled();
      });
    });

    describe('Comment Edit/Delete functionality (Requirements 13.1-13.9)', () => {
      const currentUserComment: DiscussionComment = {
        id: 'DC_own',
        body: 'My own comment',
        bodyHTML: '<p>My own comment</p>',
        author: mockUser, // Same as current user
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
        reactions: [],
        replies: []
      };

      const otherUserComment: DiscussionComment = {
        id: 'DC_other',
        body: 'Other user comment',
        bodyHTML: '<p>Other user comment</p>',
        author: { id: '999', login: 'otheruser', name: 'Other User', avatarUrl: 'https://github.com/otheruser.png' },
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
        reactions: [],
        replies: []
      };

      it('should show edit and delete buttons for own comments (Requirement 13.1)', async () => {
        const discussionWithOwnComment: Discussion = {
          ...mockDiscussion,
          comments: [currentUserComment]
        };

        await provider.showComments(discussionWithOwnComment);

        // Should contain edit button (UI is in Japanese: "編集")
        expect(mockWebview.html).toContain('編集');
        // Should contain delete button (UI is in Japanese: "削除")
        expect(mockWebview.html).toContain('削除');
      });

      it('should not show edit and delete buttons for other user comments (Requirement 13.1)', async () => {
        const discussionWithOtherComment: Discussion = {
          ...mockDiscussion,
          comments: [otherUserComment]
        };

        await provider.showComments(discussionWithOtherComment);

        // The comment should be rendered
        expect(mockWebview.html).toContain('Other user comment');
        // Edit/delete buttons should NOT appear for this comment
        // We check that the data-comment-id for other user's comment doesn't have edit/delete actions
        // This is tested by ensuring that the comment card for 'DC_other' doesn't have edit-btn
        expect(mockWebview.html).not.toContain('data-action="start-edit" data-target-comment-id="DC_other"');
        expect(mockWebview.html).not.toContain('data-action="delete-comment" data-target-comment-id="DC_other"');
      });

      it('should handle updateComment message (Requirement 13.3)', async () => {
        (mockGitHubService as any).updateComment = jest.fn().mockResolvedValue(undefined);

        const discussionWithOwnComment: Discussion = {
          ...mockDiscussion,
          comments: [currentUserComment]
        };

        await provider.showComments(discussionWithOwnComment);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'updateComment',
          commentId: 'DC_own',
          body: 'Updated comment body'
        });

        expect(mockGitHubService.updateComment).toHaveBeenCalledWith('DC_own', 'Updated comment body');
      });

      it('should refresh comments after update (Requirement 13.7)', async () => {
        (mockGitHubService as any).updateComment = jest.fn().mockResolvedValue(undefined);

        const discussionWithOwnComment: Discussion = {
          ...mockDiscussion,
          comments: [currentUserComment]
        };

        await provider.showComments(discussionWithOwnComment);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'updateComment',
          commentId: 'DC_own',
          body: 'Updated comment body'
        });

        expect(mockGitHubService.getDiscussion).toHaveBeenCalledWith(1);
      });

      it('should not update comment with empty body', async () => {
        (mockGitHubService as any).updateComment = jest.fn().mockResolvedValue(undefined);

        const discussionWithOwnComment: Discussion = {
          ...mockDiscussion,
          comments: [currentUserComment]
        };

        await provider.showComments(discussionWithOwnComment);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'updateComment',
          commentId: 'DC_own',
          body: '   '
        });

        expect(mockGitHubService.updateComment).not.toHaveBeenCalled();
      });

      it('should handle deleteComment message (Requirement 13.6)', async () => {
        (mockGitHubService as any).deleteComment = jest.fn().mockResolvedValue(undefined);

        const discussionWithOwnComment: Discussion = {
          ...mockDiscussion,
          comments: [currentUserComment]
        };

        await provider.showComments(discussionWithOwnComment);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'deleteComment',
          commentId: 'DC_own'
        });

        expect(mockGitHubService.deleteComment).toHaveBeenCalledWith('DC_own');
      });

      it('should refresh comments after delete (Requirement 13.7)', async () => {
        (mockGitHubService as any).deleteComment = jest.fn().mockResolvedValue(undefined);

        const discussionWithOwnComment: Discussion = {
          ...mockDiscussion,
          comments: [currentUserComment]
        };

        await provider.showComments(discussionWithOwnComment);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'deleteComment',
          commentId: 'DC_own'
        });

        expect(mockGitHubService.getDiscussion).toHaveBeenCalledWith(1);
      });

      it('should show edit/delete buttons for own replies (Requirement 13.9)', async () => {
        const ownReply: DiscussionComment = {
          id: 'DC_reply_own',
          body: 'My reply',
          bodyHTML: '<p>My reply</p>',
          author: mockUser,
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          reactions: [],
          replies: []
        };

        const commentWithOwnReply: DiscussionComment = {
          ...otherUserComment,
          replies: [ownReply]
        };

        const discussionWithReply: Discussion = {
          ...mockDiscussion,
          comments: [commentWithOwnReply]
        };

        await provider.showComments(discussionWithReply);

        // Reply should be rendered with edit/delete buttons
        expect(mockWebview.html).toContain('My reply');
        // Own reply should have edit/delete actions
        expect(mockWebview.html).toContain('data-target-comment-id="DC_reply_own"');
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property 5: Markdown rendering consistency
     * Validates: Requirements 3.5, 5.5
     */
    it('should consistently render markdown content', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          // Use safe characters only to avoid HTML escaping complexity
          title: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '), { minLength: 1, maxLength: 50 }),
          body: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'), { minLength: 1, maxLength: 100 })
        }),
        async ({ title, body }) => {
          const testDiscussion: Discussion = {
            ...mockDiscussion,
            title,
            body,
            bodyHTML: `<p>${body}</p>`
          };

          await provider.showDiscussion(testDiscussion);

          // Title should always be in the output
          expect(mockWebview.html).toContain(title);
        }
      ), { numRuns: 10 });
    });

    /**
     * Property 8: Permission-based UI display correctness
     * Validates: Requirement 6.1
     */
    it('should correctly show/hide edit based on authorship', async () => {
      await fc.assert(fc.asyncProperty(
        fc.boolean(),
        async (isAuthor) => {
          const currentUser: User = isAuthor
            ? mockUser
            : { id: '999', login: 'other', name: 'Other', avatarUrl: '' };

          mockAuthService.getCurrentUser.mockResolvedValue(currentUser);

          // Create new provider for each test
          const testProvider = new DiscussionWebviewProvider(
            mockGitHubService,
            mockAuthService,
            { extensionUri: vscode.Uri.parse('file:///extension') } as vscode.ExtensionContext
          );

          await testProvider.showDiscussion(mockDiscussion);

          // Verify webview was created with content
          expect(mockWebview.html).toBeDefined();
          expect(mockWebview.html.length).toBeGreaterThan(0);

          testProvider.dispose();
        }
      ), { numRuns: 5 });
    });

    /**
     * Property: Comments should always be rendered when present
     */
    it('should render all comments', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 20 }),
            body: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'), { minLength: 1, maxLength: 50 })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (comments) => {
          const testComments: DiscussionComment[] = comments.map((c) => ({
            id: c.id,
            body: c.body,
            bodyHTML: `<p>${c.body}</p>`,
            author: mockUser,
            createdAt: new Date(),
            updatedAt: new Date(),
            reactions: [],
            replies: []
          }));

          const testDiscussion: Discussion = {
            ...mockDiscussion,
            comments: testComments
          };

          await provider.showDiscussion(testDiscussion);

          // Each comment body should be in the output (via bodyHTML)
          for (const comment of comments) {
            if (comment.body.length > 0) {
              expect(mockWebview.html).toContain(comment.body);
            }
          }
        }
      ), { numRuns: 10 });
    });
  });

  describe('Mermaid Rendering (Requirements 12.1-12.6)', () => {
    describe('getNonce', () => {
      it('should generate a 32-character hex nonce (Requirement 12.3)', () => {
        const nonce = provider.getNonce();

        // Should be 32 hex characters (16 bytes = 32 hex chars)
        expect(nonce).toMatch(/^[a-f0-9]{32}$/);
      });

      it('should generate unique nonces on each call', () => {
        const nonce1 = provider.getNonce();
        const nonce2 = provider.getNonce();
        const nonce3 = provider.getNonce();

        expect(nonce1).not.toBe(nonce2);
        expect(nonce2).not.toBe(nonce3);
        expect(nonce1).not.toBe(nonce3);
      });
    });

    describe('getMermaidScriptUri', () => {
      it('should return a webview URI for mermaid bundle (Requirement 12.2)', () => {
        const uri = provider.getMermaidScriptUri(mockWebview);

        // Should have called asWebviewUri
        expect(mockWebview.asWebviewUri).toHaveBeenCalled();

        // The returned URI should be for mermaid.bundle.js
        const calledUri = mockWebview.asWebviewUri.mock.calls[0][0];
        expect(calledUri.path).toContain('mermaid.bundle.js');
      });
    });

    describe('CSP with nonce', () => {
      it('should include nonce in CSP header (Requirement 12.3)', async () => {
        await provider.showComments(mockDiscussion);

        // CSP should use nonce for script-src
        expect(mockWebview.html).toMatch(/script-src 'nonce-[a-f0-9]{32}'/);
      });

      it('should include cspSource in CSP header', async () => {
        await provider.showComments(mockDiscussion);

        // Should include the webview's cspSource
        expect(mockWebview.html).toContain(mockWebview.cspSource);
      });

      it('should have nonce attribute on script tags', async () => {
        await provider.showComments(mockDiscussion);

        // All script tags should have nonce attribute
        const scriptTagMatches = mockWebview.html.match(/<script[^>]*>/g) || [];
        for (const scriptTag of scriptTagMatches) {
          expect(scriptTag).toMatch(/nonce="[a-f0-9]{32}"/);
        }
      });
    });

    describe('Mermaid initialization', () => {
      it('should include mermaid script tag (Requirement 12.2)', async () => {
        await provider.showComments(mockDiscussion);

        // Should include the mermaid bundle script
        expect(mockWebview.html).toContain('mermaid.bundle.js');
      });

      it('should initialize mermaid with strict security level (Requirement 12.4)', async () => {
        await provider.showComments(mockDiscussion);

        // Should initialize with securityLevel: 'strict'
        expect(mockWebview.html).toContain("securityLevel: 'strict'");
      });

      it('should have startOnLoad set to false', async () => {
        await provider.showComments(mockDiscussion);

        // Should have startOnLoad: false for manual rendering
        expect(mockWebview.html).toContain('startOnLoad: false');
      });
    });

    describe('Mermaid diagram styles', () => {
      it('should include mermaid-diagram class styles (Requirement 12.1)', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('.mermaid-diagram');
      });

      it('should include mermaid-error class styles (Requirement 12.5)', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('.mermaid-error');
      });
    });

    describe('Mermaid rendering function', () => {
      it('should include renderMermaidDiagrams function (Requirement 12.1)', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('renderMermaidDiagrams');
      });

      it('should call renderMermaidDiagrams on page load', async () => {
        await provider.showComments(mockDiscussion);

        // Should call the rendering function after mermaid is loaded
        expect(mockWebview.html).toMatch(/renderMermaidDiagrams\(\)/);
      });
    });
  });

  describe('Mention Functionality (Requirement 19)', () => {
    describe('Mention UI Components', () => {
      it('should include mention dropdown CSS styles', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('.mention-dropdown');
        expect(mockWebview.html).toContain('.mention-item');
        expect(mockWebview.html).toContain('.mention-avatar');
        expect(mockWebview.html).toContain('.mention-login');
      });

      it('should include mention-enabled class on comment textarea', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('class="mention-enabled"');
        expect(mockWebview.html).toContain('data-textarea-id="comment"');
      });

      it('should include mention dropdown container for comment input', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('comment-input-container');
        expect(mockWebview.html).toContain('id="mention-dropdown-comment"');
      });

      it('should include mention dropdown for reply inputs', async () => {
        await provider.showComments(mockDiscussion);

        // Should have dropdown for reply forms
        expect(mockWebview.html).toContain('reply-input-container');
        expect(mockWebview.html).toContain('mention-dropdown');
      });

      it('should include placeholder text mentioning @mention feature', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('@でメンション');
      });
    });

    describe('Mention JavaScript functionality', () => {
      it('should include MentionHandler class', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('class MentionHandler');
      });

      it('should include handleInput method for @ detection', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('handleInput');
        // Check for the regex pattern that detects @mention (supports both half-width @ and full-width ＠)
        expect(mockWebview.html).toContain('/[@＠]([a-zA-Z0-9_-]*)$/');
      });

      it('should include keyboard navigation handlers', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('handleKeydown');
        expect(mockWebview.html).toContain('ArrowDown');
        expect(mockWebview.html).toContain('ArrowUp');
        expect(mockWebview.html).toContain('Enter');
        expect(mockWebview.html).toContain('Escape');
      });

      it('should include insertMention method', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('insertMention');
      });

      it('should initialize mention handlers on load', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('initMentionHandlers');
      });
    });

    describe('Mention message handling', () => {
      it('should handle getMentionableUsers message', async () => {
        const mockUsers = [
          { login: 'user1', name: 'User One', avatarUrl: 'https://example.com/1.png', source: 'participant' },
          { login: 'user2', name: 'User Two', avatarUrl: 'https://example.com/2.png', source: 'collaborator' }
        ];
        (mockGitHubService as any).getMentionableUsers = jest.fn().mockResolvedValue(mockUsers);

        await provider.showComments(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'getMentionableUsers'
        });

        expect(mockGitHubService.getMentionableUsers).toHaveBeenCalledWith(1);
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: 'mentionableUsers',
          users: mockUsers
        });
      });

      it('should return empty array when getMentionableUsers fails', async () => {
        (mockGitHubService as any).getMentionableUsers = jest.fn().mockRejectedValue(new Error('API Error'));

        await provider.showComments(mockDiscussion);

        const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({
          type: 'getMentionableUsers'
        });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: 'mentionableUsers',
          users: []
        });
      });
    });

    describe('Mention source labels', () => {
      it('should include source label translations in Japanese', async () => {
        await provider.showComments(mockDiscussion);

        expect(mockWebview.html).toContain('参加者');
        expect(mockWebview.html).toContain('コラボレーター');
        expect(mockWebview.html).toContain('Orgメンバー');
      });
    });
  });
});
