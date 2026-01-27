/**
 * Discussion Webview Provider
 * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.1, 12.1-12.6
 * Note: Discussion body viewing/editing is now handled by DiscussionFileSystemProvider
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { IGitHubService, IAuthenticationService } from '../services/interfaces';
import { Discussion, User, DiscussionComment } from '../models';
import { DiscussionFileSystemProvider } from './discussionFileSystemProvider';
import { formatRelativeTime } from '../utils/dateTimeUtils';
import { sanitizeHtml } from '../utils';

/**
 * Provider for showing discussion details in a webview
 */
export class DiscussionWebviewProvider {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private githubService: IGitHubService,
    private authService: IAuthenticationService,
    private context: vscode.ExtensionContext
  ) {}

  /**
   * Show a discussion in a webview panel (full view with body and comments)
   * @deprecated Use showComments for comments-only view
   */
  async showDiscussion(discussion: Discussion): Promise<void> {
    const panelKey = `discussion-${discussion.number}`;

    // Check if panel already exists
    const existingPanel = this.panels.get(panelKey);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.One);
      await this.updateWebviewContent(existingPanel, discussion);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'discussionDetail',
      `#${discussion.number} ${discussion.title}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    this.panels.set(panelKey, panel);

    // Handle panel disposal
    panel.onDidDispose(() => {
      this.panels.delete(panelKey);
    }, null, this.disposables);

    // Set up message handling
    panel.webview.onDidReceiveMessage(
      async (message) => await this.handleMessage(message, discussion),
      null,
      this.disposables
    );

    await this.updateWebviewContent(panel, discussion);
  }

  /**
   * Show comments for a discussion in a webview panel (Requirements 5.2, 5.3, 5.4)
   */
  async showComments(discussion: Discussion): Promise<void> {
    const panelKey = `comments-${discussion.number}`;

    // Check if panel already exists
    const existingPanel = this.panels.get(panelKey);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.One);
      await this.updateCommentsContent(existingPanel, discussion);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'discussionComments',
      `Comments: #${discussion.number} ${discussion.title}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    this.panels.set(panelKey, panel);

    // Handle panel disposal
    panel.onDidDispose(() => {
      this.panels.delete(panelKey);
    }, null, this.disposables);

    // Set up message handling - use discussion.id and discussion.number to avoid stale closure
    const discussionId = discussion.id;
    const discussionNumber = discussion.number;
    panel.webview.onDidReceiveMessage(
      async (message) => await this.handleCommentsMessage(message, discussionId, discussionNumber),
      null,
      this.disposables
    );

    await this.updateCommentsContent(panel, discussion);
  }

  /**
   * Update comments webview content
   */
  private async updateCommentsContent(panel: vscode.WebviewPanel, discussion: Discussion): Promise<void> {
    // Check if panel is still valid before updating
    if (!panel || panel.visible === undefined) {
      console.warn('Webview panel is no longer valid, skipping update');
      return;
    }
    try {
      // Get current user for edit/delete button visibility (Requirement 13.1)
      const currentUser = await this.authService.getCurrentUser();
      panel.webview.html = this.getCommentsContent(panel.webview, discussion, currentUser?.login);
    } catch (error) {
      console.warn('Failed to update webview content:', error);
    }
  }

  /**
   * Handle messages from comments webview
   */
  private async handleCommentsMessage(message: any, discussionId: string, discussionNumber: number): Promise<void> {
    switch (message.type) {
      case 'addComment':
        if (message.body && message.body.trim()) {
          await this.githubService.addComment(discussionId, message.body);
          // Refresh comments with latest data
          await this.refreshCommentsPanel(discussionNumber);
        }
        break;
      case 'addReply':
        if (message.body && message.body.trim()) {
          await this.githubService.addReply(discussionId, message.commentId, message.body);
          // Refresh comments with latest data
          await this.refreshCommentsPanel(discussionNumber);
        }
        break;
      case 'loadMoreComments':
        if (message.cursor) {
          await this.loadMoreComments(discussionNumber, message.cursor);
        }
        break;
      case 'updateComment':
        // Requirement 13.3: Update comment via API
        if (message.body && message.body.trim() && message.commentId) {
          await this.githubService.updateComment(message.commentId, message.body);
          // Refresh comments with latest data (Requirement 13.7)
          await this.refreshCommentsPanel(discussionNumber);
        }
        break;
      case 'deleteComment':
        // Requirement 13.6: Delete comment via API
        if (message.commentId) {
          await this.githubService.deleteComment(message.commentId);
          // Refresh comments with latest data (Requirement 13.7)
          await this.refreshCommentsPanel(discussionNumber);
        }
        break;
      case 'getMentionableUsers':
        // Requirement 19: Get mentionable users for @mention suggestions
        await this.handleGetMentionableUsers(discussionNumber);
        break;
      case 'searchOrgMembers':
        // Requirement 19: Search organization members lazily for performance
        await this.handleSearchOrgMembers(discussionNumber, message.query);
        break;
    }
  }

  /**
   * Handle getMentionableUsers message
   * Requirement 19: Mention functionality
   */
  private async handleGetMentionableUsers(discussionNumber: number): Promise<void> {
    const panel = this.panels.get(`comments-${discussionNumber}`);
    if (!panel || panel.visible === undefined) {
      return;
    }

    try {
      const users = await this.githubService.getMentionableUsers(discussionNumber);
      panel.webview.postMessage({
        type: 'mentionableUsers',
        users: users
      });
    } catch (error) {
      console.warn('Failed to get mentionable users:', error);
      panel.webview.postMessage({
        type: 'mentionableUsers',
        users: []
      });
    }
  }

  /**
   * Handle searchOrgMembers message
   * Requirement 19: Search organization members lazily for performance
   */
  private async handleSearchOrgMembers(discussionNumber: number, query: string): Promise<void> {
    const panel = this.panels.get(`comments-${discussionNumber}`);
    if (!panel || panel.visible === undefined) {
      return;
    }

    try {
      const users = await this.githubService.searchOrganizationMembers(query);
      panel.webview.postMessage({
        type: 'orgMembersSearchResult',
        users: users,
        query: query
      });
    } catch (error) {
      console.warn('Failed to search organization members:', error);
      panel.webview.postMessage({
        type: 'orgMembersSearchResult',
        users: [],
        query: query
      });
    }
  }

  /**
   * Load more comments for pagination
   * Requirement 11.4: Load next 100 comments on button click
   */
  private async loadMoreComments(discussionNumber: number, cursor: string): Promise<void> {
    const panel = this.panels.get(`comments-${discussionNumber}`);
    // Check if panel exists and is still valid
    if (!panel || panel.visible === undefined) {
      return;
    }

    try {
      // Get the discussion author for OP badge
      const discussion = await this.githubService.getDiscussion(discussionNumber);
      const authorLogin = discussion.author.login;

      // Get current user for edit/delete button visibility (Requirement 13.1)
      const currentUser = await this.authService.getCurrentUser();
      const currentUserLogin = currentUser?.login;

      // Fetch next page of comments
      const commentsPage = await this.githubService.getDiscussionComments(discussionNumber, cursor);

      // Generate HTML for new comments
      const commentsHtml = commentsPage.comments.map(comment =>
        this.generateCommentHtml(comment, authorLogin, false, currentUserLogin)
      ).join('');

      // Send comments to webview (check panel is still valid)
      if (panel.visible !== undefined) {
        panel.webview.postMessage({
          type: 'appendComments',
          commentsHtml,
          hasNextPage: commentsPage.pageInfo.hasNextPage,
          endCursor: commentsPage.pageInfo.endCursor
        });
      }
    } catch (error) {
      console.warn('Failed to load more comments:', error);
    }
  }

  /**
   * Refresh comments panel with latest data from GitHub
   */
  private async refreshCommentsPanel(discussionNumber: number): Promise<void> {
    const panel = this.panels.get(`comments-${discussionNumber}`);
    // Check if panel exists and is still valid
    if (panel && panel.visible !== undefined) {
      try {
        const updatedDiscussion = await this.githubService.getDiscussion(discussionNumber);
        await this.updateCommentsContent(panel, updatedDiscussion);
      } catch (error) {
        console.warn('Failed to refresh comments panel:', error);
      }
    }
  }

  /**
   * Update webview content
   */
  private async updateWebviewContent(panel: vscode.WebviewPanel, discussion: Discussion): Promise<void> {
    // Check if panel is still valid before updating
    if (!panel || panel.visible === undefined) {
      console.warn('Webview panel is no longer valid, skipping update');
      return;
    }
    try {
      const currentUser = await this.authService.getCurrentUser();
      const isAuthor = currentUser?.login === discussion.author.login;

      panel.webview.html = this.getWebviewContent(discussion, isAuthor);
    } catch (error) {
      console.warn('Failed to update webview content:', error);
    }
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: any, discussion: Discussion): Promise<void> {
    switch (message.type) {
      case 'addComment':
        if (message.body && message.body.trim()) {
          await this.githubService.addComment(message.discussionId, message.body);
          // Refresh discussion
          const updated = await this.githubService.getDiscussion(discussion.number);
          const panel = this.panels.get(`discussion-${discussion.number}`);
          if (panel) {
            await this.updateWebviewContent(panel, updated);
          }
        }
        break;

      case 'edit':
        // Open in virtual file system
        const uri = vscode.Uri.parse(`${DiscussionFileSystemProvider.scheme}:///discussions/${message.discussionNumber}/discussion.md`);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        break;
    }
  }

  /**
   * Generate webview HTML content
   * @deprecated Use showComments for comments-only view
   */
  private getWebviewContent(discussion: Discussion, isAuthor: boolean): string {
    const nonce = this.getNonce();
    const escapedTitle = this.escapeHtml(discussion.title);
    const escapedAuthor = this.escapeHtml(discussion.author.login);
    const formattedDate = discussion.createdAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const commentsHtml = discussion.comments.map(comment => `
      <div class="comment">
        <div class="comment-header">
          <img class="avatar" src="${this.escapeHtml(comment.author.avatarUrl)}" alt="${this.escapeHtml(comment.author.login)}" />
          <span class="author">${this.escapeHtml(comment.author.login)}</span>
          <span class="date">${comment.createdAt.toLocaleDateString()}</span>
        </div>
        <div class="comment-body">
          ${sanitizeHtml(comment.bodyHTML)}
        </div>
      </div>
    `).join('');

    const reactionsHtml = discussion.reactions.map(reaction => `
      <span class="reaction">
        ${this.getReactionEmoji(reaction.content)} ${reaction.count}
      </span>
    `).join('');

    const editButton = isAuthor ? `
      <button class="edit-btn" id="edit-btn">
        <span class="icon">✏️</span> Edit
      </button>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; script-src 'nonce-${nonce}';">
  <title>${escapedTitle}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .title {
      font-size: 24px;
      margin: 0 0 10px 0;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }
    .author {
      font-weight: bold;
    }
    .category {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
    }
    .body {
      margin: 20px 0;
    }
    .body h1, .body h2, .body h3 {
      color: var(--vscode-foreground);
    }
    .body code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
    }
    .body pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    .reactions {
      display: flex;
      gap: 10px;
      margin: 20px 0;
    }
    .reaction {
      background: var(--vscode-button-secondaryBackground);
      padding: 4px 8px;
      border-radius: 16px;
      font-size: 14px;
    }
    .comments-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .comments-header {
      font-size: 18px;
      margin-bottom: 20px;
    }
    .comment {
      margin-bottom: 20px;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
    }
    .comment-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .comment-body {
      padding-left: 34px;
    }
    .comment-form {
      margin-top: 30px;
      padding: 20px;
      background: var(--vscode-input-background);
      border-radius: 8px;
    }
    .comment-form textarea {
      width: 100%;
      min-height: 100px;
      padding: 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
    }
    .comment-form button {
      margin-top: 10px;
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .comment-form button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    .edit-btn {
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .edit-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${escapedTitle}</h1>
    <div class="meta">
      <img class="avatar" src="${this.escapeHtml(discussion.author.avatarUrl)}" alt="${escapedAuthor}" />
      <span class="author">${escapedAuthor}</span>
      <span class="date">${formattedDate}</span>
      <span class="category">${this.escapeHtml(discussion.category.emoji)} ${this.escapeHtml(discussion.category.name)}</span>
    </div>
    <div class="actions">
      ${editButton}
    </div>
  </div>

  <div class="body">
    ${sanitizeHtml(discussion.bodyHTML)}
  </div>

  <div class="reactions">
    ${reactionsHtml}
  </div>

  <div class="comments-section">
    <h2 class="comments-header">Comments (${discussion.comments.length})</h2>
    ${commentsHtml}

    <div class="comment-form">
      <h3>Add a comment</h3>
      <textarea id="commentBody" placeholder="Write your comment here..."></textarea>
      <button id="submit-comment-btn">Submit Comment</button>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      function submitComment() {
        const body = document.getElementById('commentBody').value;
        if (body.trim()) {
          vscode.postMessage({
            type: 'addComment',
            discussionId: '${discussion.id}',
            body: body
          });
          document.getElementById('commentBody').value = '';
        }
      }

      function edit() {
        vscode.postMessage({
          type: 'edit',
          discussionNumber: ${discussion.number}
        });
      }

      // Set up event listeners instead of inline onclick
      document.getElementById('submit-comment-btn')?.addEventListener('click', submitComment);
      document.getElementById('edit-btn')?.addEventListener('click', edit);
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Check if a comment author is the discussion author (OP)
   */
  private isOriginalPoster(commentAuthor: string, discussionAuthor: string): boolean {
    return commentAuthor === discussionAuthor;
  }

  /**
   * Truncate long HTML text safely without breaking tags
   * Extracts plain text for length check, then truncates HTML properly
   */
  private truncateText(html: string, maxLength: number = 500): { truncated: string; isTruncated: boolean } {
    // Extract plain text to check actual content length (remove HTML tags)
    const plainText = html.replace(/<[^>]*>/g, '');

    if (plainText.length <= maxLength) {
      return { truncated: html, isTruncated: false };
    }

    // Truncate HTML safely by tracking open tags
    let charCount = 0;
    let result = '';
    let i = 0;
    const openTags: string[] = [];

    while (i < html.length && charCount < maxLength) {
      if (html[i] === '<') {
        // Find the end of the tag
        const tagEnd = html.indexOf('>', i);
        if (tagEnd === -1) {
          break;
        }

        const tag = html.substring(i, tagEnd + 1);
        result += tag;

        // Track open/close tags (ignore self-closing and void elements)
        const tagMatch = tag.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
        if (tagMatch) {
          const tagName = tagMatch[1].toLowerCase();
          const voidElements = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];

          if (!voidElements.includes(tagName) && !tag.endsWith('/>')) {
            if (tag.startsWith('</')) {
              // Closing tag - remove from stack
              const lastIndex = openTags.lastIndexOf(tagName);
              if (lastIndex !== -1) {
                openTags.splice(lastIndex, 1);
              }
            } else {
              // Opening tag - add to stack
              openTags.push(tagName);
            }
          }
        }

        i = tagEnd + 1;
      } else {
        result += html[i];
        charCount++;
        i++;
      }
    }

    // Find a good break point (last space within the truncated text)
    const lastSpace = result.lastIndexOf(' ');
    if (lastSpace > result.length * 0.7) {
      result = result.substring(0, lastSpace);
    }

    result += '...';

    // Close any remaining open tags in reverse order
    for (let j = openTags.length - 1; j >= 0; j--) {
      result += `</${openTags[j]}>`;
    }

    return { truncated: result, isTruncated: true };
  }

  /**
   * Encode string to Base64 (handles Unicode correctly)
   */
  private encodeBase64(str: string): string {
    // Use Buffer for Node.js environment
    return Buffer.from(str, 'utf-8').toString('base64');
  }

  /**
   * Generate a single comment HTML with modern UI
   * Requirement 13.1: Show edit/delete buttons for own comments
   */
  private generateCommentHtml(comment: DiscussionComment, discussionAuthorLogin: string, isReply: boolean = false, currentUserLogin?: string): string {
    const isOP = this.isOriginalPoster(comment.author.login, discussionAuthorLogin);
    const opBadge = isOP ? '<span class="op-badge">OP</span>' : '';
    const relativeTime = formatRelativeTime(comment.createdAt);
    // Sanitize HTML for defense-in-depth before truncation and display
    const sanitizedBodyHTML = sanitizeHtml(comment.bodyHTML);
    const { truncated, isTruncated } = this.truncateText(sanitizedBodyHTML);
    const commentClass = isReply ? 'reply-card' : 'comment-card';
    // Encode full content as Base64 to avoid escaping issues
    const fullContentBase64 = isTruncated ? this.encodeBase64(sanitizedBodyHTML) : '';
    // Check if current user is the comment author (Requirement 13.1)
    const isOwnComment = currentUserLogin && comment.author.login === currentUserLogin;
    // Encode original body as Base64 for edit functionality
    const originalBodyBase64 = isOwnComment ? this.encodeBase64(comment.body) : '';

    // Generate edit/delete buttons for own comments (Requirement 13.1, 13.9)
    const editDeleteButtons = isOwnComment ? `
      <button class="edit-comment-btn" data-action="start-edit" data-target-comment-id="${this.escapeHtml(comment.id)}">
        <span class="edit-icon">✏️</span> 編集
      </button>
      <button class="delete-comment-btn" data-action="delete-comment" data-target-comment-id="${this.escapeHtml(comment.id)}">
        <span class="delete-icon">🗑️</span> 削除
      </button>
    ` : '';

    return `
      <div class="${commentClass}" data-comment-id="${this.escapeHtml(comment.id)}"${isTruncated ? ` data-full-content="${fullContentBase64}"` : ''}${isOwnComment ? ` data-original-body="${originalBodyBase64}"` : ''}>
        <div class="comment-header">
          <img class="avatar" src="${this.escapeHtml(comment.author.avatarUrl)}" alt="${this.escapeHtml(comment.author.login)}" />
          <div class="author-info">
            <span class="author">${this.escapeHtml(comment.author.login)}</span>
            ${opBadge}
          </div>
          <span class="timestamp" title="${comment.createdAt.toLocaleString()}">${relativeTime}</span>
        </div>
        <div class="comment-content ${isTruncated ? 'truncated' : ''}" id="content-${this.escapeHtml(comment.id)}"${isTruncated ? ` data-truncated-content="${this.encodeBase64(truncated)}"` : ''}>
          ${truncated}
        </div>
        ${isTruncated ? `
          <div class="read-more-container" id="read-more-${this.escapeHtml(comment.id)}">
            <button class="read-more-btn" data-action="toggle-content" data-target-comment-id="${this.escapeHtml(comment.id)}">
              続きを読む
            </button>
          </div>
        ` : ''}
        <!-- Edit form (hidden by default, Requirement 13.2, 13.4) -->
        <div class="edit-form" id="edit-form-${this.escapeHtml(comment.id)}">
          <textarea id="edit-body-${this.escapeHtml(comment.id)}" placeholder="コメントを編集...（Markdown対応）"></textarea>
          <div class="edit-form-actions">
            <button class="submit-btn" data-action="save-edit" data-target-comment-id="${this.escapeHtml(comment.id)}">保存</button>
            <button class="cancel-btn" data-action="cancel-edit" data-target-comment-id="${this.escapeHtml(comment.id)}">キャンセル</button>
          </div>
        </div>
        ${!isReply ? `
          <div class="comment-actions">
            <button class="reply-btn" data-action="show-reply-form" data-target-comment-id="${this.escapeHtml(comment.id)}">
              <span class="reply-icon">↩</span> 返信
            </button>
            ${editDeleteButtons}
          </div>
          <div class="reply-form" id="reply-form-${this.escapeHtml(comment.id)}">
            <div class="reply-input-container">
              <div class="mention-dropdown" id="mention-dropdown-${this.escapeHtml(comment.id)}"></div>
              <textarea id="reply-body-${this.escapeHtml(comment.id)}" placeholder="返信を入力...（Markdown対応、@でメンション）" class="mention-enabled" data-textarea-id="${this.escapeHtml(comment.id)}"></textarea>
            </div>
            <div class="reply-form-actions">
              <button class="submit-btn" data-action="submit-reply" data-target-comment-id="${this.escapeHtml(comment.id)}">送信</button>
              <button class="cancel-btn" data-action="hide-reply-form" data-target-comment-id="${this.escapeHtml(comment.id)}">キャンセル</button>
            </div>
          </div>
        ` : `
          <div class="comment-actions reply-actions">
            ${editDeleteButtons}
          </div>
        `}
        ${!isReply && comment.replies && comment.replies.length > 0 ? `
          <div class="thread-container">
            <div class="thread-line"></div>
            <div class="replies-list">
              ${comment.replies.map(reply => this.generateCommentHtml(reply, discussionAuthorLogin, true, currentUserLogin)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate comments-only webview HTML content (Requirements 5.3, 5.4, 5.8, 5.9, 5.10-5.13, 10.1-10.9, 12.1-12.6, 13.1-13.9)
   */
  private getCommentsContent(webview: vscode.Webview, discussion: Discussion, currentUserLogin?: string): string {
    const escapedTitle = this.escapeHtml(discussion.title);
    const escapedAuthor = this.escapeHtml(discussion.author.login);
    const relativeTime = formatRelativeTime(discussion.createdAt);

    const commentsHtml = discussion.comments.map(comment =>
      this.generateCommentHtml(comment, discussion.author.login, false, currentUserLogin)
    ).join('');

    // Generate Load More button if there are more comments
    const loadMoreButton = discussion.commentsPageInfo?.hasNextPage
      ? `<div id="load-more-container" class="load-more-container">
          <button id="load-more-button" class="load-more-btn" data-action="load-more-comments">
            さらに読み込む
          </button>
        </div>`
      : '';

    // Store cursor for pagination
    const endCursor = discussion.commentsPageInfo?.endCursor || '';

    // Generate nonce for CSP (Requirement 12.3)
    const nonce = this.getNonce();
    const mermaidScriptUri = this.getMermaidScriptUri(webview);
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}'; font-src ${cspSource};">
  <title>Comments: ${escapedTitle}</title>
  <style>
    :root {
      --card-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      --card-shadow-hover: 0 4px 16px rgba(0, 0, 0, 0.4);
      --card-radius: 12px;
      --transition-speed: 0.2s;
    }

    /* Light theme adjustments */
    .vscode-light {
      --card-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      --card-shadow-hover: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
      line-height: 1.7;
      font-size: 15px;
      letter-spacing: 0.02em;
    }

    /* Sticky Header */
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--vscode-editor-background);
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      backdrop-filter: blur(10px);
      background-color: rgba(var(--vscode-editor-background), 0.95);
    }

    .header-content {
      max-width: 800px;
      margin: 0 auto;
    }

    .title {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 8px 0;
      color: var(--vscode-foreground);
      letter-spacing: -0.01em;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
    }

    .meta .avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid var(--vscode-panel-border);
    }

    .category-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }

    /* Main Content */
    .main-content {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .comments-section {
      margin-top: 8px;
    }

    .comments-header {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .comments-count {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
    }

    /* Comment Card - Modern Design with improved dark mode visibility */
    .comment-card {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255, 255, 255, 0.05));
      border-radius: var(--card-radius);
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: var(--card-shadow);
      transition: transform var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
      border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.1));
    }

    .comment-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--card-shadow-hover);
      border-color: var(--vscode-focusBorder, rgba(255, 255, 255, 0.2));
    }

    .comment-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid var(--vscode-panel-border);
      transition: transform var(--transition-speed) ease;
    }

    .comment-card:hover .avatar {
      transform: scale(1.05);
    }

    .author-info {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
    }

    .author {
      font-weight: 600;
      color: var(--vscode-foreground);
      font-size: 15px;
    }

    .op-badge {
      background: linear-gradient(135deg, #7c8aff 0%, #9b6dff 100%);
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .timestamp {
      color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.6));
      font-size: 13px;
    }

    .comment-content {
      padding-left: 46px;
      font-size: 15px;
      line-height: 1.7;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .comment-content.truncated {
      max-height: 150px;
      overflow: hidden;
      position: relative;
    }

    .comment-content.truncated::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 46px;
      right: 0;
      height: 40px;
      background: linear-gradient(transparent, var(--vscode-editor-inactiveSelectionBackground, rgba(30, 30, 30, 0.95)));
    }

    .comment-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }

    .comment-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 14px;
    }

    .comment-content p {
      margin: 0 0 12px 0;
    }

    .comment-content p:last-child {
      margin-bottom: 0;
    }

    .comment-content a {
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-all;
    }

    .read-more-container {
      padding-left: 46px;
      margin-top: 8px;
    }

    .read-more-btn {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-size: 14px;
      padding: 0;
      font-weight: 500;
    }

    .read-more-btn:hover {
      text-decoration: underline;
      color: var(--vscode-textLink-activeForeground, #63b3ff);
    }

    /* Comment Actions */
    .comment-actions {
      padding-left: 46px;
      margin-top: 12px;
    }

    .reply-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 14px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    .reply-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: scale(1.02);
    }

    .reply-icon {
      font-size: 14px;
    }

    /* Edit/Delete Buttons (Requirements 13.1, 13.9) */
    .comment-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .reply-actions {
      padding-left: 38px;
      margin-top: 8px;
    }

    .edit-comment-btn,
    .delete-comment-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    .edit-comment-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: scale(1.02);
    }

    .delete-comment-btn:hover {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
      transform: scale(1.02);
    }

    .edit-icon,
    .delete-icon {
      font-size: 12px;
    }

    /* Edit Form (Requirements 13.2, 13.4) */
    .edit-form {
      display: none;
      margin-top: 12px;
      margin-left: 46px;
      padding: 14px;
      background: var(--vscode-input-background);
      border-radius: 10px;
      border: 1px solid var(--vscode-input-border);
      animation: slideDown 0.2s ease;
    }

    .edit-form.visible {
      display: block;
    }

    .reply-card .edit-form {
      margin-left: 0;
    }

    .edit-form textarea {
      width: 100%;
      min-height: 80px;
      padding: 12px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-editor-background);
      color: var(--vscode-input-foreground);
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      transition: border-color var(--transition-speed) ease;
    }

    .edit-form textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .edit-form-actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .edit-form-actions button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    /* Delete Confirmation Dialog (Requirement 13.5) */
    .delete-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    .delete-dialog-overlay.visible {
      display: flex;
    }

    .delete-dialog {
      background: var(--vscode-editor-background);
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid var(--vscode-panel-border);
    }

    .delete-dialog h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
      color: var(--vscode-foreground);
    }

    .delete-dialog p {
      margin: 0 0 20px 0;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }

    .delete-dialog-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .delete-dialog-actions button {
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    .delete-confirm-btn {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
    }

    .delete-confirm-btn:hover {
      opacity: 0.9;
    }

    .delete-cancel-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .delete-cancel-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* Thread / Reply Display */
    .thread-container {
      margin-top: 16px;
      margin-left: 46px;
      position: relative;
      display: flex;
      overflow: hidden;
      box-sizing: border-box;
    }

    .thread-line {
      width: 2px;
      background: linear-gradient(to bottom, var(--vscode-textLink-foreground, #3794ff), transparent);
      border-radius: 1px;
      margin-right: 16px;
      flex-shrink: 0;
      opacity: 0.6;
    }

    .replies-list {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .reply-card {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.1));
      transition: all var(--transition-speed) ease;
      overflow: hidden;
      box-sizing: border-box;
    }

    .reply-card:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground, var(--vscode-sideBar-background));
    }

    .reply-card .avatar {
      width: 28px;
      height: 28px;
    }

    .reply-card .comment-content {
      padding-left: 38px;
      font-size: 14px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .reply-card .comment-header {
      margin-bottom: 8px;
    }

    /* Reply Form */
    .reply-form {
      display: none;
      margin-top: 12px;
      margin-left: 46px;
      padding: 14px;
      background: var(--vscode-input-background);
      border-radius: 10px;
      border: 1px solid var(--vscode-input-border);
      animation: slideDown 0.2s ease;
    }

    .reply-form.visible {
      display: block;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .reply-form textarea {
      width: 100%;
      min-height: 80px;
      padding: 12px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-editor-background);
      color: var(--vscode-input-foreground);
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      transition: border-color var(--transition-speed) ease;
    }

    .reply-form textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .reply-form-actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .reply-form-actions button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    .submit-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .submit-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .cancel-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .cancel-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* Comment Form */
    .comment-form {
      margin-top: 24px;
      padding: 20px;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255, 255, 255, 0.05));
      border-radius: var(--card-radius);
      box-shadow: var(--card-shadow);
      border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.1));
    }

    .comment-form h3 {
      margin: 0 0 14px 0;
      font-size: 15px;
      font-weight: 600;
    }

    .comment-form textarea {
      width: 100%;
      min-height: 100px;
      padding: 14px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-editor-background);
      color: var(--vscode-input-foreground);
      border-radius: 8px;
      font-family: inherit;
      font-size: 15px;
      resize: vertical;
      transition: border-color var(--transition-speed) ease;
    }

    .comment-form textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .comment-form button {
      margin-top: 12px;
      padding: 10px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    .comment-form button:hover {
      background: var(--vscode-button-hoverBackground);
      transform: scale(1.02);
    }

    /* Empty State */
    .no-comments {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.6));
    }

    .no-comments-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .no-comments-text {
      font-size: 16px;
      margin: 0;
    }

    /* Load More Button */
    .load-more-container {
      text-align: center;
      padding: 20px 0;
      margin: 16px 0;
    }

    .load-more-btn {
      padding: 12px 24px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all var(--transition-speed) ease;
    }

    .load-more-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: scale(1.02);
    }

    .load-more-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .load-more-btn.loading {
      position: relative;
    }

    .load-more-btn.loading::after {
      content: '';
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-radius: 50%;
      border-top-color: transparent;
      margin-left: 8px;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Mention dropdown styles (Requirement 19) */
    .comment-input-container,
    .reply-input-container {
      position: relative;
    }

    .mention-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      width: 100%;
      max-height: 200px;
      overflow-y: auto;
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      display: none;
      margin-bottom: 4px;
    }

    .mention-dropdown.visible {
      display: block;
      animation: fadeInUp 0.15s ease;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .mention-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      transition: background var(--transition-speed) ease;
    }

    .mention-item:hover,
    .mention-item.selected {
      background: var(--vscode-list-hoverBackground);
    }

    .mention-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      margin-right: 10px;
      border: 1px solid var(--vscode-panel-border);
    }

    .mention-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .mention-login {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }

    .mention-name {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mention-source {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 6px;
      background: var(--vscode-badge-background);
      border-radius: 10px;
      margin-left: 8px;
    }

    .mention-loading,
    .mention-empty {
      padding: 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
    }

    /* Mermaid diagram styles (Requirements 12.1, 12.5) */
    .mermaid-diagram {
      background: var(--vscode-editor-background);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
      border: 1px solid var(--vscode-panel-border);
    }

    .mermaid-diagram svg {
      max-width: 100%;
      height: auto;
    }

    .mermaid-error {
      color: var(--vscode-errorForeground);
      background: var(--vscode-inputValidation-errorBackground);
      padding: 8px 12px;
      border-radius: 4px;
      margin-top: 8px;
      font-size: 12px;
      border-left: 3px solid var(--vscode-errorForeground);
    }

    /* Style for mermaid code blocks before rendering */
    pre code.language-mermaid,
    pre[lang="mermaid"] code {
      display: block;
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="sticky-header">
    <div class="header-content">
      <h1 class="title">#${discussion.number} ${escapedTitle}</h1>
      <div class="meta">
        <img class="avatar" src="${this.escapeHtml(discussion.author.avatarUrl)}" alt="${escapedAuthor}" />
        <span>${escapedAuthor}</span>
        <span>・</span>
        <span>${relativeTime}</span>
        <span class="category-badge">${this.escapeHtml(discussion.category.emoji)} ${this.escapeHtml(discussion.category.name)}</span>
      </div>
    </div>
  </div>

  <div class="main-content">
    <div class="comments-section">
      <h2 class="comments-header">
        コメント
        <span class="comments-count">${discussion.comments.length}</span>
      </h2>
      <div id="comments-container">
        ${discussion.comments.length === 0
          ? `<div class="no-comments">
              <div class="no-comments-icon">💬</div>
              <p class="no-comments-text">まだコメントはありません。最初のコメントを投稿しましょう！</p>
            </div>`
          : commentsHtml}
      </div>

      ${loadMoreButton}

      <div class="comment-form">
        <h3>コメントを追加</h3>
        <div class="comment-input-container">
          <div class="mention-dropdown" id="mention-dropdown-comment"></div>
          <textarea id="commentBody" placeholder="コメントを入力...（Markdown対応、@でメンション）" class="mention-enabled" data-textarea-id="comment"></textarea>
        </div>
        <button id="submit-comment-btn" data-action="submit-comment">コメントを投稿</button>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Dialog (Requirement 13.5) -->
  <div id="delete-dialog-overlay" class="delete-dialog-overlay">
    <div class="delete-dialog">
      <h3>コメントを削除</h3>
      <p>このコメントを削除してもよろしいですか？この操作は取り消せません。</p>
      <div class="delete-dialog-actions">
        <button class="delete-cancel-btn" data-action="cancel-delete">キャンセル</button>
        <button class="delete-confirm-btn" data-action="confirm-delete">削除</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentCursor = '${endCursor}';

    // Listen for messages from the extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'appendComments':
          appendComments(message.commentsHtml, message.hasNextPage, message.endCursor);
          break;
      }
    });

    function loadMoreComments() {
      const button = document.getElementById('load-more-button');
      if (button && currentCursor) {
        button.disabled = true;
        button.classList.add('loading');
        button.textContent = '読み込み中...';
        vscode.postMessage({
          type: 'loadMoreComments',
          cursor: currentCursor
        });
      }
    }

    function appendComments(commentsHtml, hasNextPage, newCursor) {
      const container = document.getElementById('comments-container');
      if (container && commentsHtml) {
        container.insertAdjacentHTML('beforeend', commentsHtml);
      }

      const loadMoreContainer = document.getElementById('load-more-container');
      const button = document.getElementById('load-more-button');

      if (hasNextPage && newCursor) {
        currentCursor = newCursor;
        if (button) {
          button.disabled = false;
          button.classList.remove('loading');
          button.textContent = 'さらに読み込む';
        }
      } else {
        // Hide the load more button when all comments are loaded
        if (loadMoreContainer) {
          loadMoreContainer.style.display = 'none';
        }
      }

      // Update comment count
      const countEl = document.querySelector('.comments-count');
      if (countEl) {
        const currentCount = parseInt(countEl.textContent) || 0;
        const newCommentsCount = (commentsHtml.match(/class="comment-card"/g) || []).length;
        countEl.textContent = currentCount + newCommentsCount;
      }
    }

    function submitComment() {
      const body = document.getElementById('commentBody').value;
      if (body.trim()) {
        vscode.postMessage({
          type: 'addComment',
          discussionId: '${discussion.id}',
          body: body
        });
        document.getElementById('commentBody').value = '';
      }
    }

    function showReplyForm(commentId) {
      const form = document.getElementById('reply-form-' + commentId);
      if (form) {
        form.classList.add('visible');
        const textarea = document.getElementById('reply-body-' + commentId);
        if (textarea) {
          textarea.focus();
        }
      }
    }

    function hideReplyForm(commentId) {
      const form = document.getElementById('reply-form-' + commentId);
      if (form) {
        form.classList.remove('visible');
        const textarea = document.getElementById('reply-body-' + commentId);
        if (textarea) {
          textarea.value = '';
        }
      }
    }

    function submitReply(commentId) {
      const textarea = document.getElementById('reply-body-' + commentId);
      if (textarea && textarea.value.trim()) {
        vscode.postMessage({
          type: 'addReply',
          commentId: commentId,
          body: textarea.value
        });
        textarea.value = '';
        hideReplyForm(commentId);
      }
    }

    // Decode Base64 to UTF-8 string
    function decodeBase64(base64) {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    }

    function toggleContent(commentId) {
      const content = document.getElementById('content-' + commentId);
      const readMore = document.getElementById('read-more-' + commentId);
      const commentCard = document.querySelector('[data-comment-id="' + commentId + '"]');
      if (content && readMore && commentCard) {
        if (content.classList.contains('truncated')) {
          // Expand: show full content
          const fullContentBase64 = commentCard.getAttribute('data-full-content');
          if (fullContentBase64) {
            content.classList.remove('truncated');
            content.innerHTML = decodeBase64(fullContentBase64);
            readMore.querySelector('button').textContent = '折りたたむ';
            // Re-render mermaid diagrams in expanded content
            renderMermaidDiagrams();
          }
        } else {
          // Collapse: restore truncated content
          const truncatedContentBase64 = content.getAttribute('data-truncated-content');
          if (truncatedContentBase64) {
            content.classList.add('truncated');
            content.innerHTML = decodeBase64(truncatedContentBase64);
            readMore.querySelector('button').textContent = '続きを読む';
          }
        }
      }
    }

    // Mermaid diagram rendering (Requirements 12.1, 12.4, 12.5)
    async function renderMermaidDiagrams() {
      if (typeof mermaid === 'undefined') {
        console.warn('Mermaid is not loaded');
        return;
      }

      // GitHub returns mermaid in multiple formats:
      // Format 1: Rich embed sections with data-json (GitHub's viewscreen format)
      //   <section data-type="mermaid"><div data-json="{&quot;data&quot;:&quot;...&quot;}">
      // Format 2: Standard code blocks
      //   <pre lang="mermaid"><code>...</code></pre>
      // Format 3: highlight divs
      //   <div class="highlight-source-mermaid"><pre>...</pre></div>

      // First, handle GitHub's viewscreen/enrichment format (data-json)
      const enrichmentSections = document.querySelectorAll('section[data-type="mermaid"], div[data-type="mermaid"]');

      for (const section of enrichmentSections) {
        if (section.dataset.mermaidRendered === 'true') {
          continue;
        }

        // Find the element with data-json attribute
        const jsonElement = section.querySelector('[data-json]') || (section.hasAttribute('data-json') ? section : null);
        if (!jsonElement) {
          continue;
        }

        // Generate ID before try block so it's available in catch
        const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);

        try {
          const jsonStr = jsonElement.getAttribute('data-json');
          if (!jsonStr) {
            continue;
          }
          // HTML entities need to be decoded before JSON parsing
          // GitHub returns escaped content like &gt; &lt; &quot; &amp;
          const decodeHtmlEntities = (str) => {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = str;
            return textarea.value;
          };
          const decodedJsonStr = decodeHtmlEntities(jsonStr);
          const jsonData = JSON.parse(decodedJsonStr);
          const code = (jsonData.data || '').trim();

          if (!code) {
            continue;
          }

          const { svg } = await mermaid.render(id, code);
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram';
          wrapper.innerHTML = svg;
          section.replaceWith(wrapper);
        } catch (error) {
          // Remove any error SVG elements that mermaid may have inserted into the DOM
          // Mermaid inserts error elements with id starting with 'd' + id or the id itself
          document.querySelectorAll('[id^="d' + id + '"], [id^="' + id + '"], #d' + id).forEach(el => el.remove());
          // Also remove any mermaid error containers that may have been added to body
          document.querySelectorAll('svg[id*="mermaid"], #dmermaid, [id^="dmermaid"]').forEach(el => {
            if (el.textContent && el.textContent.includes('Syntax error')) {
              el.remove();
            }
          });
          // Replace section content with error message inside a mermaid-diagram container
          section.dataset.mermaidRendered = 'true';
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram mermaid-error-container';
          wrapper.innerHTML = '<div class="mermaid-error">Mermaid rendering error: ' + (error.message || 'Unknown error').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
          section.replaceWith(wrapper);
        }
      }

      // Then, handle standard code block formats
      const selectors = [
        'pre[lang="mermaid"]',  // GitHub format: <pre lang="mermaid">code</pre> without code element
        'pre[lang="mermaid"] code',
        'pre code.language-mermaid',
        '.highlight-text-html-mermaid pre',
        '.highlight-source-mermaid pre',
        'div[class*="highlight-mermaid"] pre',
        'pre.language-mermaid'
      ];

      const codeBlocks = document.querySelectorAll(selectors.join(', '));

      for (const block of codeBlocks) {
        // Get the container (either pre or parent div)
        let container = block.tagName === 'PRE' ? block : block.parentElement;
        // If container is inside a highlight div, use that div instead
        const highlightDiv = container?.closest('div[class*="highlight"]');
        if (highlightDiv) {
          container = highlightDiv;
        }

        if (!container || container.dataset.mermaidRendered === 'true') {
          continue;
        }

        // Get the code content (might be in code element or directly in pre)
        const codeElement = block.tagName === 'CODE' ? block : block.querySelector('code') || block;
        const code = (codeElement.textContent || '').trim();

        if (!code) {
          continue;
        }

        const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);

        // Find the parent wrapper that may contain "Loading" placeholder
        // GitHub wraps mermaid in a container with the code block and a loading indicator
        // The structure may be: <div><pre>code</pre><p>Loading</p></div>
        const parentWrapper = container.parentElement;

        // Find and remove any sibling "Loading" text nodes or elements
        function removeLoadingSiblings(element) {
          if (!element || !element.parentElement) return;
          const parent = element.parentElement;
          const siblings = Array.from(parent.childNodes);
          siblings.forEach(sibling => {
            if (sibling === element) return;
            // Check text nodes
            if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent?.trim() === 'Loading') {
              sibling.remove();
            }
            // Check element nodes containing only "Loading"
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.textContent?.trim() === 'Loading') {
              sibling.remove();
            }
          });
        }

        try {
          const { svg } = await mermaid.render(id, code);
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram';
          wrapper.innerHTML = svg;
          // Remove Loading siblings before replacing
          removeLoadingSiblings(container);
          container.replaceWith(wrapper);
        } catch (error) {
          // Remove any error SVG elements that mermaid may have inserted into the DOM
          // Mermaid inserts error elements with id starting with 'd' + id or the id itself
          document.querySelectorAll('[id^="d' + id + '"], [id^="' + id + '"], #d' + id).forEach(el => el.remove());
          // Also remove any mermaid error containers that may have been added to body
          document.querySelectorAll('svg[id*="mermaid"], #dmermaid, [id^="dmermaid"]').forEach(el => {
            if (el.textContent && el.textContent.includes('Syntax error')) {
              el.remove();
            }
          });
          // Replace container with error message inside a mermaid-diagram container (Requirement 12.5)
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram mermaid-error-container';
          wrapper.innerHTML = '<div class="mermaid-error">Mermaid rendering error: ' + (error.message || 'Unknown error').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
          // Remove Loading siblings before replacing
          removeLoadingSiblings(container);
          container.replaceWith(wrapper);
        }
      }

      // Final cleanup: remove any remaining mermaid error SVGs from document body
      // Mermaid may insert error elements directly into body that weren't caught above
      document.querySelectorAll('body > svg[id*="mermaid"], body > #dmermaid, body > [id^="dmermaid"]').forEach(el => {
        el.remove();
      });
      // Also check for any SVG with "Syntax error" text that may have been added
      document.querySelectorAll('body > svg').forEach(el => {
        if (el.textContent && el.textContent.includes('Syntax error')) {
          el.remove();
        }
      });

      // Final cleanup: remove any remaining "Loading" text elements
      // GitHub may include "Loading" as placeholder text for mermaid diagrams
      document.querySelectorAll('p, span, div').forEach(el => {
        if (el.textContent?.trim() === 'Loading' && el.children.length === 0) {
          el.remove();
        }
      });
      // Also check text nodes directly under comment content
      document.querySelectorAll('.comment-content').forEach(content => {
        content.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === 'Loading') {
            node.remove();
          }
        });
      });
    }

    // Edit functionality (Requirements 13.2, 13.3, 13.4)
    let currentEditingCommentId = null;

    function startEdit(commentId) {
      // Hide any other open edit forms
      if (currentEditingCommentId && currentEditingCommentId !== commentId) {
        cancelEdit(currentEditingCommentId);
      }

      const commentCard = document.querySelector('[data-comment-id="' + commentId + '"]');
      const editForm = document.getElementById('edit-form-' + commentId);
      const editTextarea = document.getElementById('edit-body-' + commentId);
      const contentDiv = document.getElementById('content-' + commentId);
      const actionsDiv = commentCard?.querySelector('.comment-actions');

      if (editForm && editTextarea && commentCard) {
        // Get original body from data attribute
        const originalBodyBase64 = commentCard.getAttribute('data-original-body');
        if (originalBodyBase64) {
          editTextarea.value = decodeBase64(originalBodyBase64);
        }

        // Show edit form, hide content and actions
        editForm.classList.add('visible');
        if (contentDiv) contentDiv.style.display = 'none';
        if (actionsDiv) actionsDiv.style.display = 'none';

        // Hide read-more button if present
        const readMore = document.getElementById('read-more-' + commentId);
        if (readMore) readMore.style.display = 'none';

        currentEditingCommentId = commentId;
        editTextarea.focus();
      }
    }

    function cancelEdit(commentId) {
      const editForm = document.getElementById('edit-form-' + commentId);
      const contentDiv = document.getElementById('content-' + commentId);
      const commentCard = document.querySelector('[data-comment-id="' + commentId + '"]');
      const actionsDiv = commentCard?.querySelector('.comment-actions');

      if (editForm) {
        editForm.classList.remove('visible');
        if (contentDiv) contentDiv.style.display = '';
        if (actionsDiv) actionsDiv.style.display = '';

        // Show read-more button if present
        const readMore = document.getElementById('read-more-' + commentId);
        if (readMore) readMore.style.display = '';
      }

      if (currentEditingCommentId === commentId) {
        currentEditingCommentId = null;
      }
    }

    function saveEdit(commentId) {
      const editTextarea = document.getElementById('edit-body-' + commentId);
      if (editTextarea && editTextarea.value.trim()) {
        vscode.postMessage({
          type: 'updateComment',
          commentId: commentId,
          body: editTextarea.value
        });
      }
    }

    // Delete functionality (Requirements 13.5, 13.6)
    let pendingDeleteCommentId = null;

    function showDeleteDialog(commentId) {
      pendingDeleteCommentId = commentId;
      const overlay = document.getElementById('delete-dialog-overlay');
      if (overlay) {
        overlay.classList.add('visible');
      }
    }

    function hideDeleteDialog() {
      pendingDeleteCommentId = null;
      const overlay = document.getElementById('delete-dialog-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
      }
    }

    function confirmDelete() {
      if (pendingDeleteCommentId) {
        vscode.postMessage({
          type: 'deleteComment',
          commentId: pendingDeleteCommentId
        });
        hideDeleteDialog();
      }
    }

    // Event delegation for all button actions (CSP-compliant)
    document.addEventListener('click', function(event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const commentId = target.getAttribute('data-target-comment-id');

      switch (action) {
        case 'toggle-content':
          if (commentId) toggleContent(commentId);
          break;
        case 'show-reply-form':
          if (commentId) showReplyForm(commentId);
          break;
        case 'hide-reply-form':
          if (commentId) hideReplyForm(commentId);
          break;
        case 'submit-reply':
          if (commentId) submitReply(commentId);
          break;
        case 'load-more-comments':
          loadMoreComments();
          break;
        case 'submit-comment':
          submitComment();
          break;
        // Edit/Delete actions (Requirements 13.1-13.9)
        case 'start-edit':
          if (commentId) startEdit(commentId);
          break;
        case 'cancel-edit':
          if (commentId) cancelEdit(commentId);
          break;
        case 'save-edit':
          if (commentId) saveEdit(commentId);
          break;
        case 'delete-comment':
          if (commentId) showDeleteDialog(commentId);
          break;
        case 'confirm-delete':
          confirmDelete();
          break;
        case 'cancel-delete':
          hideDeleteDialog();
          break;
      }
    });

    // Close delete dialog when clicking outside
    document.addEventListener('click', function(event) {
      const overlay = document.getElementById('delete-dialog-overlay');
      if (overlay && event.target === overlay) {
        hideDeleteDialog();
      }
    });

    // Debounce utility function
    function debounce(func, wait) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    }

    // Mention functionality (Requirement 19)
    class MentionHandler {
      constructor(textarea, dropdown) {
        this.textarea = textarea;
        this.dropdown = dropdown;
        this.users = [];
        this.orgMembers = []; // Lazily loaded org members
        this.filteredUsers = [];
        this.selectedIndex = -1;
        this.mentionStart = -1;
        this.isLoading = false;
        this.usersLoaded = false;
        this.currentQuery = '';
        this.debounceTimeout = null;
        this.orgSearchTimeout = null;
        this.isComposing = false;
        this.isSearchingOrg = false;
        this.lastOrgSearchQuery = '';

        this.setupEventListeners();
      }

      setupEventListeners() {
        this.textarea.addEventListener('input', () => this.handleInput());
        this.textarea.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.textarea.addEventListener('blur', () => {
          // Delay hiding to allow click on dropdown items
          setTimeout(() => this.hideDropdown(), 150);
        });
        // Handle IME composition
        this.textarea.addEventListener('compositionstart', () => {
          this.isComposing = true;
        });
        this.textarea.addEventListener('compositionend', () => {
          this.isComposing = false;
          // Re-trigger input handling after composition ends
          this.handleInput();
        });
      }

      handleInput() {
        // Skip if IME composition is in progress
        if (this.isComposing) {
          return;
        }

        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const textBeforeCursor = text.slice(0, cursorPos);

        // Detect @ (half-width or full-width) followed by optional word characters
        const mentionMatch = textBeforeCursor.match(/[@＠]([a-zA-Z0-9_-]*)$/);

        if (mentionMatch) {
          this.mentionStart = cursorPos - mentionMatch[0].length;
          const query = mentionMatch[1].toLowerCase();
          this.currentQuery = query;

          // Load users if not already loaded
          if (!this.usersLoaded && !this.isLoading) {
            this.loadUsers();
            this.showLoadingState();
            return;
          }

          // If still loading, keep showing loading state
          if (this.isLoading) {
            this.showLoadingState();
            return;
          }

          // If users are already loaded, apply debounce for filtering
          clearTimeout(this.debounceTimeout);
          if (this.usersLoaded) {
            // Apply debounce only when filtering (query has characters)
            if (query.length > 0) {
              this.debounceTimeout = setTimeout(() => {
                if (this.currentQuery === query) {
                  this.showDropdown(query);
                }
              }, 300);
            } else {
              // Show immediately when just @ is typed
              this.showDropdown(query);
            }
          }
        } else {
          clearTimeout(this.debounceTimeout);
          this.hideDropdown();
        }
      }

      loadUsers() {
        this.isLoading = true;
        this.showLoadingState();

        // Request mentionable users from extension
        vscode.postMessage({ type: 'getMentionableUsers' });
      }

      setUsers(users) {
        this.users = users || [];
        this.usersLoaded = true;
        this.isLoading = false;

        // Re-filter with current query if there's a pending mention
        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const textBeforeCursor = text.slice(0, cursorPos);
        const mentionMatch = textBeforeCursor.match(/[@＠]([a-zA-Z0-9_-]*)$/);
        if (mentionMatch) {
          this.showDropdown(mentionMatch[1].toLowerCase());
        }
      }

      showLoadingState() {
        this.dropdown.innerHTML = '<div class="mention-loading">ユーザーを読み込み中...</div>';
        this.dropdown.classList.add('visible');
      }

      showDropdown(query) {
        if (this.isLoading) {
          this.showLoadingState();
          return;
        }

        // Combine base users with org members
        const allUsers = [...this.users];

        // Add org members that are not already in the list
        for (const orgUser of this.orgMembers) {
          if (!allUsers.some(u => u.login === orgUser.login)) {
            allUsers.push(orgUser);
          }
        }

        // Filter users by query
        this.filteredUsers = allUsers.filter(user => {
          const loginMatch = user.login.toLowerCase().includes(query);
          const nameMatch = user.name && user.name.toLowerCase().includes(query);
          return loginMatch || nameMatch;
        });

        // If query has characters and we have few results, search org members lazily
        if (query.length >= 1 && this.filteredUsers.length < 5 && !this.isSearchingOrg && query !== this.lastOrgSearchQuery) {
          this.searchOrgMembers(query);
        }

        if (this.filteredUsers.length === 0) {
          if (this.isSearchingOrg) {
            this.dropdown.innerHTML = '<div class="mention-loading">組織メンバーを検索中...</div>';
          } else {
            this.dropdown.innerHTML = '<div class="mention-empty">該当するユーザーが見つかりません</div>';
          }
          this.dropdown.classList.add('visible');
          return;
        }

        // Render user list
        this.selectedIndex = 0;
        this.renderDropdown();
        this.dropdown.classList.add('visible');
      }

      searchOrgMembers(query) {
        // Debounce org member search (500ms)
        clearTimeout(this.orgSearchTimeout);
        this.orgSearchTimeout = setTimeout(() => {
          if (this.currentQuery === query) {
            this.isSearchingOrg = true;
            this.lastOrgSearchQuery = query;
            vscode.postMessage({ type: 'searchOrgMembers', query: query });
          }
        }, 500);
      }

      setOrgMembersSearchResult(users, query) {
        this.isSearchingOrg = false;

        // Add new org members to the cache
        for (const user of (users || [])) {
          if (!this.orgMembers.some(u => u.login === user.login)) {
            this.orgMembers.push(user);
          }
        }

        // Re-filter if the query is still relevant
        if (this.currentQuery === query || this.currentQuery.startsWith(query)) {
          this.showDropdown(this.currentQuery);
        }
      }

      renderDropdown() {
        const sourceLabels = {
          'participant': '参加者',
          'collaborator': 'コラボレーター',
          'org_member': 'Orgメンバー'
        };

        this.dropdown.innerHTML = this.filteredUsers.map((user, index) => {
          const selectedClass = index === this.selectedIndex ? 'selected' : '';
          const sourceLabel = sourceLabels[user.source] || user.source;
          const nameHtml = user.name ? '<span class="mention-name">' + this.escapeHtml(user.name) + '</span>' : '';

          return '<div class="mention-item ' + selectedClass + '" data-index="' + index + '">' +
            '<img class="mention-avatar" src="' + this.escapeHtml(user.avatarUrl) + '" alt="" />' +
            '<div class="mention-info">' +
              '<span class="mention-login">@' + this.escapeHtml(user.login) + '</span>' +
              nameHtml +
            '</div>' +
            '<span class="mention-source">' + sourceLabel + '</span>' +
          '</div>';
        }).join('');

        // Add click handlers to items
        this.dropdown.querySelectorAll('.mention-item').forEach((item) => {
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur
            const index = parseInt(item.getAttribute('data-index'));
            if (!isNaN(index) && this.filteredUsers[index]) {
              this.insertMention(this.filteredUsers[index]);
            }
          });
          item.addEventListener('mouseover', () => {
            const index = parseInt(item.getAttribute('data-index'));
            if (!isNaN(index)) {
              this.selectedIndex = index;
              this.updateSelection();
            }
          });
        });
      }

      hideDropdown() {
        this.dropdown.classList.remove('visible');
        this.selectedIndex = -1;
        this.mentionStart = -1;
      }

      handleKeydown(e) {
        if (!this.dropdown.classList.contains('visible')) {
          return;
        }

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredUsers.length - 1);
            this.updateSelection();
            break;
          case 'ArrowUp':
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.updateSelection();
            break;
          case 'Enter':
          case 'Tab':
            if (this.selectedIndex >= 0 && this.filteredUsers[this.selectedIndex]) {
              e.preventDefault();
              this.insertMention(this.filteredUsers[this.selectedIndex]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            this.hideDropdown();
            break;
        }
      }

      updateSelection() {
        const items = this.dropdown.querySelectorAll('.mention-item');
        items.forEach((item, index) => {
          if (index === this.selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
          } else {
            item.classList.remove('selected');
          }
        });
      }

      insertMention(user) {
        const text = this.textarea.value;
        const before = text.slice(0, this.mentionStart);
        const after = text.slice(this.textarea.selectionStart);

        const mention = '@' + user.login + ' ';
        this.textarea.value = before + mention + after;

        const newCursorPos = this.mentionStart + mention.length;
        this.textarea.selectionStart = newCursorPos;
        this.textarea.selectionEnd = newCursorPos;

        this.hideDropdown();
        this.textarea.focus();
      }

      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    }

    // Store mention handlers for each textarea
    const mentionHandlers = new Map();

    // Initialize mention handlers for existing textareas
    function initMentionHandlers() {
      document.querySelectorAll('textarea.mention-enabled').forEach(textarea => {
        const textareaId = textarea.getAttribute('data-textarea-id');
        if (textareaId && !mentionHandlers.has(textareaId)) {
          const dropdown = document.getElementById('mention-dropdown-' + textareaId);
          if (dropdown) {
            const handler = new MentionHandler(textarea, dropdown);
            mentionHandlers.set(textareaId, handler);
          }
        }
      });
    }

    // Handle mentionable users response from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'mentionableUsers') {
        mentionHandlers.forEach((handler) => {
          handler.setUsers(message.users);
        });
      } else if (message.type === 'orgMembersSearchResult') {
        mentionHandlers.forEach((handler) => {
          handler.setOrgMembersSearchResult(message.users, message.query);
        });
      }
    });

    // Initialize mention handlers after DOM is ready
    initMentionHandlers();

    // Re-initialize when new reply forms are shown
    const originalShowReplyForm = showReplyForm;
    showReplyForm = function(commentId) {
      originalShowReplyForm(commentId);
      // Initialize mention handler for the reply textarea
      setTimeout(() => {
        const textarea = document.getElementById('reply-body-' + commentId);
        const dropdown = document.getElementById('mention-dropdown-' + commentId);
        if (textarea && dropdown && !mentionHandlers.has(commentId)) {
          const handler = new MentionHandler(textarea, dropdown);
          mentionHandlers.set(commentId, handler);
        }
      }, 0);
    };
  </script>
  <!-- Mermaid.js bundle (Requirement 12.2) -->
  ${mermaidScriptUri ? `<script nonce="${nonce}" src="${mermaidScriptUri}" id="mermaid-script"></script>` : '<!-- Mermaid script unavailable -->'}
  <script nonce="${nonce}">
    // Initialize Mermaid with strict security (Requirement 12.4)
    // mermaid-entry.js assigns mermaid to window.mermaid directly
    // No external global names are used to avoid pollution attacks
    function initMermaid() {
      if (typeof mermaid !== 'undefined') {
        // Detect VSCode theme and choose appropriate Mermaid theme
        const isDarkTheme = document.body.classList.contains('vscode-dark') ||
                           document.body.classList.contains('vscode-high-contrast');
        const mermaidTheme = isDarkTheme ? 'dark' : 'default';

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: mermaidTheme,
          flowchart: { useMaxWidth: true },
          sequence: { useMaxWidth: true }
        });
        // Render diagrams after initialization
        renderMermaidDiagrams();
      } else {
        console.warn('Mermaid failed to load');
      }
    }

    // Check if mermaid is already loaded, otherwise use polling with timeout
    // The 'load' event may not fire reliably for IIFE bundles in VSCode webview
    function waitForMermaid(maxAttempts, interval) {
      let attempts = 0;
      const check = function() {
        attempts++;
        if (typeof mermaid !== 'undefined') {
          initMermaid();
        } else if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          console.error('Mermaid failed to load after', maxAttempts, 'attempts');
        }
      };
      check();
    }

    if (typeof mermaid !== 'undefined') {
      initMermaid();
    } else {
      // Poll for mermaid availability: 50 attempts * 100ms = 5 seconds max
      waitForMermaid(50, 100);
    }
  </script>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get emoji for reaction content
   */
  private getReactionEmoji(content: string): string {
    const emojiMap: Record<string, string> = {
      'THUMBS_UP': '👍',
      'THUMBS_DOWN': '👎',
      'LAUGH': '😄',
      'HOORAY': '🎉',
      'CONFUSED': '😕',
      'HEART': '❤️',
      'ROCKET': '🚀',
      'EYES': '👀'
    };
    return emojiMap[content] || content;
  }

  /**
   * Generate a cryptographically secure nonce for CSP
   * Requirement 12.3: CSP uses nonce attribute
   */
  public getNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get the URI for the Mermaid bundle script
   * Requirement 12.2: Mermaid.js is bundled within the extension
   */
  public getMermaidScriptUri(webview: vscode.Webview): string {
    if (!this.context?.extensionUri) {
      console.warn('Extension context or extensionUri is not available');
      return '';
    }
    try {
      const scriptPath = vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'mermaid.bundle.js'
      );
      return webview.asWebviewUri(scriptPath).toString();
    } catch (error) {
      console.warn('Failed to get Mermaid script URI:', error);
      return '';
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.panels.forEach(panel => panel.dispose());
    this.panels.clear();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
