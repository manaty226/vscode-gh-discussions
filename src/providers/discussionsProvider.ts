/**
 * Discussions Tree View Provider
 * Requirements: 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as vscode from 'vscode';
import { IGitHubService, IAuthenticationService, INotificationBadgeService } from '../services/interfaces';
import { DiscussionSummary, DiscussionCategory, CategoryPaginationState, CategoryLoadState, CategoryState } from '../models';
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
 * Tree item representing a category, discussion, load-more button, or status message
 */
export class DiscussionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: 'category' | 'discussion' | 'loadMore' | 'loading' | 'empty' | 'error' | 'auth-required',
    public readonly discussionSummary?: DiscussionSummary,
    public readonly category?: DiscussionCategory,
    public readonly categoryId?: string,  // For loadMore item to know which category
    public readonly isUnread?: boolean  // For showing unread badge (Requirement 20)
  ) {
    super(label, collapsibleState);

    if (contextValue === 'discussion' && discussionSummary) {
      // Show unread indicator at the beginning of label (Requirement 20.1, 20.2)
      if (isUnread) {
        this.label = `💬 ${label}`;
      }
      this.description = `#${discussionSummary.number}`;
      // Tooltip without body (lazy loading - body not available in summary)
      const unreadTooltip = isUnread ? '\n\n💬 新着コメントがあります' : '';
      this.tooltip = `${discussionSummary.title}\n\nBy @${discussionSummary.author.login}\n${discussionSummary.commentsCount} comments${unreadTooltip}`;
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
    } else if (contextValue === 'loadMore') {
      this.iconPath = new vscode.ThemeIcon('ellipsis');
      this.command = {
        command: 'github-discussions.loadMoreDiscussions',
        title: 'Load More',
        arguments: [categoryId]
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

  private categories: DiscussionCategory[] = [];
  private loadingState: LoadingState = LoadingState.IDLE;
  private lastError: Error | undefined;

  // Filter state
  private searchQuery = '';
  private categoryFilter: string[] = [];
  private answeredFilter: AnsweredFilter = 'all';

  // Category-specific state for lazy loading (Requirement 15)
  private categoryStates: Map<string, CategoryState> = new Map();

  private notificationBadgeService?: INotificationBadgeService;

  constructor(
    private githubService: IGitHubService,
    private authService: IAuthenticationService
  ) {}

  /**
   * Set the notification badge service for unread indicators (Requirement 20.5)
   * This is set after initialization because of circular dependency
   */
  setNotificationBadgeService(service: INotificationBadgeService): void {
    this.notificationBadgeService = service;
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.loadingState = LoadingState.IDLE;
    this.lastError = undefined;
    this.categoryStates.clear();
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
      // Category level - lazy load discussions for this category (Requirement 15)
      const categoryId = element.category.id;

      // Check if we need to load discussions for this category
      const categoryState = this.categoryStates.get(categoryId);

      if (!categoryState || categoryState.loadState === 'not_loaded') {
        // Start loading discussions for this category
        await this.loadCategoryDiscussions(categoryId);
      }

      // Get current state after potential load
      const currentState = this.categoryStates.get(categoryId);

      // Handle loading state
      if (currentState?.loadState === 'loading') {
        return [new DiscussionTreeItem(
          'Loading...',
          vscode.TreeItemCollapsibleState.None,
          'loading'
        )];
      }

      // Handle error state
      if (currentState?.loadState === 'error') {
        return [new DiscussionTreeItem(
          `Error loading discussions (click to retry)`,
          vscode.TreeItemCollapsibleState.None,
          'error'
        )];
      }

      // Get discussion items from category state
      const items = this.getDiscussionItems(categoryId);

      if (items.length === 0) {
        return [new DiscussionTreeItem(
          'No discussions in this category',
          vscode.TreeItemCollapsibleState.None,
          'empty'
        )];
      }

      // Add "Load More" item if there are more discussions to load (Requirement 14.2)
      const paginationState = currentState?.paginationState;
      if (paginationState?.hasNextPage) {
        const loadMoreLabel = paginationState.isLoading ? 'Loading...' : 'Load more discussions...';
        items.push(new DiscussionTreeItem(
          loadMoreLabel,
          vscode.TreeItemCollapsibleState.None,
          'loadMore',
          undefined,
          undefined,
          categoryId
        ));
      }

      return items;
    }

    // Handle loadMore item - it should not have children
    if (element?.contextValue === 'loadMore') {
      return [];
    }

    return [];
  }

  /**
   * Ensure categories are loaded (Requirement 15.1: Only load categories initially)
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
          this.categories = [];
          this.loadingState = LoadingState.ERROR;
          this.lastError = new Error('Not authenticated');
          return;
        }
      }

      // Only load categories, not discussions (Requirement 15.1)
      const categories = await this.githubService.getDiscussionCategories();

      // Initialize category states as not_loaded (Requirement 15)
      for (const category of categories) {
        if (!this.categoryStates.has(category.id)) {
          this.categoryStates.set(category.id, {
            loadState: 'not_loaded',
            discussions: []
          });
        }
      }

      this.categories = categories;
      this.loadingState = LoadingState.LOADED;
      this.lastError = undefined;
    } catch (error) {
      console.error('Failed to load categories:', error);
      this.categories = [];
      this.loadingState = LoadingState.ERROR;
      this.lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Load discussions for a specific category (Requirement 15.2)
   */
  private async loadCategoryDiscussions(categoryId: string): Promise<void> {
    const currentState = this.categoryStates.get(categoryId);

    // Don't reload if already loaded or currently loading
    if (currentState?.loadState === 'loaded' || currentState?.loadState === 'loading') {
      return;
    }

    // Set loading state
    this.categoryStates.set(categoryId, {
      loadState: 'loading',
      discussions: currentState?.discussions || []
    });
    this._onDidChangeTreeData.fire();

    try {
      const pageSize = vscode.workspace.getConfiguration('github-discussions').get<number>('pageSize', 20);
      const result = await this.githubService.getDiscussionSummaries({
        first: pageSize,
        categoryId: categoryId
      });

      this.categoryStates.set(categoryId, {
        loadState: 'loaded',
        discussions: result.discussions,
        paginationState: {
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
          isLoading: false
        }
      });
    } catch (error) {
      console.error(`Failed to load discussions for category ${categoryId}:`, error);
      this.categoryStates.set(categoryId, {
        loadState: 'error',
        discussions: [],
        error: error instanceof Error ? error : new Error(String(error))
      });
    }

    this._onDidChangeTreeData.fire();
  }

  /**
   * Get category load state (for testing)
   */
  getCategoryLoadState(categoryId: string): CategoryLoadState {
    return this.categoryStates.get(categoryId)?.loadState || 'not_loaded';
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
    // Get discussions from category state (lazy loaded)
    const categoryState = this.categoryStates.get(categoryId);
    let filteredSummaries = categoryState?.discussions || [];

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

    // Get unread IDs for showing badge (Requirement 20.5)
    const unreadIds = this.notificationBadgeService?.getUnreadIds() || [];

    return filteredSummaries.map((summary: DiscussionSummary) =>
      new DiscussionTreeItem(
        summary.title,
        vscode.TreeItemCollapsibleState.None,
        'discussion',
        summary,
        undefined,
        undefined,
        unreadIds.includes(summary.id)  // Pass isUnread flag (Requirement 20.2)
      )
    );
  }

  /**
   * Load more discussions for a specific category
   * Requirement 14.3: Load next page using endCursor
   */
  async loadMoreForCategory(categoryId: string): Promise<void> {
    const categoryState = this.categoryStates.get(categoryId);
    const paginationState = categoryState?.paginationState;
    if (!paginationState || !paginationState.hasNextPage || paginationState.isLoading) {
      return;
    }

    // Set loading state (Requirement 14.6)
    paginationState.isLoading = true;
    this._onDidChangeTreeData.fire();

    try {
      const pageSize = vscode.workspace.getConfiguration('github-discussions').get<number>('pageSize', 20);
      const result = await this.githubService.getDiscussionSummaries({
        first: pageSize,
        after: paginationState.endCursor ?? undefined,
        categoryId: categoryId
      });

      // Add new discussions to existing list in category state
      const existingDiscussions = categoryState?.discussions || [];
      this.categoryStates.set(categoryId, {
        loadState: 'loaded',
        discussions: [...existingDiscussions, ...result.discussions],
        paginationState: {
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
          isLoading: false
        }
      });
    } catch (error) {
      console.error('Failed to load more discussions:', error);
      paginationState.isLoading = false;
    }

    this._onDidChangeTreeData.fire();
  }

  /**
   * Get pagination state for a category (for testing)
   */
  getCategoryPaginationState(categoryId: string): CategoryPaginationState | undefined {
    return this.categoryStates.get(categoryId)?.paginationState;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
