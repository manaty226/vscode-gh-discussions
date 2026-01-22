/**
 * Discussion File System Provider - Virtual File System for GitHub Discussions
 * Requirements: 4.1, 4.2, 6.2, 4.3, 6.3
 */

import * as vscode from 'vscode';
import { IGitHubService, ICacheService } from '../services/interfaces';
import { Discussion, DiscussionSummary, DiscussionMetadata, CommentsData } from '../models';
import { sanitizeFileName } from '../utils/fileNameUtils';
import { CACHE_DEFAULT_TTL_MS } from '../constants';

/** Cache key prefix for discussions */
const CACHE_KEY_DISCUSSION_PREFIX = 'fsProvider:discussion:';

export class DiscussionFileSystemProvider implements vscode.FileSystemProvider {
  public static readonly scheme = 'ghd';

  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

  private pendingNewDiscussions: Map<string, { categoryId?: string }> = new Map();

  /** Cached discussion numbers for notifyDiscussionsUpdated */
  private cachedDiscussionNumbers: Set<number> = new Set();

  constructor(
    private githubService: IGitHubService,
    private cacheService?: ICacheService
  ) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { type, discussionNumber, fileName } = this.parsePath(uri.path);

    if (type === 'root' || type === 'discussions') {
      return {
        type: vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      };
    }

    if (type === 'discussion' && discussionNumber !== undefined) {
      if (!fileName) {
        // Discussion folder
        return {
          type: vscode.FileType.Directory,
          ctime: Date.now(),
          mtime: Date.now(),
          size: 0
        };
      }

      // New discussion (NaN means "new")
      if (isNaN(discussionNumber)) {
        if (fileName.endsWith('.md')) {
          return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0
          };
        }
      }

      // Existing discussion - files within discussion folder
      const discussion = await this.getDiscussion(discussionNumber);
      const expectedFileName = sanitizeFileName(discussion.title) + '.md';

      if (fileName === expectedFileName || fileName === '_metadata.json' || fileName === '_comments.json') {
        return {
          type: vscode.FileType.File,
          ctime: discussion.createdAt.getTime(),
          mtime: discussion.updatedAt.getTime(),
          size: 0
        };
      }
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { type, discussionNumber } = this.parsePath(uri.path);

    if (type === 'root') {
      return [['discussions', vscode.FileType.Directory]];
    }

    if (type === 'discussions') {
      const summaries = await this.githubService.getDiscussionSummaries();
      return summaries.map((d: DiscussionSummary) => [d.number.toString(), vscode.FileType.Directory]);
    }

    if (type === 'discussion' && discussionNumber !== undefined) {
      const discussion = await this.getDiscussion(discussionNumber);
      const fileName = sanitizeFileName(discussion.title) + '.md';
      return [
        [fileName, vscode.FileType.File],
        ['_metadata.json', vscode.FileType.File],
        ['_comments.json', vscode.FileType.File]
      ];
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { type, discussionNumber, fileName } = this.parsePath(uri.path);

    if (type !== 'discussion' || discussionNumber === undefined || !fileName) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    // New discussion - return empty content (will be filled by extension)
    if (isNaN(discussionNumber)) {
      return new TextEncoder().encode('');
    }

    const discussion = await this.getDiscussion(discussionNumber);
    const expectedFileName = sanitizeFileName(discussion.title) + '.md';

    if (fileName === expectedFileName) {
      const content = this.formatDiscussionAsMarkdown(discussion);
      return new TextEncoder().encode(content);
    }

    if (fileName === '_metadata.json') {
      const metadata: DiscussionMetadata = {
        id: discussion.id,
        number: discussion.number,
        title: discussion.title,
        author: discussion.author,
        category: discussion.category,
        createdAt: discussion.createdAt.toISOString(),
        updatedAt: discussion.updatedAt.toISOString(),
        isAnswered: discussion.isAnswered,
        answer: discussion.answer ?? null,
        reactions: discussion.reactions
      };
      return new TextEncoder().encode(JSON.stringify(metadata, null, 2));
    }

    if (fileName === '_comments.json') {
      const commentsData: CommentsData = {
        totalCount: discussion.comments.length,
        comments: discussion.comments
      };
      return new TextEncoder().encode(JSON.stringify(commentsData, null, 2));
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const { type, discussionNumber, fileName } = this.parsePath(uri.path);

    if (type !== 'discussion' || !fileName) {
      throw vscode.FileSystemError.NoPermissions(uri);
    }

    // Decode the filename (it may be URL-encoded)
    const decodedFileName = decodeURIComponent(fileName);

    if (!decodedFileName.endsWith('.md')) {
      throw vscode.FileSystemError.NoPermissions('Only markdown files can be edited');
    }

    const text = new TextDecoder().decode(content);
    const body = text.trim();

    // タイトルはファイル名から取得（.md を除去、URLデコード済み）
    const title = decodedFileName.slice(0, -3);

    if (discussionNumber === undefined || isNaN(discussionNumber)) {
      // New discussion
      const repoInfo = await this.githubService.getRepositoryInfo();
      const categories = await this.githubService.getDiscussionCategories();

      // Get category from pending discussions (set by extension when creating)
      const pending = this.pendingNewDiscussions.get(uri.path);
      const category = pending?.categoryId
        ? categories.find(c => c.id === pending.categoryId)
        : categories[0];

      if (!category) {
        throw new Error('No discussion category available');
      }

      const newDiscussion = await this.githubService.createDiscussion({
        repositoryId: repoInfo.id,
        categoryId: category.id,
        title,
        body
      });

      // Cache the new discussion and clean up pending
      this.setDiscussionCache(newDiscussion.number, newDiscussion);
      this.pendingNewDiscussions.delete(uri.path);
    } else {
      // Update existing discussion
      const discussion = await this.getDiscussion(discussionNumber);

      const updatedDiscussion = await this.githubService.updateDiscussion(discussion.id, {
        title,
        body
      });

      // Update cache
      this.setDiscussionCache(discussionNumber, updatedDiscussion);
    }

    // Fire change event
    this._onDidChangeFile.fire([{
      type: vscode.FileChangeType.Changed,
      uri
    }]);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const { type, discussionNumber } = this.parsePath(uri.path);

    if (type === 'discussion' && (discussionNumber === undefined || isNaN(discussionNumber))) {
      // Creating a "new" discussion folder is allowed
      this.pendingNewDiscussions.set(uri.path, {});
      return;
    }

    throw vscode.FileSystemError.NoPermissions(uri);
  }

  async delete(uri: vscode.Uri, _options: { recursive: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions('Delete operation is not supported');
  }

  /**
   * Set category for a new discussion (before saving)
   */
  setPendingCategory(path: string, categoryId: string): void {
    this.pendingNewDiscussions.set(path, { categoryId });
  }

  async rename(oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions('Rename operation is not supported');
  }

  /**
   * Invalidate cache for a specific discussion or all discussions
   */
  invalidateCache(discussionNumber?: number): void {
    if (this.cacheService) {
      if (discussionNumber !== undefined) {
        this.cacheService.invalidate(`${CACHE_KEY_DISCUSSION_PREFIX}${discussionNumber}`);
        this.cachedDiscussionNumbers.delete(discussionNumber);
      } else {
        this.cacheService.invalidateByPattern(new RegExp(`^${CACHE_KEY_DISCUSSION_PREFIX}`));
        this.cachedDiscussionNumbers.clear();
      }
    } else {
      // Fallback: just clear the tracked numbers
      if (discussionNumber !== undefined) {
        this.cachedDiscussionNumbers.delete(discussionNumber);
      } else {
        this.cachedDiscussionNumbers.clear();
      }
    }
  }

  /**
   * Notify that discussions have been updated externally
   * This triggers UI refresh for open files
   */
  notifyDiscussionsUpdated(): void {
    // Fire change events for all cached discussions
    for (const number of this.cachedDiscussionNumbers) {
      const uri = vscode.Uri.parse(`${DiscussionFileSystemProvider.scheme}:/discussions/${number}`);
      this._onDidChangeFile.fire([{
        type: vscode.FileChangeType.Changed,
        uri
      }]);
    }
  }

  dispose(): void {
    this._onDidChangeFile.dispose();
    this.invalidateCache();
    this.pendingNewDiscussions.clear();
  }

  /**
   * Parse URI path to extract discussion information
   */
  private parsePath(path: string): {
    type: 'root' | 'discussions' | 'discussion' | 'unknown';
    discussionNumber?: number;
    fileName?: string;
  } {
    const parts = path.split('/').filter(Boolean);

    if (parts.length === 0) {
      return { type: 'root' };
    }

    if (parts[0] === 'discussions') {
      if (parts.length === 1) {
        return { type: 'discussions' };
      }

      const discussionNumber = parts[1] === 'new' ? NaN : parseInt(parts[1], 10);

      if (parts.length === 2) {
        return { type: 'discussion', discussionNumber };
      }

      if (parts.length === 3) {
        return {
          type: 'discussion',
          discussionNumber,
          fileName: parts[2]
        };
      }
    }

    return { type: 'unknown' };
  }

  /**
   * Get discussion from cache or API
   */
  private async getDiscussion(number: number): Promise<Discussion> {
    const cacheKey = `${CACHE_KEY_DISCUSSION_PREFIX}${number}`;

    // Use CacheService if available
    if (this.cacheService) {
      const discussion = await this.cacheService.getOrSet(
        cacheKey,
        () => this.githubService.getDiscussion(number),
        CACHE_DEFAULT_TTL_MS
      );
      this.cachedDiscussionNumbers.add(number);
      return discussion;
    }

    // Fallback to direct fetch
    const discussion = await this.githubService.getDiscussion(number);
    this.cachedDiscussionNumbers.add(number);
    return discussion;
  }

  /**
   * Store discussion in cache
   */
  private setDiscussionCache(number: number, discussion: Discussion): void {
    const cacheKey = `${CACHE_KEY_DISCUSSION_PREFIX}${number}`;
    if (this.cacheService) {
      this.cacheService.set(cacheKey, discussion, CACHE_DEFAULT_TTL_MS);
    }
    this.cachedDiscussionNumbers.add(number);
  }

  /**
   * Format discussion as Markdown file content (body only, title is in filename)
   */
  private formatDiscussionAsMarkdown(discussion: Discussion): string {
    return discussion.body;
  }
}
