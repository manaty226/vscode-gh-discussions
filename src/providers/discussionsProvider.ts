/**
 * Discussions Tree View Provider
 * Requirements: 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as vscode from 'vscode';
import { IGitHubService, IAuthenticationService } from '../services/interfaces';
import { DiscussionSummary, DiscussionCategory } from '../models';
import { createAppError, ErrorType } from '../utils/errorUtils';

export type AnsweredFilter = 'all' | 'answered' | 'unanswered';

/**
 * Loading state for the tree view
 */
export enum LoadingState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error'
}

/**
 * Tree item representing a category, discussion, or status message
 */
export class DiscussionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: 'category' | 'discussion' | 'loading' | 'empty' | 'error' | 'auth-required',
    public readonly discussionSummary?: DiscussionSummary,
    public readonly category?: DiscussionCategory
  ) {
    super(label, collapsibleState);

    if (contextValue === 'discussion' && discussionSummary) {
      this.description = `#${discussionSummary.number}`;
      // Tooltip without body (lazy loading - body not available in summary)
      this.tooltip = `${discussionSummary.title}\n\nBy @${discussionSummary.author.login}\n${discussionSummary.commentsCount} comments`;
      // クリック時はマークダウンエディタを開く（要件3.1）
      // コメントアイコン経由でWebviewを開く（要件5.1, 5.2）
      this.command = {
        command: 'github-discussions.editDiscussion',
        title: 'Edit Discussion',
        arguments: [this]  // TreeItem自体を渡す（editDiscussionコマンドが.discussionSummaryを参照）
      };

      // Set icon based on answered status
      if (discussionSummary.category.isAnswerable) {
        if (discussionSummary.isAnswered) {
          this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else {
          this.iconPath = new vscode.ThemeIcon('question', new vscode.ThemeColor('testing.iconQueued'));
        }
      } else {
        this.iconPath = new vscode.ThemeIcon('comment-discussion');
      }
    } else if (contextValue === 'category' && category) {
      this.tooltip = category.description;
      this.iconPath = new vscode.ThemeIcon('folder');
    } else if (contextValue === 'loading') {
      this.iconPath = new vscode.ThemeIcon('loading~spin');
    } else if (contextValue === 'empty') {
      this.iconPath = new vscode.ThemeIcon('info');
    } else if (contextValue === 'error') {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      this.command = {
        command: 'github-discussions.refresh',
        title: 'Retry'
      };
    } else if (contextValue === 'auth-required') {
      this.iconPath = new vscode.ThemeIcon('account');
      this.command = {
        command: 'github-discussions.authenticate',
        title: 'Sign In'
      };
    }
  }
}

/**
 * Tree Data Provider for GitHub Discussions
 */
export class DiscussionsProvider implements vscode.TreeDataProvider<DiscussionTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DiscussionTreeItem | undefined | null | void> =
    new vscode.EventEmitter<DiscussionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DiscussionTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private discussionSummaries: DiscussionSummary[] = [];
  private categories: DiscussionCategory[] = [];
  private loadingState: LoadingState = LoadingState.IDLE;
  private lastError: Error | undefined;

  // Filter state
  private searchQuery = '';
  private categoryFilter: string[] = [];
  private answeredFilter: AnsweredFilter = 'all';

  constructor(
    private githubService: IGitHubService,
    private authService: IAuthenticationService
  ) {}

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.loadingState = LoadingState.IDLE;
    this.lastError = undefined;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set search query for filtering
   */
  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set category filter
   */
  setCategoryFilter(categoryIds: string[]): void {
    this.categoryFilter = categoryIds;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set answered filter
   */
  setAnsweredFilter(filter: AnsweredFilter): void {
    this.answeredFilter = filter;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchQuery = '';
    this.categoryFilter = [];
    this.answeredFilter = 'all';
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: DiscussionTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  async getChildren(element?: DiscussionTreeItem): Promise<DiscussionTreeItem[]> {
    // Handle status items (loading, error, etc.) - they have no children
    if (element?.contextValue === 'loading' ||
        element?.contextValue === 'empty' ||
        element?.contextValue === 'error' ||
        element?.contextValue === 'auth-required') {
      return [];
    }

    await this.ensureLoaded();

    if (!element) {
      // Root level - check state first
      if (this.loadingState === LoadingState.LOADING) {
        return [new DiscussionTreeItem(
          'Loading discussions...',
          vscode.TreeItemCollapsibleState.None,
          'loading'
        )];
      }

      if (this.loadingState === LoadingState.ERROR && this.lastError) {
        const appError = createAppError(this.lastError);
        if (appError.type === ErrorType.AUTHENTICATION) {
          return [new DiscussionTreeItem(
            'Sign in to view discussions',
            vscode.TreeItemCollapsibleState.None,
            'auth-required'
          )];
        }
        return [new DiscussionTreeItem(
          `Error: ${appError.message} (click to retry)`,
          vscode.TreeItemCollapsibleState.None,
          'error'
        )];
      }

      // Return categories or empty state
      const categoryItems = this.getCategoryItems();
      if (categoryItems.length === 0) {
        return [new DiscussionTreeItem(
          'No discussions found',
          vscode.TreeItemCollapsibleState.None,
          'empty'
        )];
      }
      return categoryItems;
    }

    if (element.contextValue === 'category' && element.category) {
      // Category level - return discussions in this category
      const items = this.getDiscussionItems(element.category.id);
      if (items.length === 0) {
        return [new DiscussionTreeItem(
          'No discussions in this category',
          vscode.TreeItemCollapsibleState.None,
          'empty'
        )];
      }
      return items;
    }

    return [];
  }

  /**
   * Ensure data is loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loadingState === LoadingState.LOADED || this.loadingState === LoadingState.LOADING) {
      return;
    }

    this.loadingState = LoadingState.LOADING;

    try {
      // 自動的に認証を試みる（まずsilentで、なければプロンプト）
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        const session = await this.authService.getSession();
        if (!session) {
          this.discussionSummaries = [];
          this.categories = [];
          this.loadingState = LoadingState.ERROR;
          this.lastError = new Error('Not authenticated');
          return;
        }
      }

      const [summaries, categories] = await Promise.all([
        this.githubService.getDiscussionSummaries(),
        this.githubService.getDiscussionCategories()
      ]);

      this.discussionSummaries = summaries;
      this.categories = categories;
      this.loadingState = LoadingState.LOADED;
      this.lastError = undefined;
    } catch (error) {
      console.error('Failed to load discussions:', error);
      this.discussionSummaries = [];
      this.categories = [];
      this.loadingState = LoadingState.ERROR;
      this.lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Get category tree items
   */
  private getCategoryItems(): DiscussionTreeItem[] {
    let filteredCategories = this.categories;

    // Apply category filter
    if (this.categoryFilter.length > 0) {
      filteredCategories = filteredCategories.filter(c =>
        this.categoryFilter.includes(c.id)
      );
    }

    return filteredCategories.map(category =>
      new DiscussionTreeItem(
        category.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        'category',
        undefined,
        category
      )
    );
  }

  /**
   * Get discussion tree items for a category
   */
  private getDiscussionItems(categoryId: string): DiscussionTreeItem[] {
    let filteredSummaries = this.discussionSummaries.filter((d: DiscussionSummary) =>
      d.category.id === categoryId
    );

    // Apply search filter (title only - body not available in summary)
    if (this.searchQuery) {
      filteredSummaries = filteredSummaries.filter((d: DiscussionSummary) =>
        d.title.toLowerCase().includes(this.searchQuery)
      );
    }

    // Apply answered filter
    if (this.answeredFilter === 'answered') {
      filteredSummaries = filteredSummaries.filter((d: DiscussionSummary) => d.isAnswered);
    } else if (this.answeredFilter === 'unanswered') {
      filteredSummaries = filteredSummaries.filter((d: DiscussionSummary) => !d.isAnswered);
    }

    return filteredSummaries.map((summary: DiscussionSummary) =>
      new DiscussionTreeItem(
        summary.title,
        vscode.TreeItemCollapsibleState.None,
        'discussion',
        summary,
        undefined
      )
    );
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
