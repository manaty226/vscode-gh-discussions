/**
 * Utility functions for GitHub Discussions extension
 */

import * as vscode from 'vscode';
import insane from 'insane';

// Re-export unified utilities
export { sanitizeFileName } from './fileNameUtils';
export { parseDateTime, formatDate } from './dateTimeUtils';
export { extractErrorMessage } from './errorUtils';

/**
 * Parse GitHub Discussion URI
 */
export function parseDiscussionUri(uri: vscode.Uri): {
  owner: string;
  repo: string;
  discussionNumber?: number;
  fileName?: string;
} | null {
  // ghd://owner/repo/number/filename
  const pathParts = uri.path.split('/').filter(part => part.length > 0);

  if (pathParts.length < 2) {
    return null;
  }

  const [owner, repo, discussionNumber, fileName] = pathParts;

  return {
    owner,
    repo,
    discussionNumber: discussionNumber ? parseInt(discussionNumber, 10) : undefined,
    fileName
  };
}

/**
 * Create GitHub Discussion URI
 */
export function createDiscussionUri(
  owner: string,
  repo: string,
  discussionNumber?: number,
  fileName?: string
): vscode.Uri {
  let path = `/${owner}/${repo}`;

  if (discussionNumber !== undefined) {
    path += `/${discussionNumber}`;

    if (fileName) {
      path += `/${fileName}`;
    }
  }

  return vscode.Uri.parse(`ghd:${path}`);
}

/**
 * Sanitize HTML content using insane for defense-in-depth
 * This is the same library used by VSCode core for markdown sanitization.
 * Even though GitHub sanitizes bodyHTML server-side, we add client-side sanitization as an additional security layer
 */
export function sanitizeHtml(html: string): string {
  return insane(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'a', 'img',
      'code', 'pre', 'blockquote',
      'strong', 'em', 'b', 'i', 'u', 'del', 'ins',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span',
      'details', 'summary',
      'sup', 'sub',
      'section' // GitHub wraps mermaid diagrams in <section data-type="mermaid">
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'id', 'data-type', 'data-json'], // data-type and data-json are used by GitHub for mermaid diagrams
      pre: ['lang'], // GitHub uses <pre lang="mermaid"> for mermaid code blocks
      code: ['class'], // GitHub uses <code class="language-mermaid"> for syntax highlighting
      td: ['colspan', 'rowspan', 'align', 'valign'],
      th: ['colspan', 'rowspan', 'align', 'valign']
    },
    allowedSchemes: ['https'],
    filter: (token) => {
      // Block dangerous event handlers
      if (token.attrs) {
        const dangerousAttrs = ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'];
        for (const attr of dangerousAttrs) {
          delete token.attrs[attr];
        }
      }
      return true;
    }
  });
}

