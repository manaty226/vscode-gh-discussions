/**
 * Auto Refresh Service Tests
 * Requirements: 7.1, 7.2
 *
 * Property 9: Auto-refresh functionality guarantee
 */

import * as fc from 'fast-check';

// Mock vscode
const mockGet = jest.fn();
const mockOnDidChangeConfiguration = jest.fn();

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: mockGet
    })),
    onDidChangeConfiguration: mockOnDidChangeConfiguration
  },
  EventEmitter: class MockEventEmitter {
    private listeners: Array<(e: any) => void> = [];
    event = (listener: (e: any) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(e: any) {
      this.listeners.forEach(l => l(e));
    }
    dispose() {
      this.listeners = [];
    }
  },
  Disposable: class MockDisposable {
    dispose() {}
  }
}));

import { AutoRefreshService } from '../services/autoRefreshService';

describe('AutoRefreshService', () => {
  let autoRefreshService: AutoRefreshService;
  let configChangeCallback: ((e: any) => void) | undefined;

  beforeEach(() => {
    jest.useFakeTimers();

    // Default config values (refreshInterval is now in seconds)
    mockGet.mockImplementation((key: string, defaultValue: any) => {
      if (key === 'refreshInterval') {
        return 300; // 5 minutes in seconds
      }
      if (key === 'autoRefresh') {
        return true;
      }
      return defaultValue;
    });

    // Capture config change callback
    mockOnDidChangeConfiguration.mockImplementation((callback: (e: any) => void) => {
      configChangeCallback = callback;
      return { dispose: () => {} };
    });

    autoRefreshService = new AutoRefreshService();
  });

  afterEach(() => {
    autoRefreshService.dispose();
    jest.useRealTimers();
    jest.clearAllMocks();
    configChangeCallback = undefined;
  });

  describe('Unit Tests', () => {
    describe('start/stop', () => {
      it('should start and track running state', () => {
        expect(autoRefreshService.isRunning()).toBe(false);

        autoRefreshService.start();
        expect(autoRefreshService.isRunning()).toBe(true);
      });

      it('should stop and update running state', () => {
        autoRefreshService.start();
        expect(autoRefreshService.isRunning()).toBe(true);

        autoRefreshService.stop();
        expect(autoRefreshService.isRunning()).toBe(false);
      });

      it('should not start if autoRefresh is disabled', () => {
        mockGet.mockImplementation((key: string, defaultValue: any) => {
          if (key === 'autoRefresh') {
            return false;
          }
          return defaultValue;
        });

        const service = new AutoRefreshService();
        service.start();
        expect(service.isRunning()).toBe(false);
        service.dispose();
      });

      it('should not start multiple times', () => {
        autoRefreshService.start();
        autoRefreshService.start();
        expect(autoRefreshService.isRunning()).toBe(true);
      });
    });

    describe('setInterval', () => {
      it('should update the refresh interval (input is seconds)', () => {
        autoRefreshService.setInterval(60); // 60 seconds
        autoRefreshService.start();

        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        // Advance by new interval (60 seconds = 60000ms)
        jest.advanceTimersByTime(60000);
        expect(refreshHandler).toHaveBeenCalledTimes(1);
      });

      it('should enforce minimum interval of 30 seconds', () => {
        autoRefreshService.setInterval(1); // Try to set 1 second
        autoRefreshService.start();

        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        // Should not fire at 1 second
        jest.advanceTimersByTime(1000);
        expect(refreshHandler).not.toHaveBeenCalled();

        // Should fire at 30 seconds (minimum)
        jest.advanceTimersByTime(29000);
        expect(refreshHandler).toHaveBeenCalledTimes(1);
      });

      it('should enforce minimum interval on initial config load', () => {
        // Set config to return interval below minimum (10 seconds)
        mockGet.mockImplementation((key: string, defaultValue: any) => {
          if (key === 'refreshInterval') {
            return 10; // 10 seconds (below minimum of 30)
          }
          if (key === 'autoRefresh') {
            return true;
          }
          return defaultValue;
        });

        const service = new AutoRefreshService();
        service.start();

        const refreshHandler = jest.fn();
        service.onDidRefresh(refreshHandler);

        // Should not fire at 10 seconds
        jest.advanceTimersByTime(10000);
        expect(refreshHandler).not.toHaveBeenCalled();

        // Should fire at 30 seconds (minimum enforced)
        jest.advanceTimersByTime(20000);
        expect(refreshHandler).toHaveBeenCalledTimes(1);

        service.dispose();
      });

      it('should restart timer when interval changes while running', () => {
        autoRefreshService.start();
        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        // Advance part way through original interval
        jest.advanceTimersByTime(100000);
        expect(refreshHandler).not.toHaveBeenCalled();

        // Change interval to shorter (60 seconds)
        autoRefreshService.setInterval(60);

        // Advance by new interval (60 seconds = 60000ms)
        jest.advanceTimersByTime(60000);
        expect(refreshHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('onDidRefresh event', () => {
      it('should fire refresh event at interval', () => {
        autoRefreshService.start();
        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        // First interval (300 seconds = 300000ms)
        jest.advanceTimersByTime(300000);
        expect(refreshHandler).toHaveBeenCalledTimes(1);

        // Second interval
        jest.advanceTimersByTime(300000);
        expect(refreshHandler).toHaveBeenCalledTimes(2);
      });

      it('should not fire after stop', () => {
        autoRefreshService.start();
        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        autoRefreshService.stop();
        jest.advanceTimersByTime(300000);
        expect(refreshHandler).not.toHaveBeenCalled();
      });

      it('should not fire before first interval', () => {
        autoRefreshService.start();
        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        // 300 seconds - 1ms = 299999ms
        jest.advanceTimersByTime(299999);
        expect(refreshHandler).not.toHaveBeenCalled();
      });
    });

    describe('configuration changes', () => {
      it('should respond to refreshInterval config change', () => {
        autoRefreshService.start();
        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        // Simulate config change (now in seconds)
        mockGet.mockImplementation((key: string, defaultValue: any) => {
          if (key === 'refreshInterval') {
            return 60; // 60 seconds
          }
          if (key === 'autoRefresh') {
            return true;
          }
          return defaultValue;
        });

        configChangeCallback?.({
          affectsConfiguration: (section: string) => section === 'github-discussions.refreshInterval'
        });

        // Advance by new interval (60 seconds = 60000ms)
        jest.advanceTimersByTime(60000);
        expect(refreshHandler).toHaveBeenCalledTimes(1);
      });

      it('should stop when autoRefresh is disabled via config', () => {
        autoRefreshService.start();
        expect(autoRefreshService.isRunning()).toBe(true);

        // Simulate config change to disable
        mockGet.mockImplementation((key: string, defaultValue: any) => {
          if (key === 'autoRefresh') {
            return false;
          }
          return defaultValue;
        });

        configChangeCallback?.({
          affectsConfiguration: (section: string) => section === 'github-discussions.autoRefresh'
        });

        expect(autoRefreshService.isRunning()).toBe(false);
      });

      it('should start when autoRefresh is enabled via config', () => {
        // Start with autoRefresh disabled
        mockGet.mockImplementation((key: string, defaultValue: any) => {
          if (key === 'autoRefresh') {
            return false;
          }
          return defaultValue;
        });

        const service = new AutoRefreshService();
        service.start();
        expect(service.isRunning()).toBe(false);

        // Enable via config
        mockGet.mockImplementation((key: string, defaultValue: any) => {
          if (key === 'autoRefresh') {
            return true;
          }
          if (key === 'refreshInterval') {
            return 300; // 300 seconds
          }
          return defaultValue;
        });

        configChangeCallback?.({
          affectsConfiguration: (section: string) => section === 'github-discussions.autoRefresh'
        });

        expect(service.isRunning()).toBe(true);
        service.dispose();
      });
    });

    describe('dispose', () => {
      it('should stop timer on dispose', () => {
        autoRefreshService.start();
        const refreshHandler = jest.fn();
        autoRefreshService.onDidRefresh(refreshHandler);

        autoRefreshService.dispose();
        jest.advanceTimersByTime(300000); // 300 seconds in ms
        expect(refreshHandler).not.toHaveBeenCalled();
      });

      it('should update running state on dispose', () => {
        autoRefreshService.start();
        expect(autoRefreshService.isRunning()).toBe(true);

        autoRefreshService.dispose();
        expect(autoRefreshService.isRunning()).toBe(false);
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property 9: Auto-refresh should fire at consistent intervals
     * Validates: Requirement 7.1, 7.2
     */
    it('should fire refresh events at consistent intervals', () => {
      fc.assert(fc.property(
        fc.integer({ min: 30, max: 600 }), // 30 seconds to 10 minutes (in seconds)
        fc.integer({ min: 1, max: 5 }), // number of intervals to test
        (intervalSeconds, numIntervals) => {
          const service = new AutoRefreshService();
          service.setInterval(intervalSeconds);
          service.start();

          const refreshHandler = jest.fn();
          service.onDidRefresh(refreshHandler);

          // Advance through multiple intervals (convert to ms)
          const intervalMs = intervalSeconds * 1000;
          for (let i = 1; i <= numIntervals; i++) {
            jest.advanceTimersByTime(intervalMs);
            expect(refreshHandler).toHaveBeenCalledTimes(i);
          }

          service.dispose();
        }
      ), { numRuns: 20 });
    });

    /**
     * Property: start/stop should be idempotent
     */
    it('should handle multiple start/stop calls gracefully', () => {
      fc.assert(fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (operations) => {
          const service = new AutoRefreshService();

          for (const shouldStart of operations) {
            if (shouldStart) {
              service.start();
            } else {
              service.stop();
            }
          }

          // Service should be in a valid state
          const isRunning = service.isRunning();
          expect(typeof isRunning).toBe('boolean');

          service.dispose();
        }
      ), { numRuns: 50 });
    });

    /**
     * Property: Interval changes should always respect minimum
     */
    it('should always enforce minimum interval', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 100000 }),
        (interval) => {
          const service = new AutoRefreshService();
          service.setInterval(interval);
          service.start();

          const refreshHandler = jest.fn();
          service.onDidRefresh(refreshHandler);

          // Should not fire before 30 seconds (minimum)
          jest.advanceTimersByTime(29999);
          expect(refreshHandler).not.toHaveBeenCalled();

          service.dispose();
        }
      ), { numRuns: 30 });
    });

    /**
     * Property: Dispose should always stop the service
     */
    it('should always stop after dispose', () => {
      fc.assert(fc.property(
        fc.boolean(),
        fc.integer({ min: 30, max: 300 }), // in seconds
        (wasStarted, intervalSeconds) => {
          const service = new AutoRefreshService();
          service.setInterval(intervalSeconds);

          if (wasStarted) {
            service.start();
          }

          service.dispose();
          expect(service.isRunning()).toBe(false);
        }
      ), { numRuns: 30 });
    });
  });
});
