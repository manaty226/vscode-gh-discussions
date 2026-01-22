/**
 * GitHub Discussions Extension Entry Point
 */

import * as vscode from 'vscode';
import { AuthenticationService, StorageService, GitHubService, AutoRefreshService } from './services';
import { DiscussionsProvider } from './providers/discussionsProvider';
import { DiscussionFileSystemProvider } from './providers/discussionFileSystemProvider';
import { DiscussionWebviewProvider } from './providers/webviewProvider';
import type { DiscussionSummary } from './models';
import { sanitizeFileName } from './utils/fileNameUtils';

let extensionContext: vscode.ExtensionContext;
let authenticationService: AuthenticationService;
let autoRefreshService: AutoRefreshService;
let _storageService: StorageService;
let githubService: GitHubService;
let discussionsProvider: DiscussionsProvider;
let fileSystemProvider: DiscussionFileSystemProvider;
let webviewProvider: DiscussionWebviewProvider;

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  try {
    // Set initial context values
    await vscode.commands.executeCommand('setContext', 'github-discussions:enabled', true);
    await vscode.commands.executeCommand('setContext', 'github-discussions:authenticated', false);
    await vscode.commands.executeCommand('setContext', 'github-discussions:noRepo', false);

    // Initialize services
    await initializeServices(context);

    // Register providers (must be after services are initialized)
    registerProviders(context);

    // Register commands (must be after providers are initialized)
    registerCommands(context);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to activate GitHub Discussions extension: ${error}`);
  }
}

export function deactivate() {
  // Cleanup services
  if (autoRefreshService) {
    autoRefreshService.dispose();
  }
  if (authenticationService) {
    authenticationService.dispose();
  }
  if (webviewProvider) {
    webviewProvider.dispose();
  }
}

async function initializeServices(context: vscode.ExtensionContext): Promise<void> {
  // Initialize storage service
  _storageService = new StorageService(context);

  // Initialize authentication service
  authenticationService = new AuthenticationService();

  // Initialize GitHub service
  githubService = new GitHubService(authenticationService);

  // Initialize auto-refresh service
  autoRefreshService = new AutoRefreshService();

  // Listen for auto-refresh events
  autoRefreshService.onDidRefresh(() => {
    // Invalidate file system cache to ensure fresh data
    fileSystemProvider?.invalidateCache();
    fileSystemProvider?.notifyDiscussionsUpdated();
    // Refresh tree view
    discussionsProvider?.refresh();
  });

  // Listen for authentication state changes
  authenticationService.onDidChangeAuthenticationState(async (state) => {
    await vscode.commands.executeCommand('setContext', 'github-discussions:authenticated', state.isAuthenticated);

    if (state.isAuthenticated && state.user) {
      // Refresh discussions when authenticated
      discussionsProvider?.refresh();
      // Start auto-refresh when authenticated
      autoRefreshService.start();
    } else {
      // Stop auto-refresh when signed out
      autoRefreshService.stop();
    }
  });

  // Check initial authentication state
  const isAuthenticated = await authenticationService.isAuthenticated();
  await vscode.commands.executeCommand('setContext', 'github-discussions:authenticated', isAuthenticated);

  // Start auto-refresh if already authenticated
  if (isAuthenticated) {
    autoRefreshService.start();
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Authenticate command
  const authenticateCommand = vscode.commands.registerCommand('github-discussions.authenticate', async () => {
    try {
      const session = await authenticationService.getSession();
      if (session) {
        const user = await authenticationService.getCurrentUser();
        vscode.window.showInformationMessage(`Successfully signed in as ${user?.login || session.account.label}`);
        await vscode.commands.executeCommand('setContext', 'github-discussions:authenticated', true);
        discussionsProvider.refresh();
      } else {
        vscode.window.showWarningMessage('Failed to sign in to GitHub');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Authentication failed: ${error}`);
    }
  });

  // Refresh command
  const refreshCommand = vscode.commands.registerCommand('github-discussions.refresh', async () => {
    discussionsProvider.refresh();
  });

  // Create discussion command
  const createDiscussionCommand = vscode.commands.registerCommand('github-discussions.createDiscussion', async () => {
    try {
      const categories = await githubService.getDiscussionCategories();
      if (categories.length === 0) {
        vscode.window.showErrorMessage('No discussion categories available');
        return;
      }

      // Select category
      const categoryPick = await vscode.window.showQuickPick(
        categories.map(c => ({ label: `${c.emoji} ${c.name}`, description: c.description, category: c })),
        { placeHolder: 'Select a category for the new discussion' }
      );
      if (!categoryPick) {
        return;
      }

      // Input title
      const title = await vscode.window.showInputBox({
        prompt: 'Enter the discussion title',
        placeHolder: 'Discussion title',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Title is required';
          }
          return null;
        }
      });
      if (!title) {
        return;
      }

      // Try to load template from .github/DISCUSSION_TEMPLATE/
      let initialBody = 'Write your discussion content here...';
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const templatePath = vscode.Uri.joinPath(
          workspaceFolders[0].uri,
          '.github',
          'DISCUSSION_TEMPLATE',
          `${categoryPick.category.name.toLowerCase().replace(/\s+/g, '-')}.yml`
        );
        try {
          const templateContent = await vscode.workspace.fs.readFile(templatePath);
          const templateText = new TextDecoder().decode(templateContent);
          // Extract body from YAML template
          const bodyMatch = templateText.match(/body:\s*\|\s*\n([\s\S]*?)(?=\n\w|$)/);
          if (bodyMatch) {
            initialBody = bodyMatch[1].split('\n').map(line => line.replace(/^\s{2}/, '')).join('\n').trim();
          }
        } catch {
          // Template not found, use default
        }
      }

      // Open a new file for the discussion with title as filename
      const fileName = sanitizeFileName(title) + '.md';
      const uri = vscode.Uri.parse(`${DiscussionFileSystemProvider.scheme}:/discussions/new/${encodeURIComponent(fileName)}`);

      // Store category info in file system provider (not in file content)
      fileSystemProvider.setPendingCategory(uri.path, categoryPick.category.id);

      // Create directory and file
      await fileSystemProvider.createDirectory(vscode.Uri.parse(`${DiscussionFileSystemProvider.scheme}:/discussions/new`));

      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      // Insert initial content (body only, no frontmatter - consistent with editing)
      await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(0, 0), initialBody);
      });

      vscode.window.showInformationMessage(`Edit the discussion and save to create it in "${categoryPick.category.name}"`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create discussion: ${error}`);
    }
  });

  // Open comments command (opens in Webview for viewing and replying to comments)
  // Called from inline action button in tree view
  const openCommentsCommand = vscode.commands.registerCommand('github-discussions.openComments', async (treeItem?: { discussionSummary?: DiscussionSummary }) => {
    try {
      let summary = treeItem?.discussionSummary;

      // If no discussion provided (e.g., from command palette), show QuickPick
      if (!summary) {
        const discussions = await githubService.getDiscussionSummaries();
        if (discussions.length === 0) {
          vscode.window.showInformationMessage('No discussions found');
          return;
        }

        const picked = await vscode.window.showQuickPick(
          discussions.map(d => ({
            label: `#${d.number} ${d.title}`,
            description: `${d.category.emoji} ${d.category.name}`,
            detail: `by ${d.author.login} · ${d.commentsCount} comments`,
            discussion: d
          })),
          { placeHolder: 'Select a discussion to view comments' }
        );

        if (!picked) {
          return;
        }
        summary = picked.discussion;
      }

      // Fetch full discussion details (including comments)
      const discussion = await githubService.getDiscussion(summary.number);
      // Show in webview with comments
      await webviewProvider.showComments(discussion);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open comments: ${error}`);
    }
  });

  // Edit discussion command (same as open, opens the markdown file)
  const editDiscussionCommand = vscode.commands.registerCommand('github-discussions.editDiscussion', async (treeItem?: { discussionSummary?: DiscussionSummary }) => {
    try {
      let summary = treeItem?.discussionSummary;

      // If no discussion provided (e.g., from command palette), show QuickPick
      if (!summary) {
        const discussions = await githubService.getDiscussionSummaries();
        if (discussions.length === 0) {
          vscode.window.showInformationMessage('No discussions found');
          return;
        }

        const picked = await vscode.window.showQuickPick(
          discussions.map(d => ({
            label: `#${d.number} ${d.title}`,
            description: `${d.category.emoji} ${d.category.name}`,
            detail: `by ${d.author.login}`,
            discussion: d
          })),
          { placeHolder: 'Select a discussion to edit' }
        );

        if (!picked) {
          return;
        }
        summary = picked.discussion;
      }

      const fileName = sanitizeFileName(summary.title) + '.md';
      const uri = vscode.Uri.parse(`${DiscussionFileSystemProvider.scheme}:/discussions/${summary.number}/${encodeURIComponent(fileName)}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to edit discussion: ${error}`);
    }
  });

  // Open in browser command (opens the GitHub discussion in the default browser)
  const openInBrowserCommand = vscode.commands.registerCommand('github-discussions.openInBrowser', async (treeItem?: { discussionSummary?: DiscussionSummary }) => {
    try {
      let summary = treeItem?.discussionSummary;

      // If no discussion provided (e.g., from command palette), show QuickPick
      if (!summary) {
        const discussions = await githubService.getDiscussionSummaries();
        if (discussions.length === 0) {
          vscode.window.showInformationMessage('No discussions found');
          return;
        }

        const picked = await vscode.window.showQuickPick(
          discussions.map(d => ({
            label: `#${d.number} ${d.title}`,
            description: `${d.category.emoji} ${d.category.name}`,
            detail: `by ${d.author.login}`,
            discussion: d
          })),
          { placeHolder: 'Select a discussion to open in browser' }
        );

        if (!picked) {
          return;
        }
        summary = picked.discussion;
      }

      // Use the url field from DiscussionSummary (https URL from GitHub API)
      await vscode.env.openExternal(vscode.Uri.parse(summary.url));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open in browser: ${error}`);
    }
  });

  context.subscriptions.push(
    authenticateCommand,
    refreshCommand,
    createDiscussionCommand,
    openCommentsCommand,
    editDiscussionCommand,
    openInBrowserCommand
  );
}

function registerProviders(context: vscode.ExtensionContext): void {
  // Initialize DiscussionsProvider for tree view
  discussionsProvider = new DiscussionsProvider(githubService, authenticationService);

  // Register tree data provider
  const treeView = vscode.window.createTreeView('github-discussions', {
    treeDataProvider: discussionsProvider,
    showCollapseAll: true
  });

  // Initialize and register Virtual File System Provider
  fileSystemProvider = new DiscussionFileSystemProvider(githubService);
  const fsRegistration = vscode.workspace.registerFileSystemProvider(
    DiscussionFileSystemProvider.scheme,
    fileSystemProvider,
    { isCaseSensitive: true, isReadonly: false }
  );

  // Initialize Webview Provider for viewing discussions with comments
  webviewProvider = new DiscussionWebviewProvider(githubService, authenticationService, context);

  context.subscriptions.push(treeView, fsRegistration);
}

// Export context for use in other modules
export function getExtensionContext(): vscode.ExtensionContext {
  return extensionContext;
}