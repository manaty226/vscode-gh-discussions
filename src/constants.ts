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
