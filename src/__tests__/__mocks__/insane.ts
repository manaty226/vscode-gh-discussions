/**
 * Mock for insane
 * Used in tests to avoid module issues
 */

const insane = (html: string, _options?: unknown): string => {
  // Simple mock that removes script tags and dangerous attributes
  // This is for testing purposes only - the real insane is used in production
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
};

export default insane;
