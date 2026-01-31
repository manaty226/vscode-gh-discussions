/**
 * Service interfaces for GitHub Discussions extension
 */

import * as vscode from 'vscode';
import {
  Discussion,
  DiscussionSummariesPage,
  DiscussionCategory,
  DiscussionQueryOptions,
  CreateDiscussionInput,
  UpdateDiscussionInput,
  RepositoryInfo,
  User,
  AuthenticationState,
  ExtensionSettings,
  CommentsPage,
  MentionableUser
} from '../models';

export interface IAuthenticationService {
  getSession(): Promise<vscode.AuthenticationSession | undefined>;
  getSessionSilent(): Promise<vscode.AuthenticationSession | undefined>;
  isAuthenticated(): Promise<boolean>;
  getCurrentUser(): Promise<User | undefined>;
  onDidChangeAuthenticationState: vscode.Event<AuthenticationState>;
}

export interface IGitHubService {
  getRepositoryInfo(): Promise<RepositoryInfo>;
  getDiscussionSummaries(options?: DiscussionQueryOptions): Promise<DiscussionSummariesPage>;
  getDiscussion(number: number): Promise<Discussion>;
  getDiscussionComments(discussionNumber: number, after?: string): Promise<CommentsPage>;
  createDiscussion(input: CreateDiscussionInput): Promise<Discussion>;
  updateDiscussion(id: string, input: UpdateDiscussionInput): Promise<Discussion>;
  getDiscussionCategories(): Promise<DiscussionCategory[]>;
  addComment(discussionId: string, body: string): Promise<void>;
  addReply(discussionId: string, commentId: string, body: string): Promise<void>;
  updateComment(commentId: string, body: string): Promise<void>;
  deleteComment(commentId: string): Promise<void>;
  getMentionableUsers(discussionNumber?: number): Promise<MentionableUser[]>;
  searchOrganizationMembers(query: string): Promise<MentionableUser[]>;
}

export interface IStorageService {
  storeToken(token: string): Promise<void>;
  getToken(): Promise<string | undefined>;
  clearToken(): Promise<void>;
  storeSettings(settings: Partial<ExtensionSettings>): Promise<void>;
  getSettings(): Promise<ExtensionSettings>;
  storeData<T>(key: string, data: T): Promise<void>;
  getData<T>(key: string): Promise<T | undefined>;
  clearData(key: string): Promise<void>;
}

export interface ICacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): void;
  invalidate(key: string): void;
  invalidateByPattern(pattern: RegExp): void;
  clear(): void;
  has(key: string): boolean;
  getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
}

/**
 * Notification badge service interface (Requirement 19, 20)
 */
export interface INotificationBadgeService {
  /**
   * Update the badge by checking for new comments on user's discussions
   * Requirement 19.1, 19.2, 19.3
   */
  updateBadge(): Promise<void>;

  /**
   * Mark a discussion as read
   * Requirement 19.4
   */
  markAsRead(discussionId: string): Promise<void>;

  /**
   * Get the list of unread discussion IDs
   * Requirement 20.5
   */
  getUnreadIds(): string[];

  /**
   * Event fired when unread state changes
   * Requirement 20.5
   */
  onDidChangeUnreadState: vscode.Event<void>;

  /**
   * Dispose resources
   */
  dispose(): void;
}
