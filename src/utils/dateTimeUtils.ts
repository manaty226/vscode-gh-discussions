/**
 * Date and time utility functions
 * Requirements: 9.1 - Unified utility functions
 * Requirements: 10.5 - Relative timestamp display
 */

/**
 * Parse ISO date string to Date object
 * Used for consistent date parsing across the codebase
 */
export function parseDateTime(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Format date for display with relative time support
 */
export function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format date as detailed relative time (Japanese)
 * e.g., "たった今", "3分前", "2時間前", "昨日", "1月1日", "2023年1月1日"
 * Requirements: 10.5 - Relative timestamp display
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'たった今';
  }

  // Less than 1 hour
  if (diffHours < 1) {
    return `${diffMinutes}分前`;
  }

  // Less than 1 day
  if (diffDays < 1) {
    return `${diffHours}時間前`;
  }

  // Yesterday
  if (diffDays === 1) {
    return '昨日';
  }

  // Less than 7 days
  if (diffDays < 7) {
    return `${diffDays}日前`;
  }

  // Check if same year
  const dateYear = date.getFullYear();
  const nowYear = now.getFullYear();

  if (dateYear === nowYear) {
    // Same year - show month and day
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  } else {
    // Different year - show full date
    return `${dateYear}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
}
