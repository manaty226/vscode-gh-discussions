/**
 * Service interfaces for GitHub Discussions extension
 */

import * as vscode from 'vscode';
import {
  Discussion,
  DiscussionSummary,
  DiscussionCategory,
  DiscussionQueryOptions,
  CreateDiscussionInput,
  UpdateDiscussionInput,
  RepositoryInfo,
  User,
  AuthenticationState,
  ExtensionSettings,
  CommentsPage
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
  getDiscussionSummaries(options?: DiscussionQueryOptions): Promise<DiscussionSummary[]>;
  getDiscussion(number: number): Promise<Discussion>;
  getDiscussionComments(discussionNumber: number, after?: string): Promise<CommentsPage>;
  createDiscussion(input: CreateDiscussionInput): Promise<Discussion>;
  updateDiscussion(id: string, input: UpdateDiscussionInput): Promise<Discussion>;
  getDiscussionCategories(): Promise<DiscussionCategory[]>;
  addComment(discussionId: string, body: string): Promise<void>;
  addReply(discussionId: string, commentId: string, body: string): Promise<void>;
  updateComment(commentId: string, body: string): Promise<void>;
  deleteComment(commentId: string): Promise<void>;
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

