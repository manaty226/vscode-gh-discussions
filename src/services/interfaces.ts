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
  CacheEntry,
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

export interface IDiscussionsProvider extends vscode.TreeDataProvider<any> {
  refresh(): Promise<void>;
  searchDiscussions(query: string): Promise<void>;
  filterByCategory(categoryId?: string): Promise<void>;
  onDidChangeTreeData: vscode.Event<any>;
}

export interface IWebviewProvider {
  showDiscussion(discussion: Discussion): Promise<void>;
  showDiscussionList(): Promise<void>;
  handleMessage(message: any): Promise<void>;
  dispose(): void;
}

export interface IDiscussionFileSystemProvider extends vscode.FileSystemProvider {
  readFile(uri: vscode.Uri): Promise<Uint8Array>;
  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void>;
  stat(uri: vscode.Uri): Promise<vscode.FileStat>;
  readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]>;
  createDirectory(uri: vscode.Uri): Promise<void>;
  delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void>;
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void>;
  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;
}

export interface IGitHubGraphQLClient {
  query<T>(query: string, variables?: Record<string, any>): Promise<T>;
  mutate<T>(mutation: string, variables?: Record<string, any>): Promise<T>;
  handleErrors(error: any): Error;
  retryWithBackoff<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T>;
}