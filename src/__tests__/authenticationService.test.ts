/**
 * Authentication Service Tests
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { AuthenticationService } from '../services/authenticationService';
import { StorageService } from '../services/storageService';

// Mock fetch globally
global.fetch = jest.fn();

describe('AuthenticationService', () => {
  let authService: AuthenticationService;
  let mockContext: vscode.ExtensionContext;
  let storageService: StorageService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock context
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn()
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(),
        setKeysForSync: jest.fn()
      },
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn(),
        keys: jest.fn()
      },
      extensionUri: vscode.Uri.parse('file:///test'),
      extensionPath: '/test',
      storagePath: '/test/storage',
      globalStoragePath: '/test/globalStorage',
      logPath: '/test/log',
      environmentVariableCollection: {} as any,
      asAbsolutePath: jest.fn((path: string) => `/test/${path}`),
      storageUri: vscode.Uri.parse('file:///test/storage'),
      globalStorageUri: vscode.Uri.parse('file:///test/globalStorage'),
      logUri: vscode.Uri.parse('file:///test/log'),
      extensionMode: 1,
      extension: {} as any,
      languageModelAccessInformation: {} as any
    };

    // Setup mock authentication
    jest.mocked(vscode.authentication.getSession).mockClear();
    jest.mocked(vscode.authentication.onDidChangeSessions).mockClear();
    jest.mocked(vscode.commands.executeCommand).mockClear();

    // Setup mock fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: 12345,
        login: 'testuser',
        name: 'Test User',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif'
      })
    });

    storageService = new StorageService(mockContext);
    authService = new AuthenticationService();
  });

  afterEach(() => {
    if (authService) {
      authService.dispose();
    }
  });

  describe('Unit Tests', () => {
    describe('getSession', () => {
      it('should return existing session when available', async () => {
        const mockSession = {
          id: 'test-session',
          accessToken: 'test-token',
          account: { id: 'test-account', label: 'testuser' },
          scopes: ['repo', 'read:user']
        };

        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValueOnce(mockSession);

        const session = await authService.getSession();

        expect(session).toBe(mockSession);
        expect(vscode.authentication.getSession).toHaveBeenCalledWith(
          'github',
          ['repo', 'read:user'],
          { silent: true }
        );
      });

      it('should create new session when none exists', async () => {
        const mockSession = {
          id: 'new-session',
          accessToken: 'new-token',
          account: { id: 'new-account', label: 'newuser' },
          scopes: ['repo', 'read:user']
        };

        // Clear any calls from constructor initialization
        jest.mocked(vscode.authentication.getSession).mockClear();

        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValueOnce(undefined) // First call (silent)
          .mockResolvedValueOnce(mockSession); // Second call (createIfNone)

        const session = await authService.getSession();

        expect(session).toBe(mockSession);
        // Verify that getSession was called with createIfNone option
        expect(vscode.authentication.getSession).toHaveBeenCalledWith(
          'github',
          ['repo', 'read:user'],
          { createIfNone: true }
        );
      });

      it('should handle authentication errors gracefully', async () => {
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(new Error('Authentication failed'));

        const session = await authService.getSession();

        expect(session).toBeUndefined();
      });
    });

    describe('isAuthenticated', () => {
      it('should return true when session exists', async () => {
        const mockSession = {
          id: 'test-session',
          accessToken: 'test-token',
          account: { id: 'test-account', label: 'testuser' },
          scopes: ['repo', 'read:user']
        };

        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValue(mockSession);

        const isAuth = await authService.isAuthenticated();

        expect(isAuth).toBe(true);
      });

      it('should return false when no session exists', async () => {
        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValue(undefined);

        const isAuth = await authService.isAuthenticated();

        expect(isAuth).toBe(false);
      });

      it('should return false on authentication error', async () => {
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(new Error('Auth error'));

        const isAuth = await authService.isAuthenticated();

        expect(isAuth).toBe(false);
      });
    });

    describe('handleAuthenticationError', () => {
      it('should display error message when authentication fails', async () => {
        const authError = new Error('User denied authentication');
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(authError);

        await authService.getSession();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining('認証に失敗しました'),
          expect.any(String)
        );
      });

      it('should provide option to open VSCode authentication settings', async () => {
        const authError = new Error('Authentication provider unavailable');
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(authError);

        await authService.getSession();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.any(String),
          '認証設定を開く'
        );
      });

      it('should open authentication settings when user clicks the button', async () => {
        const authError = new Error('Auth failed');
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(authError);
        jest.mocked(vscode.window.showErrorMessage)
          .mockResolvedValue('認証設定を開く' as any);

        await authService.getSession();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.openSettings',
          '@id:github.gitAuthentication'
        );
      });

      it('should not open settings when user dismisses the error message', async () => {
        const authError = new Error('Auth failed');
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(authError);
        jest.mocked(vscode.window.showErrorMessage)
          .mockResolvedValue(undefined as any);

        const commandCallsBefore = jest.mocked(vscode.commands.executeCommand).mock.calls.length;
        await authService.getSession();
        const commandCallsAfter = jest.mocked(vscode.commands.executeCommand).mock.calls.length;

        // No new calls to executeCommand for opening settings
        const settingsOpenCalls = jest.mocked(vscode.commands.executeCommand).mock.calls
          .slice(commandCallsBefore, commandCallsAfter)
          .filter(call => call[0] === 'workbench.action.openSettings');

        expect(settingsOpenCalls).toHaveLength(0);
      });

      it('should include error details in the error message', async () => {
        const errorMessage = 'Session expired';
        const authError = new Error(errorMessage);
        jest.mocked(vscode.authentication.getSession)
          .mockRejectedValue(authError);

        await authService.getSession();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining(errorMessage),
          expect.any(String)
        );
      });
    });

    describe('getCurrentUser', () => {
      it('should fetch and return user data', async () => {
        const mockSession = {
          id: 'test-session',
          accessToken: 'test-token',
          account: { id: 'test-account', label: 'testuser' },
          scopes: ['repo', 'read:user']
        };

        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValue(mockSession);

        const user = await authService.getCurrentUser();

        expect(user).toEqual({
          id: '12345',
          login: 'testuser',
          name: 'Test User',
          avatarUrl: 'https://github.com/images/error/testuser_happy.gif'
        });

        expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
          headers: {
            'Authorization': 'token test-token',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'VSCode-GitHub-Discussions'
          }
        });
      });

      it('should return undefined when not authenticated', async () => {
        // Create a fresh service instance to avoid cached user data
        const freshAuthService = new AuthenticationService();

        // Mock getSession to return undefined (not authenticated)
        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValue(undefined);

        try {
          const user = await freshAuthService.getCurrentUser();
          expect(user).toBeUndefined();
        } finally {
          freshAuthService.dispose();
        }
      });

      it('should handle API errors gracefully', async () => {
        const mockSession = {
          id: 'test-session',
          accessToken: 'test-token',
          account: { id: 'test-account', label: 'testuser' },
          scopes: ['repo', 'read:user']
        };

        jest.mocked(vscode.authentication.getSession)
          .mockResolvedValue(mockSession);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized'
        });

        const user = await authService.getCurrentUser();

        expect(user).toBeUndefined();
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Feature: github-discussions-plugin, Property 1: 認証セッション管理の一貫性
     * 
     * Property: Authentication Session Management Consistency
     * For any authentication operation, VSCode authentication provider sessions can be retrieved
     * and authentication state is correctly reflected
     * Validates: Requirements 1.1, 1.3, 1.5
     */
    it('should maintain consistent authentication state across operations', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          hasSession: fc.boolean(),
          sessionId: fc.string({ minLength: 1, maxLength: 50 }),
          accessToken: fc.string({ minLength: 10, maxLength: 100 }),
          accountId: fc.string({ minLength: 1, maxLength: 50 }),
          accountLabel: fc.string({ minLength: 1, maxLength: 50 }),
          userId: fc.integer({ min: 1, max: 999999 }),
          userLogin: fc.string({ minLength: 1, maxLength: 39 }), // GitHub username max length
          userName: fc.oneof(fc.string({ minLength: 1, maxLength: 100 }), fc.constant(null))
        }),
        async (testData) => {
          // Setup mock session based on test data
          const mockSession = testData.hasSession ? {
            id: testData.sessionId,
            accessToken: testData.accessToken,
            account: { 
              id: testData.accountId, 
              label: testData.accountLabel 
            },
            scopes: ['repo', 'read:user']
          } : undefined;

          // Setup mock user data
          (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
              id: testData.userId,
              login: testData.userLogin,
              name: testData.userName,
              avatar_url: `https://github.com/images/error/${testData.userLogin}_happy.gif`
            })
          });

          jest.mocked(vscode.authentication.getSession)
            .mockResolvedValue(mockSession);

          // Create fresh service instance for each test
          const testAuthService = new AuthenticationService();

          try {
            // Test authentication state consistency
            const isAuthenticated = await testAuthService.isAuthenticated();
            const session = await testAuthService.getSession();
            const user = await testAuthService.getCurrentUser();

            // Property: Authentication state should be consistent
            if (testData.hasSession) {
              // When session exists, all authentication checks should be consistent
              expect(isAuthenticated).toBe(true);
              expect(session).toBeDefined();
              expect(session?.id).toBe(testData.sessionId);
              expect(session?.accessToken).toBe(testData.accessToken);
              
              // User data should be available when session exists
              if (user) {
                expect(user.id).toBe(testData.userId.toString());
                expect(user.login).toBe(testData.userLogin);
                expect(user.name).toBe(testData.userName);
              }
            } else {
              // When no session exists, authentication should be false
              // Note: getSession might create a new session, so we only test isAuthenticated
              expect(isAuthenticated).toBe(false);
            }

            // Property: Multiple calls should return consistent results
            const isAuthenticated2 = await testAuthService.isAuthenticated();
            expect(isAuthenticated2).toBe(isAuthenticated);

          } finally {
            testAuthService.dispose();
          }
        }
      ), { numRuns: 100 });
    });

    /**
     * Property: Session retrieval should be idempotent
     * Multiple calls to getSession should return the same session when no changes occur
     */
    it('should return consistent session across multiple calls', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          sessionId: fc.string({ minLength: 1, maxLength: 50 }),
          accessToken: fc.string({ minLength: 10, maxLength: 100 }),
          accountId: fc.string({ minLength: 1, maxLength: 50 }),
          accountLabel: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async (testData) => {
          const mockSession = {
            id: testData.sessionId,
            accessToken: testData.accessToken,
            account: { 
              id: testData.accountId, 
              label: testData.accountLabel 
            },
            scopes: ['repo', 'read:user']
          };

          jest.mocked(vscode.authentication.getSession)
            .mockResolvedValue(mockSession);

          const testAuthService = new AuthenticationService();

          try {
            // Get session multiple times
            const session1 = await testAuthService.getSession();
            const session2 = await testAuthService.getSession();
            const session3 = await testAuthService.getSession();

            // Property: All sessions should be identical
            expect(session1).toEqual(session2);
            expect(session2).toEqual(session3);
            expect(session1?.id).toBe(testData.sessionId);
            expect(session1?.accessToken).toBe(testData.accessToken);

          } finally {
            testAuthService.dispose();
          }
        }
      ), { numRuns: 50 });
    });

    /**
     * Property: User data should be consistent with session
     * When a session exists, user data should be retrievable and consistent
     */
    it('should maintain user data consistency with session state', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          sessionExists: fc.boolean(),
          userId: fc.integer({ min: 1, max: 999999 }),
          userLogin: fc.string({ minLength: 1, maxLength: 39 }),
          userName: fc.oneof(fc.string({ minLength: 1, maxLength: 100 }), fc.constant(null)),
          accessToken: fc.string({ minLength: 10, maxLength: 100 })
        }),
        async (testData) => {
          const mockSession = testData.sessionExists ? {
            id: 'test-session',
            accessToken: testData.accessToken,
            account: { id: 'test-account', label: testData.userLogin },
            scopes: ['repo', 'read:user']
          } : undefined;

          jest.mocked(vscode.authentication.getSession)
            .mockResolvedValue(mockSession);

          (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
              id: testData.userId,
              login: testData.userLogin,
              name: testData.userName,
              avatar_url: `https://github.com/images/error/${testData.userLogin}_happy.gif`
            })
          });

          const testAuthService = new AuthenticationService();

          try {
            const isAuthenticated = await testAuthService.isAuthenticated();
            const user = await testAuthService.getCurrentUser();

            // Property: User data availability should match authentication state
            if (testData.sessionExists) {
              expect(isAuthenticated).toBe(true);
              expect(user).toBeDefined();
              expect(user?.login).toBe(testData.userLogin);
              expect(user?.id).toBe(testData.userId.toString());
              expect(user?.name).toBe(testData.userName);
            } else {
              expect(isAuthenticated).toBe(false);
              expect(user).toBeUndefined();
            }

          } finally {
            testAuthService.dispose();
          }
        }
      ), { numRuns: 50 });
    });
  });
});