/**
 * Core data models for GitHub Discussions
 */

export interface User {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface DiscussionCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  isAnswerable: boolean;
}

export interface Reaction {
  content: string;
  count: number;
  viewerHasReacted: boolean;
}

export interface DiscussionComment {
  id: string;
  body: string;
  bodyHTML: string;
  author: User;
  createdAt: Date;
  updatedAt: Date;
  reactions: Reaction[];
  replies: DiscussionComment[];
}

/**
 * Page info for pagination
 */
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Paginated comments response
 */
export interface CommentsPage {
  comments: DiscussionComment[];
  pageInfo: PageInfo;
}

/**
 * Lightweight discussion model for list display (lazy loading)
 * Does not include body, bodyHTML, comments, or reactions
 */
export interface DiscussionSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  author: User;
  category: DiscussionCategory;
  createdAt: Date;
  updatedAt: Date;
  isAnswered: boolean;
  commentsCount: number;
}

/**
 * Full discussion model with body and comments (for detail view)
 */
export interface Discussion {
  id: string;
  number: number;
  title: string;
  body: string;
  bodyHTML: string;
  author: User;
  category: DiscussionCategory;
  createdAt: Date;
  updatedAt: Date;
  isAnswered: boolean;
  answer?: DiscussionComment;
  comments: DiscussionComment[];
  reactions: Reaction[];
  /** Pagination info for comments (only present when there are more comments to load) */
  commentsPageInfo?: PageInfo;
}

export interface RepositoryInfo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  hasDiscussionsEnabled: boolean;
}

export interface DiscussionQueryOptions {
  first?: number;
  after?: string;
  categoryId?: string;
  answered?: boolean;
  orderBy?: {
    field: 'CREATED_AT' | 'UPDATED_AT';
    direction: 'ASC' | 'DESC';
  };
}

export interface CreateDiscussionInput {
  repositoryId: string;
  categoryId: string;
  title: string;
  body: string;
}

export interface UpdateDiscussionInput {
  title?: string;
  body?: string;
}

export interface DiscussionMetadata {
  id: string;
  number: number;
  title: string;
  author: User;
  category: DiscussionCategory;
  createdAt: string;
  updatedAt: string;
  isAnswered: boolean;
  answer: DiscussionComment | null;
  reactions: Reaction[];
}

export interface CommentsData {
  totalCount: number;
  comments: DiscussionComment[];
}

export interface DiscussionTreeItem {
  type: 'category' | 'discussion';
  id: string;
  label: string;
  description?: string;
  discussion?: Discussion;
  category?: DiscussionCategory;
}

export interface WebviewMessage {
  command: string;
  data?: any;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface AuthenticationState {
  isAuthenticated: boolean;
  token?: string;
  user?: User;
}

export interface ExtensionSettings {
  autoRefresh: boolean;
  refreshInterval: number;
  showNotifications: boolean;
  defaultSort: 'newest' | 'oldest' | 'top';
  defaultCategory: string;
}