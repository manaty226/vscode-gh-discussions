/**
 * Storage Service for managing extension data
 */

import * as vscode from 'vscode';
import { IStorageService } from './interfaces';
import { ExtensionSettings } from '../models';

export class StorageService implements IStorageService {
  private static readonly TOKEN_KEY = 'github-token';
  private static readonly SETTINGS_KEY = 'extension-settings';

  constructor(
    private context: vscode.ExtensionContext
  ) {}

  /**
   * Store GitHub token (Note: With VSCode auth, this is mainly for compatibility)
   */
  async storeToken(token: string): Promise<void> {
    try {
      await this.context.secrets.store(StorageService.TOKEN_KEY, token);
    } catch (error) {
      console.error('Failed to store token:', error);
      throw new Error('Failed to store authentication token');
    }
  }

  /**
   * Get stored GitHub token (Note: With VSCode auth, this is mainly for compatibility)
   */
  async getToken(): Promise<string | undefined> {
    try {
      return await this.context.secrets.get(StorageService.TOKEN_KEY);
    } catch (error) {
      console.error('Failed to get token:', error);
      return undefined;
    }
  }

  /**
   * Clear stored GitHub token
   */
  async clearToken(): Promise<void> {
    try {
      await this.context.secrets.delete(StorageService.TOKEN_KEY);
    } catch (error) {
      console.error('Failed to clear token:', error);
    }
  }

  /**
   * Store extension settings
   */
  async storeSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = { ...currentSettings, ...settings };
      
      await this.context.globalState.update(StorageService.SETTINGS_KEY, updatedSettings);
    } catch (error) {
      console.error('Failed to store settings:', error);
      throw new Error('Failed to store extension settings');
    }
  }

  /**
   * Get extension settings with defaults
   */
  async getSettings(): Promise<ExtensionSettings> {
    try {
      const stored = this.context.globalState.get<Partial<ExtensionSettings>>(StorageService.SETTINGS_KEY);
      const config = vscode.workspace.getConfiguration('github-discussions');

      // Merge stored settings with VSCode configuration and defaults
      return {
        autoRefresh: stored?.autoRefresh ?? config.get('autoRefresh', true),
        refreshInterval: stored?.refreshInterval ?? config.get('refreshInterval', 300),
        showNotifications: stored?.showNotifications ?? config.get('showNotifications', true),
        defaultSort: stored?.defaultSort ?? config.get('defaultSort', 'newest'),
        defaultCategory: stored?.defaultCategory ?? config.get('defaultCategory', 'general')
      };
    } catch (error) {
      console.error('Failed to get settings:', error);
      
      // Return defaults on error
      return {
        autoRefresh: true,
        refreshInterval: 300,
        showNotifications: true,
        defaultSort: 'newest',
        defaultCategory: 'general'
      };
    }
  }

  /**
   * Store arbitrary data
   */
  async storeData<T>(key: string, data: T): Promise<void> {
    try {
      await this.context.globalState.update(key, data);
    } catch (error) {
      console.error(`Failed to store data for key ${key}:`, error);
      throw new Error(`Failed to store data for key: ${key}`);
    }
  }

  /**
   * Get stored data
   */
  async getData<T>(key: string): Promise<T | undefined> {
    try {
      return this.context.globalState.get<T>(key);
    } catch (error) {
      console.error(`Failed to get data for key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Clear stored data
   */
  async clearData(key: string): Promise<void> {
    try {
      await this.context.globalState.update(key, undefined);
    } catch (error) {
      console.error(`Failed to clear data for key ${key}:`, error);
    }
  }

  /**
   * Get all stored keys (for debugging)
   */
  getStoredKeys(): readonly string[] {
    return this.context.globalState.keys();
  }

  /**
   * Clear all extension data (for reset functionality)
   */
  async clearAllData(): Promise<void> {
    try {
      const keys = this.getStoredKeys();
      
      for (const key of keys) {
        await this.context.globalState.update(key, undefined);
      }

      // Also clear secrets
      await this.clearToken();
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw new Error('Failed to clear extension data');
    }
  }
}