/**
 * Jest test setup file
 */

// Mock VSCode API
const mockVscode = {
  workspace: {
    workspaceFolders: [],
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
      has: jest.fn(),
      inspect: jest.fn()
    })),
    onDidChangeConfiguration: jest.fn(),
    registerFileSystemProvider: jest.fn(),
    openTextDocument: jest.fn(),
    registerTextDocumentContentProvider: jest.fn()
  },
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    createTreeView: jest.fn(),
    createWebviewPanel: jest.fn(),
    showTextDocument: jest.fn(),
    withProgress: jest.fn((_options, task) => task({ report: jest.fn() }, { isCancellationRequested: false }))
  },
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn()
  },
  authentication: {
    getSession: jest.fn(),
    onDidChangeSessions: jest.fn(() => ({
      dispose: jest.fn()
    }))
  },
  Uri: {
    parse: jest.fn((str: string) => ({
      scheme: str.split(':')[0],
      path: str.split(':')[1] || '',
      toString: () => str
    })),
    file: jest.fn((path: string) => ({
      scheme: 'file',
      path,
      toString: () => `file://${path}`
    })),
    joinPath: jest.fn((uri: any, ...pathSegments: string[]) => {
      const basePath = uri.path || '';
      const joinedPath = [basePath, ...pathSegments].join('/').replace(/\/+/g, '/');
      return {
        scheme: uri.scheme || 'file',
        path: joinedPath,
        toString: () => `${uri.scheme || 'file'}://${joinedPath}`
      };
    })
  },
  TreeItem: jest.fn(),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64
  },
  FileChangeType: {
    Changed: 1,
    Created: 2,
    Deleted: 3
  },
  FileSystemError: {
    FileNotFound: jest.fn((uri?: any) => new Error(`FileNotFound: ${uri}`)),
    FileExists: jest.fn((uri?: any) => new Error(`FileExists: ${uri}`)),
    FileNotADirectory: jest.fn((uri?: any) => new Error(`FileNotADirectory: ${uri}`)),
    FileIsADirectory: jest.fn((uri?: any) => new Error(`FileIsADirectory: ${uri}`)),
    NoPermissions: jest.fn((message?: any) => new Error(`NoPermissions: ${message}`)),
    Unavailable: jest.fn((uri?: any) => new Error(`Unavailable: ${uri}`))
  },
  EventEmitter: jest.fn(() => ({
    event: jest.fn(),
    fire: jest.fn(),
    dispose: jest.fn()
  })),
  Disposable: {
    from: jest.fn()
  },
  ExtensionContext: jest.fn(),
  SecretStorage: jest.fn(() => ({
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn()
  })),
  env: {
    openExternal: jest.fn()
  },
  ThemeIcon: jest.fn((id: string, color?: any) => ({ id, color })),
  ThemeColor: jest.fn((id: string) => ({ id })),
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
    Active: -1,
    Beside: -2
  }
};

// Mock the vscode module
jest.mock('vscode', () => mockVscode, { virtual: true });

// Mock child_process for git operations
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

// Global test utilities
(global as any).mockVscode = mockVscode;

// Setup global test timeout
jest.setTimeout(10000);

// Dummy test to prevent "no tests" error
describe('Setup', () => {
  it('should setup test environment', () => {
    expect(true).toBe(true);
  });
});