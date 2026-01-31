/**
 * Constants used across the extension
 * Requirements: 9.1 - Centralized constants
 */

/** Maximum length for sanitized file names */
export const FILE_NAME_MAX_LENGTH = 100;

/** Default cache TTL in milliseconds (5 minutes) */
export const CACHE_DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Auto-refresh interval in milliseconds (5 minutes) */
export const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum auto-refresh interval in milliseconds (30 seconds) */
export const MIN_REFRESH_INTERVAL_MS = 30 * 1000;

/** Default pagination size for GraphQL queries */
export const GRAPHQL_PAGINATION_SIZE = 20;

/** Cache TTL for mentionable users in milliseconds (10 minutes) */
export const MENTIONABLE_USERS_CACHE_TTL_MS = 10 * 60 * 1000;

/** Cache key prefix for mentionable users */
export const CACHE_KEY_MENTIONABLE_USERS = 'mentionable-users';

/** Cache key prefix for discussion participants */
export const CACHE_KEY_DISCUSSION_PARTICIPANTS = 'discussion-participants';

/** Storage key for unread state (Requirement 19.5) */
export const STORAGE_KEY_UNREAD_STATE = 'unread-state';

/** Maximum number of unread discussion IDs to track (Requirement 19.6) */
export const UNREAD_MAX_SIZE = 20;
