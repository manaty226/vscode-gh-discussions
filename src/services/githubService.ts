/**
 * GitHub Service - GraphQL API client for GitHub Discussions
 * Requirements: 2.1, 2.2, 4.3, 5.2, 6.3
 */

import {
  IGitHubService,
  IAuthenticationService,
  ICacheService
} from './interfaces';
import { CACHE_DEFAULT_TTL_MS } from '../constants';
import {
  Discussion,
  DiscussionSummary,
  DiscussionCategory,
  DiscussionQueryOptions,
  CreateDiscussionInput,
  UpdateDiscussionInput,
  RepositoryInfo,
  User,
  DiscussionComment,
  Reaction,
  CommentsPage,
  PageInfo
} from '../models';
import { IGitRemoteParser, GitRemoteParser } from '../infrastructure/gitRemoteParser';
import { IGraphQLClient, GraphQLClient } from '../infrastructure/graphqlClient';

interface RepositoryGraphQLResponse {
  repository: {
    id: string;
    name: string;
    owner: { login: string };
    hasDiscussionsEnabled: boolean;
  };
}

interface DiscussionsGraphQLResponse {
  repository: {
    discussions: {
      nodes: RawDiscussion[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

interface CategoriesGraphQLResponse {
  repository: {
    discussionCategories: {
      nodes: RawCategory[];
    };
  };
}

interface CreateDiscussionGraphQLResponse {
  createDiscussion: {
    discussion: RawDiscussion;
  };
}

interface UpdateDiscussionGraphQLResponse {
  updateDiscussion: {
    discussion: RawDiscussion;
  };
}

interface AddCommentGraphQLResponse {
  addDiscussionComment: {
    comment: {
      id: string;
      body: string;
    };
  };
}

interface CommentsGraphQLResponse {
  repository: {
    discussion: {
      comments: {
        nodes: RawComment[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
}

interface RawUser {
  login: string;
  avatarUrl: string;
}

interface RawCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  isAnswerable: boolean;
}

interface RawReactionGroup {
  content: string;
  reactors: { totalCount: number };
  viewerHasReacted: boolean;
}

interface RawComment {
  id: string;
  body: string;
  bodyHTML: string;
  author: RawUser;
  createdAt: string;
  updatedAt: string;
  reactionGroups: RawReactionGroup[];
  replies?: { nodes: RawComment[] };
}

interface RawDiscussion {
  id: string;
  number: number;
  title: string;
  body: string;
  bodyHTML: string;
  author: RawUser;
  category: RawCategory;
  createdAt: string;
  updatedAt: string;
  isAnswered: boolean;
  answer?: RawComment;
  reactionGroups: RawReactionGroup[];
  comments: {
    nodes: RawComment[];
    pageInfo?: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

/**
 * Lightweight discussion data for list display (lazy loading)
 */
interface RawDiscussionSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  author: RawUser;
  category: RawCategory;
  createdAt: string;
  updatedAt: string;
  isAnswered: boolean;
  comments: { totalCount: number };
}

interface DiscussionSummariesGraphQLResponse {
  repository: {
    discussions: {
      nodes: RawDiscussionSummary[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

/** Cache key for repository info */
const CACHE_KEY_REPO_INFO = 'github:repoInfo';

export class GitHubService implements IGitHubService {
  private readonly gitRemoteParser: IGitRemoteParser;
  private readonly graphqlClient: IGraphQLClient;

  constructor(
    private authService: IAuthenticationService,
    private cacheService?: ICacheService,
    gitRemoteParser?: IGitRemoteParser,
    graphqlClient?: IGraphQLClient
  ) {
    // Use injected dependencies or create defaults
    this.gitRemoteParser = gitRemoteParser ?? new GitRemoteParser();
    this.graphqlClient = graphqlClient ?? new GraphQLClient();
  }

  /**
   * Get repository information from git remote
   * Requirement 2.1: Repository detection
   */
  async getRepositoryInfo(): Promise<RepositoryInfo> {
    // Use CacheService if available
    if (this.cacheService) {
      return this.cacheService.getOrSet(
        CACHE_KEY_REPO_INFO,
        () => this.fetchRepositoryInfo(),
        CACHE_DEFAULT_TTL_MS
      );
    }

    // Fallback to direct fetch (for backward compatibility in tests)
    return this.fetchRepositoryInfo();
  }

  /**
   * Fetch repository info from GitHub API (internal)
   */
  private async fetchRepositoryInfo(): Promise<RepositoryInfo> {
    const { owner, name } = this.gitRemoteParser.parseGitRemote();

    const session = await this.authService.getSessionSilent();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const query = `
      query GetRepository($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          name
          owner { login }
          hasDiscussionsEnabled
        }
      }
    `;

    const response = await this.graphqlClient.query<RepositoryGraphQLResponse>(
      query,
      { owner, name },
      session.accessToken
    );

    return {
      id: response.repository.id,
      owner: response.repository.owner.login,
      name: response.repository.name,
      fullName: `${response.repository.owner.login}/${response.repository.name}`,
      hasDiscussionsEnabled: response.repository.hasDiscussionsEnabled
    };
  }

  /**
   * Get discussion summaries from repository (lightweight, for list display)
   * Requirement 2.2: Fetch discussions metadata via GitHub API (lazy loading)
   */
  async getDiscussionSummaries(options?: DiscussionQueryOptions): Promise<DiscussionSummary[]> {
    const session = await this.authService.getSessionSilent();
    if (!session) {
      return [];
    }

    const repoInfo = await this.getRepositoryInfo();

    // Lightweight query: no body, bodyHTML, comments content, or reactions
    // Filter to OPEN discussions only (closed discussions are excluded by default)
    const query = `
      query GetDiscussionSummaries($owner: String!, $name: String!, $first: Int, $after: String, $categoryId: ID) {
        repository(owner: $owner, name: $name) {
          discussions(first: $first, after: $after, categoryId: $categoryId, states: [OPEN]) {
            nodes {
              id
              number
              title
              url
              author {
                login
                avatarUrl
              }
              category {
                id
                name
                description
                emoji
                isAnswerable
              }
              createdAt
              updatedAt
              isAnswered
              comments {
                totalCount
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.query<DiscussionSummariesGraphQLResponse>(
      query,
      {
        owner: repoInfo.owner,
        name: repoInfo.name,
        first: options?.first ?? 20,
        after: options?.after,
        categoryId: options?.categoryId
      },
      session.accessToken
    );

    return response.repository.discussions.nodes.map(d => this.transformDiscussionSummary(d));
  }

  /**
   * Get a single discussion by number
   */
  async getDiscussion(number: number): Promise<Discussion> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const repoInfo = await this.getRepositoryInfo();

    const query = `
      query GetDiscussion($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          discussion(number: $number) {
            id
            number
            title
            body
            bodyHTML
            author {
              login
              avatarUrl
            }
            category {
              id
              name
              description
              emoji
              isAnswerable
            }
            createdAt
            updatedAt
            isAnswered
            answer {
              id
              body
              bodyHTML
              author {
                login
                avatarUrl
              }
              createdAt
              updatedAt
              reactionGroups {
                content
                reactors { totalCount }
                viewerHasReacted
              }
            }
            reactionGroups {
              content
              reactors { totalCount }
              viewerHasReacted
            }
            comments(first: 100) {
              nodes {
                id
                body
                bodyHTML
                author {
                  login
                  avatarUrl
                }
                createdAt
                updatedAt
                reactionGroups {
                  content
                  reactors { totalCount }
                  viewerHasReacted
                }
                replies(first: 100) {
                  nodes {
                    id
                    body
                    bodyHTML
                    author {
                      login
                      avatarUrl
                    }
                    createdAt
                    updatedAt
                    reactionGroups {
                      content
                      reactors { totalCount }
                      viewerHasReacted
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.query<{ repository: { discussion: RawDiscussion } }>(
      query,
      {
        owner: repoInfo.owner,
        name: repoInfo.name,
        number
      },
      session.accessToken
    );

    return this.transformDiscussion(response.repository.discussion);
  }

  /**
   * Get discussion comments with pagination support
   * Requirement 11.1: Comments are paginated 100 at a time
   * Requirement 11.6: Pagination info (hasNextPage, endCursor) from API response
   */
  async getDiscussionComments(discussionNumber: number, after?: string): Promise<CommentsPage> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const repoInfo = await this.getRepositoryInfo();

    const query = `
      query GetDiscussionComments($owner: String!, $name: String!, $number: Int!, $first: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          discussion(number: $number) {
            comments(first: $first, after: $after) {
              nodes {
                id
                body
                bodyHTML
                author {
                  login
                  avatarUrl
                }
                createdAt
                updatedAt
                reactionGroups {
                  content
                  reactors { totalCount }
                  viewerHasReacted
                }
                replies(first: 100) {
                  nodes {
                    id
                    body
                    bodyHTML
                    author {
                      login
                      avatarUrl
                    }
                    createdAt
                    updatedAt
                    reactionGroups {
                      content
                      reactors { totalCount }
                      viewerHasReacted
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.query<CommentsGraphQLResponse>(
      query,
      {
        owner: repoInfo.owner,
        name: repoInfo.name,
        number: discussionNumber,
        first: 100,
        after: after ?? null
      },
      session.accessToken
    );

    const commentsData = response.repository.discussion.comments;

    return {
      comments: commentsData.nodes.map(c => this.transformComment(c)),
      pageInfo: {
        hasNextPage: commentsData.pageInfo.hasNextPage,
        endCursor: commentsData.pageInfo.endCursor
      }
    };
  }

  /**
   * Create a new discussion
   * Requirement 4.3: Create discussion via API
   */
  async createDiscussion(input: CreateDiscussionInput): Promise<Discussion> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const mutation = `
      mutation CreateDiscussion($input: CreateDiscussionInput!) {
        createDiscussion(input: $input) {
          discussion {
            id
            number
            title
            body
            bodyHTML
            author {
              login
              avatarUrl
            }
            category {
              id
              name
              description
              emoji
              isAnswerable
            }
            createdAt
            updatedAt
            isAnswered
            reactionGroups {
              content
              reactors { totalCount }
              viewerHasReacted
            }
            comments(first: 10) {
              nodes {
                id
                body
                bodyHTML
                author {
                  login
                  avatarUrl
                }
                createdAt
                updatedAt
                reactionGroups {
                  content
                  reactors { totalCount }
                  viewerHasReacted
                }
              }
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.query<CreateDiscussionGraphQLResponse>(
      mutation,
      { input },
      session.accessToken
    );

    return this.transformDiscussion(response.createDiscussion.discussion);
  }

  /**
   * Update an existing discussion
   * Requirement 6.3: Update discussion via API
   */
  async updateDiscussion(id: string, input: UpdateDiscussionInput): Promise<Discussion> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const mutation = `
      mutation UpdateDiscussion($discussionId: ID!, $title: String, $body: String) {
        updateDiscussion(input: { discussionId: $discussionId, title: $title, body: $body }) {
          discussion {
            id
            number
            title
            body
            bodyHTML
            author {
              login
              avatarUrl
            }
            category {
              id
              name
              description
              emoji
              isAnswerable
            }
            createdAt
            updatedAt
            isAnswered
            reactionGroups {
              content
              reactors { totalCount }
              viewerHasReacted
            }
            comments(first: 10) {
              nodes {
                id
                body
                bodyHTML
                author {
                  login
                  avatarUrl
                }
                createdAt
                updatedAt
                reactionGroups {
                  content
                  reactors { totalCount }
                  viewerHasReacted
                }
              }
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.query<UpdateDiscussionGraphQLResponse>(
      mutation,
      {
        discussionId: id,
        title: input.title,
        body: input.body
      },
      session.accessToken
    );

    return this.transformDiscussion(response.updateDiscussion.discussion);
  }

  /**
   * Get discussion categories
   */
  async getDiscussionCategories(): Promise<DiscussionCategory[]> {
    const session = await this.authService.getSessionSilent();
    if (!session) {
      return [];
    }

    const repoInfo = await this.getRepositoryInfo();

    const query = `
      query GetCategories($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          discussionCategories(first: 50) {
            nodes {
              id
              name
              description
              emoji
              isAnswerable
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.query<CategoriesGraphQLResponse>(
      query,
      {
        owner: repoInfo.owner,
        name: repoInfo.name
      },
      session.accessToken
    );

    return response.repository.discussionCategories.nodes.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      emoji: c.emoji,
      isAnswerable: c.isAnswerable
    }));
  }

  /**
   * Add a comment to a discussion
   * Requirement 5.2: Post comment via API
   */
  async addComment(discussionId: string, body: string): Promise<void> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const mutation = `
      mutation AddComment($discussionId: ID!, $body: String!) {
        addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
          comment {
            id
            body
          }
        }
      }
    `;

    await this.graphqlClient.query<AddCommentGraphQLResponse>(
      mutation,
      { discussionId, body },
      session.accessToken
    );
  }

  /**
   * Add a reply to a comment
   * Requirement 5.11: Post reply to comment via API
   */
  async addReply(discussionId: string, commentId: string, body: string): Promise<void> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const mutation = `
      mutation AddReply($discussionId: ID!, $replyToId: ID!, $body: String!) {
        addDiscussionComment(input: { discussionId: $discussionId, replyToId: $replyToId, body: $body }) {
          comment {
            id
            body
          }
        }
      }
    `;

    await this.graphqlClient.query<AddCommentGraphQLResponse>(
      mutation,
      { discussionId, replyToId: commentId, body },
      session.accessToken
    );
  }

  /**
   * Update a comment
   * Requirement 13.3: Update comment via API
   */
  async updateComment(commentId: string, body: string): Promise<void> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const mutation = `
      mutation UpdateComment($commentId: ID!, $body: String!) {
        updateDiscussionComment(input: { commentId: $commentId, body: $body }) {
          comment {
            id
            body
          }
        }
      }
    `;

    await this.graphqlClient.query<{ updateDiscussionComment: { comment: { id: string; body: string } } }>(
      mutation,
      { commentId, body },
      session.accessToken
    );
  }

  /**
   * Delete a comment
   * Requirement 13.6: Delete comment via API
   */
  async deleteComment(commentId: string): Promise<void> {
    const session = await this.authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const mutation = `
      mutation DeleteComment($commentId: ID!) {
        deleteDiscussionComment(input: { id: $commentId }) {
          comment {
            id
          }
        }
      }
    `;

    await this.graphqlClient.query<{ deleteDiscussionComment: { comment: { id: string } } }>(
      mutation,
      { commentId },
      session.accessToken
    );
  }

  /**
   * Transform raw API response to Discussion model
   */
  private transformDiscussion(raw: RawDiscussion): Discussion {
    const discussion: Discussion = {
      id: raw.id,
      number: raw.number,
      title: raw.title,
      body: raw.body,
      bodyHTML: raw.bodyHTML,
      author: this.transformUser(raw.author),
      category: {
        id: raw.category.id,
        name: raw.category.name,
        description: raw.category.description,
        emoji: raw.category.emoji,
        isAnswerable: raw.category.isAnswerable
      },
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      isAnswered: raw.isAnswered,
      answer: raw.answer ? this.transformComment(raw.answer) : undefined,
      comments: raw.comments.nodes.map(c => this.transformComment(c)),
      reactions: raw.reactionGroups.map(r => this.transformReactionGroup(r))
    };

    // Add pagination info if available
    if (raw.comments.pageInfo) {
      discussion.commentsPageInfo = {
        hasNextPage: raw.comments.pageInfo.hasNextPage,
        endCursor: raw.comments.pageInfo.endCursor
      };
    }

    return discussion;
  }

  /**
   * Transform raw API response to DiscussionSummary model (lightweight)
   */
  private transformDiscussionSummary(raw: RawDiscussionSummary): DiscussionSummary {
    return {
      id: raw.id,
      number: raw.number,
      title: raw.title,
      url: raw.url,
      author: this.transformUser(raw.author),
      category: {
        id: raw.category.id,
        name: raw.category.name,
        description: raw.category.description,
        emoji: raw.category.emoji,
        isAnswerable: raw.category.isAnswerable
      },
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      isAnswered: raw.isAnswered,
      commentsCount: raw.comments.totalCount
    };
  }

  /**
   * Transform raw user to User model
   */
  private transformUser(raw: RawUser): User {
    return {
      id: raw.login, // GitHub doesn't expose user ID in discussions API
      login: raw.login,
      name: null,
      avatarUrl: raw.avatarUrl
    };
  }

  /**
   * Transform raw comment to DiscussionComment model
   */
  private transformComment(raw: RawComment): DiscussionComment {
    return {
      id: raw.id,
      body: raw.body,
      bodyHTML: raw.bodyHTML,
      author: this.transformUser(raw.author),
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      reactions: raw.reactionGroups.map(r => this.transformReactionGroup(r)),
      replies: raw.replies?.nodes.map(r => this.transformComment(r)) ?? []
    };
  }

  /**
   * Transform raw reaction group to Reaction model
   */
  private transformReactionGroup(raw: RawReactionGroup): Reaction {
    return {
      content: raw.content,
      count: raw.reactors.totalCount,
      viewerHasReacted: raw.viewerHasReacted
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Invalidate cache if CacheService is available
    if (this.cacheService) {
      this.cacheService.invalidate(CACHE_KEY_REPO_INFO);
    }
  }
}
