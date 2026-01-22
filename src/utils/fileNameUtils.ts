/**
 * File name utility functions
 * Requirements: 9.1 - Unified utility functions
 */

import { FILE_NAME_MAX_LENGTH } from '../constants';

/**
 * Sanitize title for use as filename
 * Removes invalid characters and normalizes whitespace
 */
export function sanitizeFileName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, FILE_NAME_MAX_LENGTH);
}
