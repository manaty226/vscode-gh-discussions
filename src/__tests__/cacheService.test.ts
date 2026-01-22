/**
 * Cache Service Tests - TDD
 * Requirements: 7.2, 7.3
 */

import * as fc from 'fast-check';
import { CacheService } from '../services/cacheService';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    cacheService = new CacheService();
  });

  afterEach(() => {
    cacheService.clear();
    jest.useRealTimers();
  });

  describe('Unit Tests', () => {
    describe('set and get', () => {
      it('should store and retrieve a value', () => {
        cacheService.set('key1', 'value1');
        expect(cacheService.get('key1')).toBe('value1');
      });

      it('should store and retrieve complex objects', () => {
        const complexObject = {
          id: 1,
          name: 'test',
          nested: { a: 1, b: [1, 2, 3] }
        };
        cacheService.set('complex', complexObject);
        expect(cacheService.get('complex')).toEqual(complexObject);
      });

      it('should return undefined for non-existent keys', () => {
        expect(cacheService.get('nonexistent')).toBeUndefined();
      });

      it('should overwrite existing values', () => {
        cacheService.set('key', 'value1');
        cacheService.set('key', 'value2');
        expect(cacheService.get('key')).toBe('value2');
      });
    });

    describe('TTL (Time To Live)', () => {
      it('should use default TTL when not specified', () => {
        cacheService.set('key', 'value');

        // Advance time just before default TTL (5 minutes)
        jest.advanceTimersByTime(4 * 60 * 1000);
        expect(cacheService.get('key')).toBe('value');

        // Advance past TTL
        jest.advanceTimersByTime(2 * 60 * 1000);
        expect(cacheService.get('key')).toBeUndefined();
      });

      it('should respect custom TTL', () => {
        cacheService.set('key', 'value', 1000); // 1 second TTL

        jest.advanceTimersByTime(500);
        expect(cacheService.get('key')).toBe('value');

        jest.advanceTimersByTime(600);
        expect(cacheService.get('key')).toBeUndefined();
      });

      it('should not return expired entries', () => {
        cacheService.set('key', 'value', 100);
        jest.advanceTimersByTime(200);
        expect(cacheService.get('key')).toBeUndefined();
      });
    });

    describe('has', () => {
      it('should return true for existing keys', () => {
        cacheService.set('key', 'value');
        expect(cacheService.has('key')).toBe(true);
      });

      it('should return false for non-existent keys', () => {
        expect(cacheService.has('nonexistent')).toBe(false);
      });

      it('should return false for expired keys', () => {
        cacheService.set('key', 'value', 100);
        jest.advanceTimersByTime(200);
        expect(cacheService.has('key')).toBe(false);
      });
    });

    describe('invalidate', () => {
      it('should remove a specific key', () => {
        cacheService.set('key1', 'value1');
        cacheService.set('key2', 'value2');

        cacheService.invalidate('key1');

        expect(cacheService.get('key1')).toBeUndefined();
        expect(cacheService.get('key2')).toBe('value2');
      });

      it('should not throw for non-existent keys', () => {
        expect(() => cacheService.invalidate('nonexistent')).not.toThrow();
      });
    });

    describe('clear', () => {
      it('should remove all entries', () => {
        cacheService.set('key1', 'value1');
        cacheService.set('key2', 'value2');
        cacheService.set('key3', 'value3');

        cacheService.clear();

        expect(cacheService.get('key1')).toBeUndefined();
        expect(cacheService.get('key2')).toBeUndefined();
        expect(cacheService.get('key3')).toBeUndefined();
      });
    });

    describe('invalidateByPattern', () => {
      it('should invalidate keys matching a pattern', () => {
        cacheService.set('discussions:1', 'data1');
        cacheService.set('discussions:2', 'data2');
        cacheService.set('categories:1', 'cat1');

        cacheService.invalidateByPattern(/^discussions:/);

        expect(cacheService.get('discussions:1')).toBeUndefined();
        expect(cacheService.get('discussions:2')).toBeUndefined();
        expect(cacheService.get('categories:1')).toBe('cat1');
      });
    });

    describe('getOrSet', () => {
      it('should return cached value if exists', async () => {
        cacheService.set('key', 'cached');
        const factory = jest.fn().mockResolvedValue('new');

        const result = await cacheService.getOrSet('key', factory);

        expect(result).toBe('cached');
        expect(factory).not.toHaveBeenCalled();
      });

      it('should call factory and cache result if not exists', async () => {
        const factory = jest.fn().mockResolvedValue('new');

        const result = await cacheService.getOrSet('key', factory);

        expect(result).toBe('new');
        expect(factory).toHaveBeenCalledTimes(1);
        expect(cacheService.get('key')).toBe('new');
      });

      it('should call factory for expired entries', async () => {
        cacheService.set('key', 'old', 100);
        jest.advanceTimersByTime(200);

        const factory = jest.fn().mockResolvedValue('new');
        const result = await cacheService.getOrSet('key', factory);

        expect(result).toBe('new');
        expect(factory).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property: Cache should always return the most recently set value
     * Validates: Requirement 7.2
     */
    it('should always return the most recently set value for a key', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        (key, values) => {
          const testCache = new CacheService();

          // Set multiple values for the same key
          for (const value of values) {
            testCache.set(key, value);
          }

          // Should return the last value
          const lastValue = values[values.length - 1];
          expect(testCache.get(key)).toBe(lastValue);

          testCache.clear();
        }
      ), { numRuns: 100 });
    });

    /**
     * Property: Cache invalidation should completely remove entries
     * Validates: Requirement 7.3
     */
    it('should completely remove entries after invalidation', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.anything(),
        (key, value) => {
          const testCache = new CacheService();

          testCache.set(key, value);
          expect(testCache.has(key)).toBe(true);

          testCache.invalidate(key);
          expect(testCache.has(key)).toBe(false);
          expect(testCache.get(key)).toBeUndefined();

          testCache.clear();
        }
      ), { numRuns: 100 });
    });

    /**
     * Property: has() should be consistent with get()
     */
    it('should have has() consistent with get()', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string(),
        (key, value) => {
          const testCache = new CacheService();

          // Before setting
          expect(testCache.has(key)).toBe(false);
          expect(testCache.get(key)).toBeUndefined();

          // After setting
          testCache.set(key, value);
          expect(testCache.has(key)).toBe(true);
          expect(testCache.get(key)).toBeDefined();

          // After invalidation
          testCache.invalidate(key);
          expect(testCache.has(key)).toBe(false);
          expect(testCache.get(key)).toBeUndefined();

          testCache.clear();
        }
      ), { numRuns: 50 });
    });

    /**
     * Property: clear() should remove all entries
     */
    it('should remove all entries after clear()', () => {
      fc.assert(fc.property(
        fc.array(
          fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
          { minLength: 1, maxLength: 20 }
        ),
        (entries) => {
          const testCache = new CacheService();

          // Set all entries
          for (const [key, value] of entries) {
            testCache.set(key, value);
          }

          // Clear all
          testCache.clear();

          // Verify all are removed
          for (const [key] of entries) {
            expect(testCache.has(key)).toBe(false);
          }

          testCache.clear();
        }
      ), { numRuns: 50 });
    });
  });
});
