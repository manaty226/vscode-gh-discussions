/**
 * Git Remote Parser Tests
 * Requirements: 9.5 - Infrastructure layer extraction
 */

import * as fc from 'fast-check';
import { GitRemoteParser } from '../infrastructure/gitRemoteParser';

// Mock child_process
jest.mock('child_process');

// Get access to mockVscode for workspace manipulation
const mockVscode = (global as any).mockVscode;

describe('GitRemoteParser', () => {
  let parser: GitRemoteParser;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup workspace folders mock
    mockVscode.workspace.workspaceFolders = [
      {
        uri: { fsPath: '/test/workspace' },
        name: 'workspace',
        index: 0
      }
    ];

    parser = new GitRemoteParser();
  });

  describe('parseGitRemote', () => {
    it('should parse SSH remote URL', () => {
      const { execSync } = require('child_process');
      execSync.mockReturnValue('origin\tgit@github.com:owner/repo.git (fetch)\n');

      const result = parser.parseGitRemote();

      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should parse HTTPS remote URL', () => {
      const { execSync } = require('child_process');
      execSync.mockReturnValue('origin\thttps://github.com/owner/repo.git (fetch)\n');

      const result = parser.parseGitRemote();

      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should throw error when no workspace folder is open', () => {
      mockVscode.workspace.workspaceFolders = undefined;

      expect(() => parser.parseGitRemote()).toThrow('No workspace folder open');
    });

    it('should throw error when not in a git repository', () => {
      const { execSync } = require('child_process');
      execSync.mockImplementation(() => {
        throw new Error('fatal: not a git repository');
      });

      expect(() => parser.parseGitRemote()).toThrow(/Failed to detect git repository/);
    });

    it('should throw error when no GitHub remote is found', () => {
      const { execSync } = require('child_process');
      execSync.mockReturnValue('origin\tgit@gitlab.com:owner/repo.git (fetch)\n');

      expect(() => parser.parseGitRemote()).toThrow('GitHub remote not found');
    });
  });

  describe('Property-Based Tests', () => {
    it('should parse valid GitHub repository names from SSH URLs', () => {
      fc.assert(fc.property(
        fc.record({
          owner: fc.string({ minLength: 1, maxLength: 39 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s) && !s.startsWith('-') && !s.endsWith('-')),
          repo: fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s))
        }),
        ({ owner, repo }) => {
          const { execSync } = require('child_process');
          execSync.mockReturnValue(`origin\tgit@github.com:${owner}/${repo}.git (fetch)\n`);

          const testParser = new GitRemoteParser();
          const result = testParser.parseGitRemote();

          expect(result.owner).toBe(owner);
          expect(result.name).toBe(repo);
        }
      ), { numRuns: 50 });
    });

    it('should parse valid GitHub repository names from HTTPS URLs', () => {
      fc.assert(fc.property(
        fc.record({
          owner: fc.string({ minLength: 1, maxLength: 39 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s) && !s.startsWith('-') && !s.endsWith('-')),
          repo: fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s))
        }),
        ({ owner, repo }) => {
          const { execSync } = require('child_process');
          execSync.mockReturnValue(`origin\thttps://github.com/${owner}/${repo}.git (fetch)\n`);

          const testParser = new GitRemoteParser();
          const result = testParser.parseGitRemote();

          expect(result.owner).toBe(owner);
          expect(result.name).toBe(repo);
        }
      ), { numRuns: 50 });
    });
  });
});
