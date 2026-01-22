/**
 * Cache Service - In-memory caching with TTL support
 * Requirements: 7.2, 7.3
 */

import { ICacheService } from './interfaces';
import { CacheEntry } from '../models';

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export class CacheService implements ICacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set a value in the cache with optional TTL
   */
  set<T>(key: string, value: T, ttl: number = DEFAULT_TTL): void {
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists in the cache and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove a specific key from the cache
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Remove all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidateByPattern(pattern: RegExp): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Get a value from cache, or compute and cache it if not present
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = DEFAULT_TTL
  ): Promise<T> {
    const cached = this.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);

    return value;
  }

  /**
   * Check if an entry has expired
   */
  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() > entry.timestamp + entry.ttl;
  }
}
