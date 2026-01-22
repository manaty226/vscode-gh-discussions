/**
 * Auto Refresh Service
 * Requirements: 7.1, 7.2
 *
 * Provides automatic periodic refresh of discussions data
 */

import * as vscode from 'vscode';

export interface IAutoRefreshService {
  start(): void;
  stop(): void;
  setInterval(intervalMs: number): void;
  isRunning(): boolean;
  onDidRefresh: vscode.Event<void>;
  dispose(): void;
}

export class AutoRefreshService implements IAutoRefreshService {
  private timer: NodeJS.Timeout | undefined;
  private intervalMs: number;
  private running = false;
  private readonly _onDidRefresh = new vscode.EventEmitter<void>();
  readonly onDidRefresh: vscode.Event<void> = this._onDidRefresh.event;

  private configChangeDisposable: vscode.Disposable;

  constructor() {
    // Load initial settings
    const config = vscode.workspace.getConfiguration('github-discussions');
    this.intervalMs = config.get<number>('refreshInterval', 300000); // Default 5 minutes

    // Listen for configuration changes
    this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('github-discussions.refreshInterval')) {
        const newInterval = vscode.workspace
          .getConfiguration('github-discussions')
          .get<number>('refreshInterval', 300000);
        this.setInterval(newInterval);
      }

      if (e.affectsConfiguration('github-discussions.autoRefresh')) {
        const autoRefresh = vscode.workspace
          .getConfiguration('github-discussions')
          .get<boolean>('autoRefresh', true);

        if (autoRefresh && !this.running) {
          this.start();
        } else if (!autoRefresh && this.running) {
          this.stop();
        }
      }
    });
  }

  /**
   * Start the auto-refresh timer
   */
  start(): void {
    if (this.running) {
      return;
    }

    const config = vscode.workspace.getConfiguration('github-discussions');
    const autoRefresh = config.get<boolean>('autoRefresh', true);

    if (!autoRefresh) {
      return;
    }

    this.running = true;
    this.scheduleNextRefresh();
  }

  /**
   * Stop the auto-refresh timer
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.running = false;
  }

  /**
   * Set a new refresh interval
   */
  setInterval(intervalMs: number): void {
    // Minimum interval is 30 seconds
    this.intervalMs = Math.max(30000, intervalMs);

    if (this.running) {
      // Restart with new interval
      this.stop();
      this.start();
    }
  }

  /**
   * Check if auto-refresh is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Schedule the next refresh
   */
  private scheduleNextRefresh(): void {
    if (!this.running) {
      return;
    }

    this.timer = setTimeout(() => {
      this.doRefresh();
    }, this.intervalMs);
  }

  /**
   * Execute refresh and schedule next one
   */
  private doRefresh(): void {
    if (!this.running) {
      return;
    }

    this._onDidRefresh.fire();

    // Schedule next refresh
    this.scheduleNextRefresh();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop();
    this.configChangeDisposable?.dispose();
    this._onDidRefresh.dispose();
  }
}
