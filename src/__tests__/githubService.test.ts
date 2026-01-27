/**
 * GitHub Service Tests - TDD Red Phase
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { GitHubService } from '../services/githubService';
import { AuthenticationService } from '../services/authenticationService';
import { RepositoryInfo, Discussion, DiscussionCategory, MentionSource } from '../models';

// Mock child_process for git operations
jest.mock('child_process');

// Mock fetch globally for this test file
global.fetch = jest.fn();

// Get access to mockVscode for workspace manipulation
const mockVscode = (global as any).mockVscode;

describe('GitHubService', () => {
  let githubService: GitHubService;
  let mockAuthService: jest.Mocked<AuthenticationService>;

  const mockSession = {
    id: 'test-session',
    accessToken: 'test-token',
    account: { id: 'test-account', label: 'testuser' },
    scopes: ['repo', 'read:user']
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup workspace folders mock
    mockVscode.workspace.workspaceFolders = [
      {
        uri: { fsPath: '/test/workspace' },
        name: 'workspace',
        index: 0
      }
    ];

    // Create mock auth service
    mockAuthService = {
      getSession: jest.fn().mockResolvedValue(mockSession),
      getSessionSilent: jest.fn().mockResolvedValue(mockSession),
      isAuthenticated: jest.fn().mockResolvedValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({
        id: '12345',
        login: 'testuser',
        name: 'Test User',
        avatarUrl: 'https://github.com/testuser.png'
      }),
      onDidChangeAuthenticationState: jest.fn() as any,
      dispose: jest.fn()
    } as any;

    githubService = new GitHubService(mockAuthService);
  });

  afterEach(() => {
    if (githubService) {
      githubService.dispose();
    }
  });

  describe('Unit Tests', () => {
    describe('getRepositoryInfo', () => {
      it('should detect repository from git remote', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        // Mock GraphQL response for repository info
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              repository: {
                id: 'R_123',
                name: 'repo',
                owner: { login: 'owner' },
                hasDiscussionsEnabled: true
              }
            }
          })
        });

        const repoInfo = await githubService.getRepositoryInfo();

        expect(repoInfo).toEqual({
          id: 'R_123',
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          hasDiscussionsEnabled: true
        });
      });

      it('should handle HTTPS remote URLs', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\thttps://github.com/owner/repo.git (fetch)\n');

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              repository: {
                id: 'R_123',
                name: 'repo',
                owner: { login: 'owner' },
                hasDiscussionsEnabled: true
              }
            }
          })
        });

        const repoInfo = await githubService.getRepositoryInfo();

        expect(repoInfo.owner).toBe('owner');
        expect(repoInfo.name).toBe('repo');
      });

      it('should throw error when not in a git repository', async () => {
        const { execSync } = require('child_process');
        execSync.mockImplementation(() => {
          throw new Error('fatal: not a git repository');
        });

        await expect(githubService.getRepositoryInfo()).rejects.toThrow();
      });

      it('should throw error when no GitHub remote found', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@gitlab.com:owner/repo.git (fetch)\n');

        await expect(githubService.getRepositoryInfo()).rejects.toThrow('GitHub remote not found');
      });
    });

    describe('getDiscussionSummaries', () => {
      it('should fetch discussion summaries from GitHub API (lightweight, no body/comments)', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockDiscussionSummaries = {
          data: {
            repository: {
              id: 'R_123',
              name: 'repo',
              owner: { login: 'owner' },
              hasDiscussionsEnabled: true,
              discussions: {
                nodes: [
                  {
                    id: 'D_1',
                    number: 1,
                    title: 'Test Discussion',
                    author: {
                      login: 'testuser',
                      avatarUrl: 'https://github.com/testuser.png'
                    },
                    category: {
                      id: 'C_1',
                      name: 'General',
                      description: 'General discussions',
                      emoji: ':speech_balloon:',
                      isAnswerable: false
                    },
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                    isAnswered: false,
                    comments: { totalCount: 5 }
                  }
                ],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockDiscussionSummaries)
          });

        const result = await githubService.getDiscussionSummaries();

        expect(result.discussions).toHaveLength(1);
        expect(result.discussions[0].title).toBe('Test Discussion');
        expect(result.discussions[0].number).toBe(1);
        expect(result.discussions[0].commentsCount).toBe(5);
        // Verify body is not present (lazy loading)
        expect((result.discussions[0] as any).body).toBeUndefined();
      });

      it('should handle pagination with cursor', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  discussions: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  }
                }
              }
            })
          });

        const result = await githubService.getDiscussionSummaries({ first: 10, after: 'cursor123' });

        expect(result.discussions).toEqual([]);
      });

      it('should return empty array when not authenticated', async () => {
        mockAuthService.getSessionSilent.mockResolvedValue(undefined);

        const summaries = await githubService.getDiscussionSummaries();

        expect(summaries.discussions).toEqual([]);
      });

      it('should return pageInfo with hasNextPage and endCursor', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockResponse = {
          data: {
            repository: {
              discussions: {
                nodes: [
                  {
                    id: 'D_1',
                    number: 1,
                    title: 'First Discussion',
                    url: 'https://github.com/owner/repo/discussions/1',
                    author: { login: 'user1', avatarUrl: 'https://github.com/user1.png' },
                    category: { id: 'C_1', name: 'General', description: '', emoji: '', isAnswerable: false },
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                    isAnswered: false,
                    comments: { totalCount: 0 }
                  }
                ],
                pageInfo: {
                  hasNextPage: true,
                  endCursor: 'cursor_page1_end'
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockResponse)
          });

        const result = await githubService.getDiscussionSummaries();

        expect(result.discussions).toHaveLength(1);
        expect(result.pageInfo.hasNextPage).toBe(true);
        expect(result.pageInfo.endCursor).toBe('cursor_page1_end');
      });

      it('should fetch next page using after cursor', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockNextPageResponse = {
          data: {
            repository: {
              discussions: {
                nodes: [
                  {
                    id: 'D_21',
                    number: 21,
                    title: 'Discussion from page 2',
                    url: 'https://github.com/owner/repo/discussions/21',
                    author: { login: 'user2', avatarUrl: 'https://github.com/user2.png' },
                    category: { id: 'C_1', name: 'General', description: '', emoji: '', isAnswerable: false },
                    createdAt: '2024-01-02T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                    isAnswered: false,
                    comments: { totalCount: 3 }
                  }
                ],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockNextPageResponse)
          });

        const result = await githubService.getDiscussionSummaries({ after: 'cursor_page1_end' });

        // Verify cursor was passed to the API
        const fetchCall = (global.fetch as jest.Mock).mock.calls[1];
        const requestBody = JSON.parse(fetchCall[1].body);
        expect(requestBody.variables.after).toBe('cursor_page1_end');

        expect(result.discussions).toHaveLength(1);
        expect(result.discussions[0].number).toBe(21);
        expect(result.pageInfo.hasNextPage).toBe(false);
        expect(result.pageInfo.endCursor).toBeNull();
      });
    });

    describe('getDiscussionCategories', () => {
      it('should fetch categories from repository', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockCategories = {
          data: {
            repository: {
              id: 'R_123',
              name: 'repo',
              owner: { login: 'owner' },
              hasDiscussionsEnabled: true,
              discussionCategories: {
                nodes: [
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
                    description: 'Questions and answers',
                    emoji: ':question:',
                    isAnswerable: true
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockCategories)
          });

        const categories = await githubService.getDiscussionCategories();

        expect(categories).toHaveLength(2);
        expect(categories[0].name).toBe('General');
        expect(categories[1].isAnswerable).toBe(true);
      });
    });

    describe('createDiscussion', () => {
      it('should create a new discussion', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockCreatedDiscussion = {
          data: {
            createDiscussion: {
              discussion: {
                id: 'D_new',
                number: 42,
                title: 'New Discussion',
                body: 'New body',
                bodyHTML: '<p>New body</p>',
                author: {
                  login: 'testuser',
                  avatarUrl: 'https://github.com/testuser.png'
                },
                category: {
                  id: 'C_1',
                  name: 'General',
                  description: 'General discussions',
                  emoji: ':speech_balloon:',
                  isAnswerable: false
                },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                isAnswered: false,
                reactionGroups: [],
                comments: { nodes: [] }
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockCreatedDiscussion)
        });

        const discussion = await githubService.createDiscussion({
          repositoryId: 'R_123',
          categoryId: 'C_1',
          title: 'New Discussion',
          body: 'New body'
        });

        expect(discussion.title).toBe('New Discussion');
        expect(discussion.number).toBe(42);
      });

      it('should throw error when not authenticated', async () => {
        mockAuthService.getSession.mockResolvedValue(undefined);

        await expect(githubService.createDiscussion({
          repositoryId: 'R_123',
          categoryId: 'C_1',
          title: 'Test',
          body: 'Test'
        })).rejects.toThrow('Not authenticated');
      });
    });

    describe('addComment', () => {
      it('should add a comment to a discussion', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              addDiscussionComment: {
                comment: {
                  id: 'DC_1',
                  body: 'New comment'
                }
              }
            }
          })
        });

        await expect(
          githubService.addComment('D_1', 'New comment')
        ).resolves.not.toThrow();
      });

      it('should throw error when not authenticated', async () => {
        mockAuthService.getSession.mockResolvedValue(undefined);

        await expect(
          githubService.addComment('D_1', 'Comment')
        ).rejects.toThrow('Not authenticated');
      });
    });

    describe('getDiscussionComments', () => {
      it('should fetch comments with pagination info', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockCommentsResponse = {
          data: {
            repository: {
              discussion: {
                comments: {
                  nodes: [
                    {
                      id: 'DC_1',
                      body: 'First comment',
                      bodyHTML: '<p>First comment</p>',
                      author: {
                        login: 'user1',
                        avatarUrl: 'https://github.com/user1.png'
                      },
                      createdAt: '2024-01-01T00:00:00Z',
                      updatedAt: '2024-01-01T00:00:00Z',
                      reactionGroups: [],
                      replies: { nodes: [] }
                    },
                    {
                      id: 'DC_2',
                      body: 'Second comment',
                      bodyHTML: '<p>Second comment</p>',
                      author: {
                        login: 'user2',
                        avatarUrl: 'https://github.com/user2.png'
                      },
                      createdAt: '2024-01-02T00:00:00Z',
                      updatedAt: '2024-01-02T00:00:00Z',
                      reactionGroups: [],
                      replies: { nodes: [] }
                    }
                  ],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'cursor_abc123'
                  }
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockCommentsResponse)
          });

        const result = await githubService.getDiscussionComments(1);

        expect(result.comments).toHaveLength(2);
        expect(result.comments[0].id).toBe('DC_1');
        expect(result.comments[0].body).toBe('First comment');
        expect(result.comments[1].id).toBe('DC_2');
        expect(result.pageInfo.hasNextPage).toBe(true);
        expect(result.pageInfo.endCursor).toBe('cursor_abc123');
      });

      it('should fetch next page using cursor', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockNextPageResponse = {
          data: {
            repository: {
              discussion: {
                comments: {
                  nodes: [
                    {
                      id: 'DC_101',
                      body: 'Comment from page 2',
                      bodyHTML: '<p>Comment from page 2</p>',
                      author: {
                        login: 'user3',
                        avatarUrl: 'https://github.com/user3.png'
                      },
                      createdAt: '2024-01-03T00:00:00Z',
                      updatedAt: '2024-01-03T00:00:00Z',
                      reactionGroups: [],
                      replies: { nodes: [] }
                    }
                  ],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null
                  }
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockNextPageResponse)
          });

        const result = await githubService.getDiscussionComments(1, 'cursor_abc123');

        // Verify cursor was passed to the API
        expect(global.fetch).toHaveBeenCalledTimes(2);
        const fetchCall = (global.fetch as jest.Mock).mock.calls[1];
        const requestBody = JSON.parse(fetchCall[1].body);
        expect(requestBody.variables.after).toBe('cursor_abc123');

        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].id).toBe('DC_101');
        expect(result.pageInfo.hasNextPage).toBe(false);
        expect(result.pageInfo.endCursor).toBeNull();
      });

      it('should return empty comments when no comments exist', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockEmptyResponse = {
          data: {
            repository: {
              discussion: {
                comments: {
                  nodes: [],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null
                  }
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockEmptyResponse)
          });

        const result = await githubService.getDiscussionComments(1);

        expect(result.comments).toHaveLength(0);
        expect(result.pageInfo.hasNextPage).toBe(false);
      });

      it('should throw error when not authenticated', async () => {
        mockAuthService.getSession.mockResolvedValue(undefined);

        await expect(githubService.getDiscussionComments(1)).rejects.toThrow('Not authenticated');
      });

      it('should fetch comments with replies', async () => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

        const mockCommentsWithReplies = {
          data: {
            repository: {
              discussion: {
                comments: {
                  nodes: [
                    {
                      id: 'DC_1',
                      body: 'Parent comment',
                      bodyHTML: '<p>Parent comment</p>',
                      author: {
                        login: 'user1',
                        avatarUrl: 'https://github.com/user1.png'
                      },
                      createdAt: '2024-01-01T00:00:00Z',
                      updatedAt: '2024-01-01T00:00:00Z',
                      reactionGroups: [],
                      replies: {
                        nodes: [
                          {
                            id: 'DC_1_reply_1',
                            body: 'Reply to parent',
                            bodyHTML: '<p>Reply to parent</p>',
                            author: {
                              login: 'user2',
                              avatarUrl: 'https://github.com/user2.png'
                            },
                            createdAt: '2024-01-01T01:00:00Z',
                            updatedAt: '2024-01-01T01:00:00Z',
                            reactionGroups: []
                          }
                        ]
                      }
                    }
                  ],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null
                  }
                }
              }
            }
          }
        };

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockCommentsWithReplies)
          });

        const result = await githubService.getDiscussionComments(1);

        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].replies).toHaveLength(1);
        expect(result.comments[0].replies[0].id).toBe('DC_1_reply_1');
        expect(result.comments[0].replies[0].body).toBe('Reply to parent');
      });
    });

    describe('addReply', () => {
      it('should add a reply to a comment', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              addDiscussionComment: {
                comment: {
                  id: 'DC_reply_1',
                  body: 'This is a reply'
                }
              }
            }
          })
        });

        await expect(
          githubService.addReply('D_1', 'DC_1', 'This is a reply')
        ).resolves.not.toThrow();
      });

      it('should throw error when not authenticated', async () => {
        mockAuthService.getSession.mockResolvedValue(undefined);

        await expect(
          githubService.addReply('D_1', 'DC_1', 'Reply')
        ).rejects.toThrow('Not authenticated');
      });

      it('should call API with discussionId and replyToId parameters', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              addDiscussionComment: {
                comment: {
                  id: 'DC_reply_1',
                  body: 'Reply body'
                }
              }
            }
          })
        });

        await githubService.addReply('D_discussion_456', 'DC_parent_123', 'Reply body');

        // Verify the GraphQL mutation was called with discussionId and replyToId
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        expect(requestBody.variables.discussionId).toBe('D_discussion_456');
        expect(requestBody.variables.replyToId).toBe('DC_parent_123');
        expect(requestBody.variables.body).toBe('Reply body');
      });
    });

    describe('updateComment', () => {
      it('should update a comment', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              updateDiscussionComment: {
                comment: {
                  id: 'DC_1',
                  body: 'Updated comment body'
                }
              }
            }
          })
        });

        await expect(
          githubService.updateComment('DC_1', 'Updated comment body')
        ).resolves.not.toThrow();
      });

      it('should throw error when not authenticated', async () => {
        mockAuthService.getSession.mockResolvedValue(undefined);

        await expect(
          githubService.updateComment('DC_1', 'Updated body')
        ).rejects.toThrow('Not authenticated');
      });

      it('should call API with commentId and body parameters', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              updateDiscussionComment: {
                comment: {
                  id: 'DC_123',
                  body: 'New content'
                }
              }
            }
          })
        });

        await githubService.updateComment('DC_123', 'New content');

        // Verify the GraphQL mutation was called with correct parameters
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        expect(requestBody.variables.commentId).toBe('DC_123');
        expect(requestBody.variables.body).toBe('New content');
      });
    });

    describe('deleteComment', () => {
      it('should delete a comment', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              deleteDiscussionComment: {
                comment: {
                  id: 'DC_1'
                }
              }
            }
          })
        });

        await expect(
          githubService.deleteComment('DC_1')
        ).resolves.not.toThrow();
      });

      it('should throw error when not authenticated', async () => {
        mockAuthService.getSession.mockResolvedValue(undefined);

        await expect(
          githubService.deleteComment('DC_1')
        ).rejects.toThrow('Not authenticated');
      });

      it('should call API with commentId parameter', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              deleteDiscussionComment: {
                comment: {
                  id: 'DC_456'
                }
              }
            }
          })
        });

        await githubService.deleteComment('DC_456');

        // Verify the GraphQL mutation was called with commentId
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        expect(requestBody.variables.commentId).toBe('DC_456');
      });
    });

    describe('getMentionableUsers', () => {
      beforeEach(() => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');
      });

      it('should fetch discussion participants when discussionNumber is provided', async () => {
        // Mock calls in order:
        // 1. getRepositoryInfo (for getMentionableUsers)
        // 2. getRepositoryInfo (for getDiscussionParticipants - cached in real usage)
        // 3. getDiscussionParticipants GraphQL
        // 4. getRepositoryCollaborators REST API
        (global.fetch as jest.Mock)
          // 1. getRepositoryInfo
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 2. getRepositoryInfo (called again for getDiscussionParticipants)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 3. getDiscussionParticipants
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  discussion: {
                    author: { login: 'author1', name: 'Author One', avatarUrl: 'https://github.com/author1.png' },
                    comments: {
                      nodes: [
                        {
                          author: { login: 'commenter1', name: 'Commenter One', avatarUrl: 'https://github.com/commenter1.png' },
                          replies: {
                            nodes: [
                              { author: { login: 'replier1', name: 'Replier One', avatarUrl: 'https://github.com/replier1.png' } }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              }
            })
          })
          // 4. getRepositoryCollaborators (REST API)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([
              { login: 'collab1', name: 'Collaborator One', avatar_url: 'https://github.com/collab1.png' }
            ])
          });

        const users = await githubService.getMentionableUsers(1);

        expect(users.length).toBeGreaterThan(0);
        // Discussion participants should be first (highest priority)
        const participantLogins = users
          .filter(u => u.source === MentionSource.DISCUSSION_PARTICIPANT)
          .map(u => u.login);
        expect(participantLogins).toContain('author1');
        expect(participantLogins).toContain('commenter1');
        expect(participantLogins).toContain('replier1');
      });

      it('should fetch collaborators from repository', async () => {
        // Without discussionNumber, only collaborators are fetched
        (global.fetch as jest.Mock)
          // 1. getRepositoryInfo
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 2. getRepositoryCollaborators (REST API)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([
              { login: 'collab1', name: 'Collaborator One', avatar_url: 'https://github.com/collab1.png' },
              { login: 'collab2', name: 'Collaborator Two', avatar_url: 'https://github.com/collab2.png' }
            ])
          });

        const users = await githubService.getMentionableUsers();

        const collaboratorLogins = users
          .filter(u => u.source === MentionSource.COLLABORATOR)
          .map(u => u.login);
        expect(collaboratorLogins).toContain('collab1');
        expect(collaboratorLogins).toContain('collab2');
      });

      it('should deduplicate users across sources', async () => {
        (global.fetch as jest.Mock)
          // 1. getRepositoryInfo
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 2. getRepositoryInfo (for getDiscussionParticipants)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 3. getDiscussionParticipants - same user as collaborator
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  discussion: {
                    author: { login: 'shareduser', name: 'Shared User', avatarUrl: 'https://github.com/shareduser.png' },
                    comments: { nodes: [] }
                  }
                }
              }
            })
          })
          // 4. getRepositoryCollaborators - same user
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([
              { login: 'shareduser', name: 'Shared User', avatar_url: 'https://github.com/shareduser.png' }
            ])
          });

        const users = await githubService.getMentionableUsers(1);

        // Should have only one entry for shareduser
        const sharedUserCount = users.filter(u => u.login === 'shareduser').length;
        expect(sharedUserCount).toBe(1);
        // Should keep the highest priority source (participant)
        const sharedUser = users.find(u => u.login === 'shareduser');
        expect(sharedUser?.source).toBe(MentionSource.DISCUSSION_PARTICIPANT);
      });

      it('should sort users by priority (participant > collaborator)', async () => {
        (global.fetch as jest.Mock)
          // 1. getRepositoryInfo
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 2. getRepositoryInfo (for getDiscussionParticipants)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 3. getDiscussionParticipants
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  discussion: {
                    author: { login: 'participant1', name: 'P1', avatarUrl: 'https://github.com/p1.png' },
                    comments: { nodes: [] }
                  }
                }
              }
            })
          })
          // 4. getRepositoryCollaborators
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([
              { login: 'collaborator1', name: 'C1', avatar_url: 'https://github.com/c1.png' }
            ])
          });

        const users = await githubService.getMentionableUsers(1);

        // Find indexes
        const participantIndex = users.findIndex(u => u.login === 'participant1');
        const collaboratorIndex = users.findIndex(u => u.login === 'collaborator1');

        // Both should exist
        expect(participantIndex).toBeGreaterThanOrEqual(0);
        expect(collaboratorIndex).toBeGreaterThanOrEqual(0);
        // Participants should come before collaborators
        expect(participantIndex).toBeLessThan(collaboratorIndex);
      });

      it('should return empty array when not authenticated', async () => {
        mockAuthService.getSessionSilent.mockResolvedValue(undefined);

        const users = await githubService.getMentionableUsers();

        expect(users).toEqual([]);
      });

      it('should handle API errors gracefully', async () => {
        (global.fetch as jest.Mock)
          // getRepositoryInfo succeeds
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'owner' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // getRepositoryCollaborators - fails
          .mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden'
          });

        // Should not throw, but return empty or partial results
        const users = await githubService.getMentionableUsers();
        expect(Array.isArray(users)).toBe(true);
      });
    });

    describe('searchOrganizationMembers', () => {
      beforeEach(() => {
        const { execSync } = require('child_process');
        execSync.mockReturnValue('origin\tgit@github.com:my-org/repo.git (fetch)\n');
      });

      it('should search organization members by query', async () => {
        (global.fetch as jest.Mock)
          // 1. getRepositoryInfo
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'my-org' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 2. isOrganizationRepository - check owner type (Organization)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({ type: 'Organization' })
          })
          // 3. Search users API
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              items: [
                { login: 'org-member1', avatar_url: 'https://github.com/org-member1.png' },
                { login: 'org-member2', avatar_url: 'https://github.com/org-member2.png' }
              ]
            })
          });

        const users = await githubService.searchOrganizationMembers('member');

        expect(users.length).toBe(2);
        expect(users[0].login).toBe('org-member1');
        expect(users[1].login).toBe('org-member2');
        expect(users[0].source).toBe(MentionSource.ORG_MEMBER);
      });

      it('should return empty array for non-organization repositories', async () => {
        (global.fetch as jest.Mock)
          // 1. getRepositoryInfo
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: 'repo',
                  owner: { login: 'user' },
                  hasDiscussionsEnabled: true
                }
              }
            })
          })
          // 2. isOrganizationRepository - check owner type (User, not org)
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({ type: 'User' })
          });

        const users = await githubService.searchOrganizationMembers('member');

        expect(users).toEqual([]);
      });

      it('should return empty array for empty query', async () => {
        const users = await githubService.searchOrganizationMembers('');

        expect(users).toEqual([]);
      });

      it('should return empty array when not authenticated', async () => {
        mockAuthService.getSessionSilent.mockResolvedValue(undefined);

        const users = await githubService.searchOrganizationMembers('member');

        expect(users).toEqual([]);
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property 2: Repository Detection Reliability
     * For any valid GitHub remote URL format, the service should correctly parse owner/repo
     * Validates: Requirement 2.1
     */
    it('should reliably detect repository from various GitHub URL formats', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          owner: fc.string({ minLength: 1, maxLength: 39 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s) && !s.startsWith('-') && !s.endsWith('-')),
          // Repo name must start with alphanumeric and can contain alphanumeric, dots, underscores, hyphens
          // But cannot be just dots (e.g., "." or "..") as GitHub's API doesn't allow this
          repo: fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s))
        }),
        fc.constantFrom('ssh', 'https'),
        async ({ owner, repo }, protocol) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();
          (global.fetch as jest.Mock).mockReset();

          const { execSync } = require('child_process');

          // Generate URL based on protocol
          const remoteUrl = protocol === 'ssh'
            ? `origin\tgit@github.com:${owner}/${repo}.git (fetch)\n`
            : `origin\thttps://github.com/${owner}/${repo}.git (fetch)\n`;

          execSync.mockReturnValue(remoteUrl);

          // Setup fresh mock auth service for each iteration
          const freshMockAuthService = {
            getSession: jest.fn().mockResolvedValue(mockSession),
            getSessionSilent: jest.fn().mockResolvedValue(mockSession),
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getCurrentUser: jest.fn(),
            onDidChangeAuthenticationState: jest.fn() as any,
            dispose: jest.fn()
          } as any;

          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              data: {
                repository: {
                  id: 'R_123',
                  name: repo,
                  owner: { login: owner },
                  hasDiscussionsEnabled: true
                }
              }
            })
          });

          const testService = new GitHubService(freshMockAuthService);

          try {
            const repoInfo = await testService.getRepositoryInfo();

            // Property: Owner and repo should be correctly extracted
            expect(repoInfo.owner).toBe(owner);
            expect(repoInfo.name).toBe(repo);
            expect(repoInfo.fullName).toBe(`${owner}/${repo}`);
          } finally {
            testService.dispose();
          }
        }
      ), { numRuns: 50 });
    });

    /**
     * Property 3: GitHub API Call Integrity
     * API calls should maintain data integrity through transformation
     * Validates: Requirements 2.2, 4.3, 5.2, 6.3
     */
    it('should maintain data integrity when transforming API responses for summaries', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          discussionId: fc.string({ minLength: 1, maxLength: 50 }),
          discussionNumber: fc.integer({ min: 1, max: 99999 }),
          title: fc.string({ minLength: 1, maxLength: 256 }),
          authorLogin: fc.string({ minLength: 1, maxLength: 39 }),
          categoryName: fc.string({ minLength: 1, maxLength: 50 }),
          isAnswered: fc.boolean(),
          commentsCount: fc.integer({ min: 0, max: 1000 })
        }),
        async (testData) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();
          (global.fetch as jest.Mock).mockReset();

          const { execSync } = require('child_process');
          execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

          // Setup fresh mock auth service for each iteration
          const freshMockAuthService = {
            getSession: jest.fn().mockResolvedValue(mockSession),
            getSessionSilent: jest.fn().mockResolvedValue(mockSession),
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getCurrentUser: jest.fn(),
            onDidChangeAuthenticationState: jest.fn() as any,
            dispose: jest.fn()
          } as any;

          const mockDiscussionSummariesResponse = {
            data: {
              repository: {
                discussions: {
                  nodes: [{
                    id: testData.discussionId,
                    number: testData.discussionNumber,
                    title: testData.title,
                    author: {
                      login: testData.authorLogin,
                      avatarUrl: `https://github.com/${testData.authorLogin}.png`
                    },
                    category: {
                      id: 'C_1',
                      name: testData.categoryName,
                      description: 'Test category',
                      emoji: ':test:',
                      isAnswerable: false
                    },
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                    isAnswered: testData.isAnswered,
                    comments: { totalCount: testData.commentsCount }
                  }],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          };

          (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue({
                data: {
                  repository: {
                    id: 'R_123',
                    name: 'repo',
                    owner: { login: 'owner' },
                    hasDiscussionsEnabled: true
                  }
                }
              })
            })
            .mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue(mockDiscussionSummariesResponse)
            });

          const testService = new GitHubService(freshMockAuthService);

          try {
            const result = await testService.getDiscussionSummaries();

            // Property: Data should be preserved through transformation
            expect(result.discussions).toHaveLength(1);
            const summary = result.discussions[0];

            expect(summary.id).toBe(testData.discussionId);
            expect(summary.number).toBe(testData.discussionNumber);
            expect(summary.title).toBe(testData.title);
            expect(summary.author.login).toBe(testData.authorLogin);
            expect(summary.category.name).toBe(testData.categoryName);
            expect(summary.isAnswered).toBe(testData.isAnswered);
            expect(summary.commentsCount).toBe(testData.commentsCount);
            // Verify body is not present in summary (lazy loading)
            expect((summary as any).body).toBeUndefined();
            // Verify pageInfo is present
            expect(result.pageInfo).toBeDefined();
            expect(typeof result.pageInfo.hasNextPage).toBe('boolean');
          } finally {
            testService.dispose();
          }
        }
      ), { numRuns: 50 });
    });
  });
});
