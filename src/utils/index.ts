/**
 * Utility functions for GitHub Discussions extension
 */

import * as vscode from 'vscode';
import insane from 'insane';
import { RepositoryInfo } from '../models';

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
 * Get current repository information from workspace
 */
export async function getCurrentRepository(): Promise<RepositoryInfo | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  try {
    // Try to get git remote origin URL
    const { execSync } = require('child_process');
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd: rootPath,
      encoding: 'utf8'
    }).trim();

    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);

    if (match) {
      const [, owner, name] = match;
      return {
        id: '', // Note: This is a placeholder. Use GitHubService.getRepositoryInfo() for full repository info including ID.
        owner,
        name,
        fullName: `${owner}/${name}`,
        hasDiscussionsEnabled: true // We'll verify this via API later
      };
    }
  } catch (error) {
    // Not a git repository or no remote origin
  }

  return null;
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

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(lastError!.message || 'Operation failed after retries');
}

/**
 * Validate GitHub token format
 */
export function isValidGitHubToken(token: string): boolean {
  // GitHub personal access tokens start with 'ghp_' and are 40 characters long
  // GitHub app tokens start with 'ghs_' and are 40 characters long
  return /^gh[ps]_[A-Za-z0-9]{36}$/.test(token);
}
