/**
 * Storage Service Tests
 */

import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { StorageService } from '../services/storageService';
import { ExtensionSettings } from '../models';

describe('StorageService', () => {
  let storageService: StorageService;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
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
        keys: jest.fn().mockReturnValue([]),
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

    // Mock workspace configuration
    (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
      get: jest.fn((key: string, defaultValue: any) => defaultValue)
    }));

    storageService = new StorageService(mockContext);
    jest.clearAllMocks();
  });

  describe('Unit Tests', () => {
    describe('token management', () => {
      it('should store and retrieve tokens', async () => {
        const testToken = 'ghp_test_token_123';
        
        (mockContext.secrets.store as jest.Mock).mockResolvedValue(undefined);
        (mockContext.secrets.get as jest.Mock).mockResolvedValue(testToken);

        await storageService.storeToken(testToken);
        const retrievedToken = await storageService.getToken();

        expect(mockContext.secrets.store).toHaveBeenCalledWith('github-token', testToken);
        expect(retrievedToken).toBe(testToken);
      });

      it('should clear tokens', async () => {
        (mockContext.secrets.delete as jest.Mock).mockResolvedValue(undefined);

        await storageService.clearToken();

        expect(mockContext.secrets.delete).toHaveBeenCalledWith('github-token');
      });

      it('should handle token storage errors', async () => {
        (mockContext.secrets.store as jest.Mock).mockRejectedValue(new Error('Storage error'));

        await expect(storageService.storeToken('test-token')).rejects.toThrow('Failed to store authentication token');
      });
    });

    describe('settings management', () => {
      it('should return default settings when none stored', async () => {
        (mockContext.globalState.get as jest.Mock).mockReturnValue(undefined);

        const settings = await storageService.getSettings();

        expect(settings).toEqual({
          autoRefresh: true,
          refreshInterval: 300,
          showNotifications: true,
          defaultSort: 'newest',
          defaultCategory: 'general'
        });
      });

      it('should merge stored settings with defaults', async () => {
        const storedSettings = {
          autoRefresh: false,
          refreshInterval: 600
        };

        (mockContext.globalState.get as jest.Mock).mockReturnValue(storedSettings);

        const settings = await storageService.getSettings();

        expect(settings).toEqual({
          autoRefresh: false,
          refreshInterval: 600,
          showNotifications: true,
          defaultSort: 'newest',
          defaultCategory: 'general'
        });
      });

      it('should store settings updates', async () => {
        const currentSettings: ExtensionSettings = {
          autoRefresh: true,
          refreshInterval: 300,
          showNotifications: true,
          defaultSort: 'newest',
          defaultCategory: 'general'
        };

        const updates = {
          autoRefresh: false,
          refreshInterval: 600
        };

        (mockContext.globalState.get as jest.Mock).mockReturnValue(currentSettings);
        (mockContext.globalState.update as jest.Mock).mockResolvedValue(undefined);

        await storageService.storeSettings(updates);

        expect(mockContext.globalState.update).toHaveBeenCalledWith('extension-settings', {
          ...currentSettings,
          ...updates
        });
      });
    });

    describe('generic data storage', () => {
      it('should store and retrieve arbitrary data', async () => {
        const testData = { test: 'value', number: 42 };
        const testKey = 'test-key';

        (mockContext.globalState.update as jest.Mock).mockResolvedValue(undefined);
        (mockContext.globalState.get as jest.Mock).mockReturnValue(testData);

        await storageService.storeData(testKey, testData);
        const retrievedData = await storageService.getData(testKey);

        expect(mockContext.globalState.update).toHaveBeenCalledWith(testKey, testData);
        expect(retrievedData).toEqual(testData);
      });

      it('should clear data', async () => {
        const testKey = 'test-key';

        (mockContext.globalState.update as jest.Mock).mockResolvedValue(undefined);

        await storageService.clearData(testKey);

        expect(mockContext.globalState.update).toHaveBeenCalledWith(testKey, undefined);
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property: Data storage should be consistent
     * Any data stored should be retrievable with the same value
     */
    it('should maintain data consistency across store/retrieve operations', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          key: fc.string({ minLength: 1, maxLength: 50 }),
          data: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.record({
              str: fc.string(),
              num: fc.integer(),
              bool: fc.boolean()
            })
          )
        }),
        async ({ key, data }) => {
          // Mock successful storage and retrieval
          (mockContext.globalState.update as jest.Mock).mockResolvedValue(undefined);
          (mockContext.globalState.get as jest.Mock).mockReturnValue(data);

          // Store data
          await storageService.storeData(key, data);
          
          // Retrieve data
          const retrieved = await storageService.getData(key);

          // Property: Retrieved data should equal stored data
          expect(retrieved).toEqual(data);
          expect(mockContext.globalState.update).toHaveBeenCalledWith(key, data);
        }
      ), { numRuns: 100 });
    });

    /**
     * Property: Settings should always have valid defaults
     * Any combination of stored settings should result in valid configuration
     */
    it('should always return valid settings with proper defaults', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          autoRefresh: fc.option(fc.boolean()),
          refreshInterval: fc.option(fc.integer({ min: 30, max: 3600 })),
          showNotifications: fc.option(fc.boolean()),
          defaultSort: fc.option(fc.constantFrom('newest', 'oldest', 'top')),
          defaultCategory: fc.option(fc.string({ minLength: 1, maxLength: 50 }))
        }),
        async (partialSettings) => {
          // Filter out undefined values to simulate partial storage
          const storedSettings = Object.fromEntries(
            Object.entries(partialSettings).filter(([, value]) => value !== null)
          );

          (mockContext.globalState.get as jest.Mock).mockReturnValue(storedSettings);

          const settings = await storageService.getSettings();

          // Property: All required settings should be present with valid values
          expect(settings).toHaveProperty('autoRefresh');
          expect(settings).toHaveProperty('refreshInterval');
          expect(settings).toHaveProperty('showNotifications');
          expect(settings).toHaveProperty('defaultSort');
          expect(settings).toHaveProperty('defaultCategory');

          expect(typeof settings.autoRefresh).toBe('boolean');
          expect(typeof settings.refreshInterval).toBe('number');
          expect(typeof settings.showNotifications).toBe('boolean');
          expect(typeof settings.defaultSort).toBe('string');
          expect(typeof settings.defaultCategory).toBe('string');

          expect(settings.refreshInterval).toBeGreaterThan(0);
          expect(['newest', 'oldest', 'top']).toContain(settings.defaultSort);
        }
      ), { numRuns: 50 });
    });

    /**
     * Property: Token operations should be safe
     * Token storage and retrieval should handle various token formats
     */
    it('should handle various token formats safely', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (token) => {
          // Mock successful operations
          (mockContext.secrets.store as jest.Mock).mockResolvedValue(undefined);
          (mockContext.secrets.get as jest.Mock).mockResolvedValue(token);
          (mockContext.secrets.delete as jest.Mock).mockResolvedValue(undefined);

          // Store token
          await storageService.storeToken(token);
          
          // Retrieve token
          const retrieved = await storageService.getToken();
          
          // Clear token
          await storageService.clearToken();

          // Property: Token should be stored and retrieved correctly
          expect(retrieved).toBe(token);
          expect(mockContext.secrets.store).toHaveBeenCalledWith('github-token', token);
          expect(mockContext.secrets.delete).toHaveBeenCalledWith('github-token');
        }
      ), { numRuns: 50 });
    });
  });
});