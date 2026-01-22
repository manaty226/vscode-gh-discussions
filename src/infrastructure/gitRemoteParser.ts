/**
 * Git Remote Parser - Extracts repository information from git remotes
 * Requirements: 9.5 - Infrastructure layer extraction
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';

export interface ParsedRemote {
  owner: string;
  name: string;
}

export interface IGitRemoteParser {
  /**
   * Parse git remote to extract owner and repository name
   * @throws Error if no GitHub remote is found or not in a git repository
   */
  parseGitRemote(): ParsedRemote;
}

export class GitRemoteParser implements IGitRemoteParser {
  /**
   * Parse git remote to extract owner and repository name
   */
  parseGitRemote(): ParsedRemote {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open');
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    try {
      const remoteOutput = execSync('git remote -v', {
        encoding: 'utf-8',
        cwd: workspacePath
      });

      const lines = remoteOutput.split('\n');

      for (const line of lines) {
        // Match SSH format: git@github.com:owner/repo.git or git@github.com:owner/repo
        // The repo name can contain dots, so we match until .git (fetch/push) or whitespace
        const sshMatch = line.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?\s+\(/);
        if (sshMatch) {
          return { owner: sshMatch[1], name: sshMatch[2] };
        }

        // Match HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
        const httpsMatch = line.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\s+\(/);
        if (httpsMatch) {
          return { owner: httpsMatch[1], name: httpsMatch[2] };
        }
      }

      throw new Error('GitHub remote not found');
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub remote not found') {
        throw error;
      }
      throw new Error(`Failed to detect git repository: ${error}`);
    }
  }
}
