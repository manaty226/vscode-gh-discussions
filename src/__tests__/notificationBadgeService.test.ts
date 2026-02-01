/**
 * Notification Badge Service Tests
 * Requirements: 19.1-19.10
 *
 * Tests for notification badge functionality on Activity Bar icon
 */

import { NotificationBadgeService } from '../services/notificationBadgeService';
import { STORAGE_KEY_UNREAD_STATE, UNREAD_MAX_SIZE } from '../constants';
import { UnreadState, DiscussionSummary, User, DiscussionCategory, RecentComment } from '../models';
import { IGitHubService, IAuthenticationService, IStorageService } from '../services/interfaces';

jest.mock('vscode', () => {
  // Mock EventEmitter for vscode
  class MockEventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];

    event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };

    fire(data: T) {
      this.listeners.forEach(l => l(data));
    }

    dispose() {
      this.listeners = [];
    }
  }

  return {
    TreeView: class {},
    Disposable: class {
      dispose() {}
    },
    EventEmitter: MockEventEmitter
  };
});

// Mock vscode
const mockBadgeSetter = jest.fn();
const mockTreeView = {
  get badge() {
    return this._badge;
  },
  set badge(value: { value: number; tooltip: string } | undefined) {
    this._badge = value;
    mockBadgeSetter(value);
  },
  _badge: undefined as { value: number; tooltip: string } | undefined
};

describe('NotificationBadgeService', () => {
  let service: NotificationBadgeService;
  let mockGithubService: jest.Mocked<IGitHubService>;
  let mockAuthService: jest.Mocked<IAuthenticationService>;
  let mockStorageService: jest.Mocked<IStorageService>;

  // Helper to create mock user
  const createMockUser = (login: string): User => ({
    id: `user-${login}`,
    login,
    name: login,
    avatarUrl: `https://example.com/${login}.png`
  });

  // Helper to create mock category
  const createMockCategory = (): DiscussionCategory => ({
    id: 'cat-1',
    name: 'General',
    description: 'General discussions',
    emoji: '💬',
    isAnswerable: false
  });

  // Helper to create mock discussion summary
  const createMockDiscussionSummary = (
    id: string,
    authorLogin: string,
    createdAt: Date,
    updatedAt: Date,
    recentComments?: RecentComment[]
  ): DiscussionSummary => ({
    id,
    number: parseInt(id.replace('disc-', '')),
    title: `Discussion ${id}`,
    url: `https://github.com/owner/repo/discussions/${id}`,
    author: createMockUser(authorLogin),
    category: createMockCategory(),
    createdAt,
    updatedAt,
    isAnswered: false,
    commentsCount: recentComments?.length ?? 0,
    recentComments
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTreeView._badge = undefined;

    // Create mock services
    mockGithubService = {
      getRepositoryInfo: jest.fn(),
      getDiscussionSummaries: jest.fn(),
      getDiscussion: jest.fn(),
      getDiscussionComments: jest.fn(),
      createDiscussion: jest.fn(),
      updateDiscussion: jest.fn(),
      getDiscussionCategories: jest.fn(),
      addComment: jest.fn(),
      addReply: jest.fn(),
      updateComment: jest.fn(),
      deleteComment: jest.fn(),
      getMentionableUsers: jest.fn(),
      searchOrganizationMembers: jest.fn()
    };

    mockAuthService = {
      getSession: jest.fn(),
      getSessionSilent: jest.fn(),
      isAuthenticated: jest.fn(),
      getCurrentUser: jest.fn(),
      onDidChangeAuthenticationState: jest.fn()
    } as any;

    mockStorageService = {
      storeToken: jest.fn(),
      getToken: jest.fn(),
      clearToken: jest.fn(),
      storeSettings: jest.fn(),
      getSettings: jest.fn(),
      storeData: jest.fn(),
      getData: jest.fn(),
      clearData: jest.fn()
    };

    service = new NotificationBadgeService(
      mockTreeView as any,
      mockGithubService,
      mockAuthService,
      mockStorageService
    );
  });

  afterEach(() => {
    service.dispose();
  });

  describe('updateBadge', () => {
    it('should hide badge when user is not authenticated', async () => {
      // Requirement 19.9: Hide badge when not authenticated
      mockAuthService.getCurrentUser.mockResolvedValue(undefined);

      await service.updateBadge();

      expect(mockBadgeSetter).toHaveBeenCalledWith(undefined);
    });

    it('should initialize state and hide badge on first run (Requirement 19.7)', async () => {
      // First run - no existing state
      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [],
        pageInfo: { hasNextPage: false, endCursor: null }
      });
      mockStorageService.getData.mockResolvedValue(undefined);

      await service.updateBadge();

      // Should initialize state
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: [],
          lastCheckedAt: expect.any(String)
        })
      );
      // Should hide badge on first run
      expect(mockBadgeSetter).toHaveBeenCalledWith(undefined);
    });

    it('should detect new comments on user discussions (Requirement 19.3)', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // User's discussion with new comment from someone else
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ]),
          // Other user's discussion - should be ignored
          createMockDiscussionSummary('disc-2', 'otheruser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      // Existing state with lastCheckedAt 2 hours ago
      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should show badge with 1 unread discussion
      expect(mockBadgeSetter).toHaveBeenCalledWith({
        value: 1,
        tooltip: '1件のDiscussionに新着コメントがあります'
      });

      // Should save state with disc-1 as unread
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: ['disc-1']
        })
      );
    });

    it('should not mark discussion as new if updatedAt equals createdAt', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // User's discussion with no comments (updatedAt === createdAt)
          createMockDiscussionSummary('disc-1', 'testuser', oneHourAgo, oneHourAgo)
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should not add to unread list
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: []
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith(undefined);
    });

    it('should enforce max size limit (Requirement 19.6)', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));

      // Create 25 discussions that should all be detected as new
      const discussions: DiscussionSummary[] = [];
      for (let i = 1; i <= 25; i++) {
        discussions.push(createMockDiscussionSummary(`disc-${i}`, 'testuser', threeHoursAgo, oneHourAgo, [
          { createdAt: oneHourAgo, viewerDidAuthor: false }
        ]));
      }

      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions,
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should only keep UNREAD_MAX_SIZE (20) items
      const storeCall = mockStorageService.storeData.mock.calls[0];
      const savedState = storeCall[1] as UnreadState;
      expect(savedState.unreadIds.length).toBe(UNREAD_MAX_SIZE);
    });

    it('should preserve existing unread IDs', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // Existing unread discussion (no new updates)
          createMockDiscussionSummary('disc-1', 'testuser', fourHoursAgo, threeHoursAgo),
          // New discussion with new comment from someone else
          createMockDiscussionSummary('disc-2', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: ['disc-1'], // Already unread
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should keep disc-1 (existing) and add disc-2 (new)
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: expect.arrayContaining(['disc-1', 'disc-2'])
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith({
        value: 2,
        tooltip: '2件のDiscussionに新着コメントがあります'
      });
    });

    it('should remove deleted discussions from unread list', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [], // No discussions (all deleted)
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: ['disc-1', 'disc-2'], // These no longer exist
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should remove deleted discussions from unread list
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: []
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith(undefined);
    });

    it('should handle API errors gracefully', async () => {
      mockAuthService.getCurrentUser.mockRejectedValue(new Error('API Error'));

      // Should not throw
      await expect(service.updateBadge()).resolves.not.toThrow();
    });

    it('should filter out updates caused by own comments (Requirement 20.11)', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // User's discussion with only own comment since lastCheckedAt (should be filtered out)
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: true }
          ]),
          // User's discussion with someone else's comment since lastCheckedAt (should be marked unread)
          createMockDiscussionSummary('disc-2', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should only mark disc-2 as unread (disc-1 was own comment)
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: ['disc-2']
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith({
        value: 1,
        tooltip: '1件のDiscussionに新着コメントがあります'
      });
    });

    it('should treat undefined recentComments as not own comment', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // User's discussion with undefined recentComments (no comment yet or API didn't return)
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, oneHourAgo, undefined)
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should mark as unread since we can't confirm it's own comment
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: ['disc-1']
        })
      );
    });

    it('should not mark as unread when only own comments were added (Requirement 20.11)', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // All user's discussions with own comments only since lastCheckedAt
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: true }
          ]),
          createMockDiscussionSummary('disc-2', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: true }
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // Should have no unread discussions
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: []
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith(undefined);
    });

    it('should detect unread when latest is own comment but earlier has other comment (Requirement 20.11)', async () => {
      // Edge case: 最新1件が自分のコメント、2件目が他人のコメント
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // 最新は自分のコメントだが、その前に他人のコメントがある（両方lastCheckedAt後）
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, thirtyMinutesAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false },      // 他人のコメント
            { createdAt: thirtyMinutesAgo, viewerDidAuthor: true }  // 自分のコメント（最新）
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // 他人のコメントがあるので未読として扱う
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: ['disc-1']
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith({
        value: 1,
        tooltip: '1件のDiscussionに新着コメントがあります'
      });
    });

    it('should ignore comments older than lastCheckedAt (Requirement 20.11)', async () => {
      // コメントがlastCheckedAtより前の場合は無視する
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          // updatedAtはoneHourAgoだが、コメントはlastCheckedAt（twoHoursAgo）より前
          createMockDiscussionSummary('disc-1', 'testuser', fourHoursAgo, oneHourAgo, [
            { createdAt: threeHoursAgo, viewerDidAuthor: false }  // lastCheckedAtより前
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      // コメントがlastCheckedAtより前なので、recentCommentsはあるがfilter後は0件
      // この場合、サービスは「recentCommentsがない」扱いになり未読にする（安全デフォルト）
      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: ['disc-1']
        })
      );
    });
  });

  describe('markAsRead', () => {
    it('should remove discussion from unread list (Requirement 19.4)', async () => {
      const existingState: UnreadState = {
        unreadIds: ['disc-1', 'disc-2', 'disc-3'],
        lastCheckedAt: new Date().toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.markAsRead('disc-2');

      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: ['disc-1', 'disc-3']
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith({
        value: 2,
        tooltip: '2件のDiscussionに新着コメントがあります'
      });
    });

    it('should hide badge when all discussions are read (Requirement 19.9)', async () => {
      const existingState: UnreadState = {
        unreadIds: ['disc-1'],
        lastCheckedAt: new Date().toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.markAsRead('disc-1');

      expect(mockStorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEY_UNREAD_STATE,
        expect.objectContaining({
          unreadIds: []
        })
      );
      expect(mockBadgeSetter).toHaveBeenCalledWith(undefined);
    });

    it('should do nothing if discussion is not in unread list', async () => {
      const existingState: UnreadState = {
        unreadIds: ['disc-1', 'disc-2'],
        lastCheckedAt: new Date().toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.markAsRead('disc-999');

      // Should not call storeData since nothing changed
      expect(mockStorageService.storeData).not.toHaveBeenCalled();
    });

    it('should do nothing if state is not initialized', async () => {
      mockStorageService.getData.mockResolvedValue(undefined);

      await service.markAsRead('disc-1');

      expect(mockStorageService.storeData).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      mockStorageService.getData.mockRejectedValue(new Error('Storage Error'));

      // Should not throw
      await expect(service.markAsRead('disc-1')).resolves.not.toThrow();
    });
  });

  describe('getUnreadIds', () => {
    it('should return empty array initially (Requirement 20.5)', () => {
      const unreadIds = service.getUnreadIds();
      expect(unreadIds).toEqual([]);
    });

    it('should return cached unread IDs after updateBadge (Requirement 20.5)', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ]),
          createMockDiscussionSummary('disc-2', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      const unreadIds = service.getUnreadIds();
      expect(unreadIds).toContain('disc-1');
      expect(unreadIds).toContain('disc-2');
    });
  });

  describe('onDidChangeUnreadState', () => {
    it('should fire event when unread state changes (Requirement 20.5)', async () => {
      const listener = jest.fn();
      service.onDidChangeUnreadState(listener);

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockAuthService.getCurrentUser.mockResolvedValue(createMockUser('testuser'));
      mockGithubService.getDiscussionSummaries.mockResolvedValue({
        discussions: [
          createMockDiscussionSummary('disc-1', 'testuser', threeHoursAgo, oneHourAgo, [
            { createdAt: oneHourAgo, viewerDidAuthor: false }
          ])
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      });

      const existingState: UnreadState = {
        unreadIds: [],
        lastCheckedAt: twoHoursAgo.toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.updateBadge();

      expect(listener).toHaveBeenCalled();
    });

    it('should fire event when marking as read (Requirement 20.5)', async () => {
      const listener = jest.fn();
      service.onDidChangeUnreadState(listener);

      const existingState: UnreadState = {
        unreadIds: ['disc-1', 'disc-2'],
        lastCheckedAt: new Date().toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      await service.markAsRead('disc-1');

      expect(listener).toHaveBeenCalled();
    });

    it('should not fire event when no change occurs', async () => {
      const listener = jest.fn();
      service.onDidChangeUnreadState(listener);

      const existingState: UnreadState = {
        unreadIds: ['disc-1'],
        lastCheckedAt: new Date().toISOString()
      };
      mockStorageService.getData.mockResolvedValue(existingState);

      // Try to mark as read a discussion that's not in the list
      await service.markAsRead('disc-999');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      service.dispose();
      // No error should be thrown
    });
  });
});
