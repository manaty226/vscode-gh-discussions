/**
 * Authentication Service using VSCode's built-in GitHub authentication
 */

import * as vscode from 'vscode';
import { IAuthenticationService } from './interfaces';
import { User, AuthenticationState } from '../models';

export class AuthenticationService implements IAuthenticationService {
  private static readonly GITHUB_AUTH_PROVIDER_ID = 'github';
  private static readonly REQUIRED_SCOPES = ['repo', 'read:user'];
  private static readonly OPEN_SETTINGS_ACTION = '認証設定を開く';
  private static readonly AUTH_SETTINGS_FILTER = '@id:github.gitAuthentication';
  
  private _onDidChangeAuthenticationState = new vscode.EventEmitter<AuthenticationState>();
  public readonly onDidChangeAuthenticationState = this._onDidChangeAuthenticationState.event;

  private currentSession: vscode.AuthenticationSession | undefined;
  private currentUser: User | undefined;

  constructor() {
    // Listen for authentication changes
    vscode.authentication.onDidChangeSessions(async (e) => {
      if (e.provider.id === AuthenticationService.GITHUB_AUTH_PROVIDER_ID) {
        await this.handleAuthenticationChange();
      }
    });

    // Initialize current session
    this.initializeSession();
  }

  /**
   * Get current authentication session
   */
  async getSession(): Promise<vscode.AuthenticationSession | undefined> {
    try {
      // Try to get existing session silently first
      const session = await vscode.authentication.getSession(
        AuthenticationService.GITHUB_AUTH_PROVIDER_ID,
        AuthenticationService.REQUIRED_SCOPES,
        { silent: true }
      );

      if (session) {
        this.currentSession = session;
        return session;
      }

      // If no session exists, prompt user to sign in
      const newSession = await vscode.authentication.getSession(
        AuthenticationService.GITHUB_AUTH_PROVIDER_ID,
        AuthenticationService.REQUIRED_SCOPES,
        { createIfNone: true }
      );

      this.currentSession = newSession;
      return newSession;
    } catch (error) {
      console.error('Failed to get authentication session:', error);
      this.currentSession = undefined;
      await this.handleAuthenticationError(error);
      return undefined;
    }
  }

  /**
   * Handle authentication errors by showing error message with option to open settings
   * Requirement 1.4: Show error message and provide guidance to VSCode authentication settings
   */
  private async handleAuthenticationError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const action = await vscode.window.showErrorMessage(
      `認証に失敗しました: ${errorMessage}`,
      AuthenticationService.OPEN_SETTINGS_ACTION
    );

    if (action === AuthenticationService.OPEN_SETTINGS_ACTION) {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        AuthenticationService.AUTH_SETTINGS_FILTER
      );
    }
  }

  /**
   * Get current session silently (without prompting user)
   */
  async getSessionSilent(): Promise<vscode.AuthenticationSession | undefined> {
    try {
      const session = await vscode.authentication.getSession(
        AuthenticationService.GITHUB_AUTH_PROVIDER_ID,
        AuthenticationService.REQUIRED_SCOPES,
        { silent: true }
      );
      this.currentSession = session;
      return session;
    } catch (error) {
      console.error('Failed to get session silently:', error);
      return undefined;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await vscode.authentication.getSession(
        AuthenticationService.GITHUB_AUTH_PROVIDER_ID,
        AuthenticationService.REQUIRED_SCOPES,
        { silent: true }
      );

      return session !== undefined;
    } catch (error) {
      console.error('Failed to check authentication status:', error);
      return false;
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<User | undefined> {
    if (this.currentUser && this.currentSession) {
      return this.currentUser;
    }

    const session = await this.getSession();
    if (!session) {
      return undefined;
    }

    try {
      // Use GitHub API to get user information
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${session.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'VSCode-GitHub-Discussions'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const userData = await response.json() as {
        id: number;
        login: string;
        name: string | null;
        avatar_url: string;
      };
      
      this.currentUser = {
        id: userData.id.toString(),
        login: userData.login,
        name: userData.name,
        avatarUrl: userData.avatar_url
      };

      return this.currentUser;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return undefined;
    }
  }

  /**
   * Initialize session on startup
   */
  private async initializeSession(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession(
        AuthenticationService.GITHUB_AUTH_PROVIDER_ID,
        AuthenticationService.REQUIRED_SCOPES,
        { silent: true }
      );

      this.currentSession = session;
      
      if (session) {
        await this.getCurrentUser();
      }

      await this.updateAuthenticationState();
    } catch (error) {
      console.error('Failed to initialize authentication session:', error);
      await this.updateAuthenticationState();
    }
  }

  /**
   * Handle authentication state changes
   */
  private async handleAuthenticationChange(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession(
        AuthenticationService.GITHUB_AUTH_PROVIDER_ID,
        AuthenticationService.REQUIRED_SCOPES,
        { silent: true }
      );

      const wasAuthenticated = this.currentSession !== undefined;
      const isAuthenticated = session !== undefined;

      this.currentSession = session;

      // Clear user data if signed out
      if (!session) {
        this.currentUser = undefined;
      } else if (!wasAuthenticated || session.account.id !== this.currentSession?.account.id) {
        // Refresh user data if signed in or switched accounts
        await this.getCurrentUser();
      }

      await this.updateAuthenticationState();

      // Show notification for authentication changes
      if (wasAuthenticated && !isAuthenticated) {
        vscode.window.showInformationMessage('Signed out of GitHub');
      } else if (!wasAuthenticated && isAuthenticated) {
        vscode.window.showInformationMessage(`Signed in to GitHub as ${session.account.label}`);
      }
    } catch (error) {
      console.error('Failed to handle authentication change:', error);
    }
  }

  /**
   * Update VSCode context and fire events
   */
  private async updateAuthenticationState(): Promise<void> {
    const isAuthenticated = this.currentSession !== undefined;
    
    // Update VSCode context
    await vscode.commands.executeCommand('setContext', 'github-discussions:authenticated', isAuthenticated);

    // Fire event
    const state: AuthenticationState = {
      isAuthenticated,
      token: this.currentSession?.accessToken,
      user: this.currentUser
    };

    this._onDidChangeAuthenticationState.fire(state);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._onDidChangeAuthenticationState.dispose();
  }
}