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
 * Paginated discussion summaries response
 * Requirement 14.5: Pagination info from API response
 */
export interface DiscussionSummariesPage {
  discussions: DiscussionSummary[];
  pageInfo: PageInfo;
}

/**
 * Pagination state for a category in tree view
 * Requirement 14.5, 14.7: Category-specific pagination state
 */
export interface CategoryPaginationState {
  hasNextPage: boolean;
  endCursor: string | null;
  isLoading: boolean;
}

/**
 * Load state for category lazy loading
 * Requirement 15: Category expansion lazy loading
 */
export type CategoryLoadState = 'not_loaded' | 'loading' | 'loaded' | 'error';

/**
 * Category state including load state, discussions, and pagination
 * Requirement 15: Category expansion lazy loading
 */
export interface CategoryState {
  loadState: CategoryLoadState;
  discussions: DiscussionSummary[];
  paginationState?: CategoryPaginationState;
  error?: Error;
}

/**
 * Recent comment info for unread detection (Requirement 20.11)
 */
export interface RecentComment {
  createdAt: Date;
  viewerDidAuthor: boolean;
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
  /**
   * Recent comments (last 10) for detecting unread state
   * Used to filter out own comments from unread notifications (Requirement 20.11)
   */
  recentComments?: RecentComment[];
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

/**
 * Source of mentionable users (for priority sorting)
 * Requirement 19.6: Priority order for mention suggestions
 */
export enum MentionSource {
  DISCUSSION_PARTICIPANT = 'participant', // Highest priority
  COLLABORATOR = 'collaborator',
  ORG_MEMBER = 'org_member', // Lowest priority
}

/**
 * Mentionable user for @mention suggestions
 * Requirement 19: Mention functionality
 */
export interface MentionableUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  source: MentionSource;
}

/**
 * Unread state for notification badge (Requirement 19.5)
 */
export interface UnreadState {
  /** List of unread discussion IDs */
  unreadIds: string[];
  /** ISO 8601 timestamp of last check */
  lastCheckedAt: string;
}
