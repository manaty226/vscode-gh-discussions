/**
 * Notification Badge Service
 * Requirements: 19.1-19.10
 *
 * Manages the notification badge on the Activity Bar icon to indicate
 * new comments on the user's discussions.
 */

import * as vscode from 'vscode';
import { INotificationBadgeService, IGitHubService, IAuthenticationService, IStorageService } from './interfaces';
import { UnreadState } from '../models';
import { STORAGE_KEY_UNREAD_STATE, UNREAD_MAX_SIZE } from '../constants';

/**
 * Service for managing notification badges on the tree view
 */
export class NotificationBadgeService implements INotificationBadgeService {
  private disposables: vscode.Disposable[] = [];
  private cachedUnreadIds: string[] = [];
  private readonly _onDidChangeUnreadState = new vscode.EventEmitter<void>();
  readonly onDidChangeUnreadState: vscode.Event<void> = this._onDidChangeUnreadState.event;

  constructor(
    private readonly treeView: vscode.TreeView<unknown>,
    private readonly githubService: IGitHubService,
    private readonly authService: IAuthenticationService,
    private readonly storageService: IStorageService
  ) {
    this.disposables.push(this._onDidChangeUnreadState);
  }

  /**
   * Update the badge by checking for new comments on user's discussions
   * Requirements: 19.1, 19.2, 19.3, 19.7, 19.8, 19.10
   */
  async updateBadge(): Promise<void> {
    try {
      // Check authentication
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        // Not authenticated - hide badge (Requirement 19.9)
        this.treeView.badge = undefined;
        return;
      }

      // Fetch discussions to check for updates
      const result = await this.githubService.getDiscussionSummaries();

      // Filter to only discussions created by current user (Requirement 19.3)
      const myDiscussions = result.discussions.filter(
        d => d.author.login === currentUser.login
      );

      // Get current unread state
      let state = await this.storageService.getData<UnreadState>(STORAGE_KEY_UNREAD_STATE);

      // Initial startup: set lastCheckedAt to now and show no badge (Requirement 19.7)
      if (!state) {
        state = {
          unreadIds: [],
          lastCheckedAt: new Date().toISOString()
        };
        await this.storageService.storeData(STORAGE_KEY_UNREAD_STATE, state);
        this.treeView.badge = undefined;
        return;
      }

      const lastCheckedAt = new Date(state.lastCheckedAt);
      const newUnreadIds = new Set(state.unreadIds);

      // Detect new comments: updatedAt > lastCheckedAt && updatedAt > createdAt (Requirement 19.3)
      for (const d of myDiscussions) {
        const updatedAt = new Date(d.updatedAt);
        const createdAt = new Date(d.createdAt);

        // Only consider as new if:
        // 1. Updated after our last check
        // 2. Updated after creation (meaning comments were added, not just creation)
        if (updatedAt > lastCheckedAt && updatedAt > createdAt) {
          newUnreadIds.add(d.id);
        }
      }

      // Remove IDs for discussions that no longer exist
      const existingIds = new Set(myDiscussions.map(d => d.id));
      for (const id of newUnreadIds) {
        if (!existingIds.has(id)) {
          newUnreadIds.delete(id);
        }
      }

      // Enforce max size limit (Requirement 19.6)
      const unreadArray = Array.from(newUnreadIds);
      const trimmedUnreadIds = unreadArray.slice(-UNREAD_MAX_SIZE);

      // Update state with new lastCheckedAt
      const newState: UnreadState = {
        unreadIds: trimmedUnreadIds,
        lastCheckedAt: new Date().toISOString()
      };
      await this.storageService.storeData(STORAGE_KEY_UNREAD_STATE, newState);

      // Update cached unread IDs and fire event (Requirement 20.5)
      const previousUnreadIds = this.cachedUnreadIds;
      this.cachedUnreadIds = trimmedUnreadIds;
      if (JSON.stringify(previousUnreadIds) !== JSON.stringify(trimmedUnreadIds)) {
        this._onDidChangeUnreadState.fire();
      }

      // Update badge (Requirements 19.1, 19.2, 19.9)
      if (trimmedUnreadIds.length > 0) {
        this.treeView.badge = {
          value: trimmedUnreadIds.length,
          tooltip: `${trimmedUnreadIds.length}件のDiscussionに新着コメントがあります`
        };
      } else {
        this.treeView.badge = undefined;
      }
    } catch (error) {
      // Silently fail - keep existing badge state
      console.warn('Failed to update notification badge:', error);
    }
  }

  /**
   * Mark a discussion as read
   * Requirement 19.4
   */
  async markAsRead(discussionId: string): Promise<void> {
    try {
      const state = await this.storageService.getData<UnreadState>(STORAGE_KEY_UNREAD_STATE);
      if (!state) {
        return;
      }

      // Remove from unread list
      const newUnreadIds = state.unreadIds.filter(id => id !== discussionId);

      // Only update if there was a change
      if (newUnreadIds.length === state.unreadIds.length) {
        return;
      }

      const newState: UnreadState = {
        ...state,
        unreadIds: newUnreadIds
      };
      await this.storageService.storeData(STORAGE_KEY_UNREAD_STATE, newState);

      // Update cached unread IDs and fire event (Requirement 20.5)
      this.cachedUnreadIds = newUnreadIds;
      this._onDidChangeUnreadState.fire();

      // Update badge (Requirement 19.9)
      if (newUnreadIds.length > 0) {
        this.treeView.badge = {
          value: newUnreadIds.length,
          tooltip: `${newUnreadIds.length}件のDiscussionに新着コメントがあります`
        };
      } else {
        this.treeView.badge = undefined;
      }
    } catch (error) {
      console.warn('Failed to mark discussion as read:', error);
    }
  }

  /**
   * Get the list of unread discussion IDs
   * Requirement 20.5
   */
  getUnreadIds(): string[] {
    return this.cachedUnreadIds;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
