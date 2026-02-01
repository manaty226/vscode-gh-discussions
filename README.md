# GitHub Discussions for VS Code

[![Build Status](https://github.com/manaty226/vscode-gh-discussions/actions/workflows/test.yml/badge.svg)](https://github.com/manaty226/vscode-gh-discussions/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Version](https://img.shields.io/badge/VS%20Code-1.105%2B-blue.svg)](https://code.visualstudio.com/)

View, create, edit, and manage GitHub Discussions directly within VS Code using a Virtual File System approach.

<!-- ![GitHub Discussions Extension Demo](media/demo.gif) -->

## Features

- **Sidebar Tree View** - Browse discussions organized by category with lazy loading
- **Virtual File System** - Edit discussions as markdown files (`ghd://` URI scheme)
- **Rich Preview** - View discussions with full markdown rendering and Mermaid diagram support
- **Create & Edit** - Create new discussions and edit existing ones without leaving VS Code
- **Comments View** - View and navigate discussion comments with @mention support
- **@Mention Support** - Mention users in comments with autocomplete suggestions
- **Notification Badge** - See unread comment notifications (excludes your own comments)
- **Progress Indicator** - Visual feedback when saving discussions
- **Auto Refresh** - Automatically sync with GitHub at configurable intervals
- **Dark Mode** - Optimized visibility for both light and dark themes
- **Open in Browser** - Quick access to discussions on GitHub

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open a folder containing a Git repository with GitHub Discussions enabled
3. Click the **GitHub Discussions** icon in the Activity Bar
4. Click **Sign in to GitHub** when prompted
5. Start browsing and editing your discussions

## Requirements

- VS Code 1.105.0 or higher
- A GitHub repository with Discussions enabled
- GitHub authentication (the extension uses VS Code's built-in GitHub authentication)

## Commands

All commands are accessible via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `GitHub Discussions: Sign in to GitHub` | Authenticate with GitHub |
| `GitHub Discussions: Refresh` | Manually refresh the discussions list |
| `GitHub Discussions: Create Discussion` | Create a new discussion |
| `GitHub Discussions: Edit Discussion` | Edit a discussion |
| `GitHub Discussions: View Comments` | View comments on a discussion |
| `GitHub Discussions: Open in Browser` | Open the discussion on GitHub |

## Extension Settings

This extension contributes the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `github-discussions.autoRefresh` | `true` | Automatically refresh discussions |
| `github-discussions.refreshInterval` | `300` | Auto-refresh interval in seconds (minimum: 30, default: 5 minutes) |
| `github-discussions.showNotifications` | `true` | Show notifications for discussion updates |
| `github-discussions.defaultSort` | `"newest"` | Default sort order (`newest`, `oldest`, `top`) |
| `github-discussions.defaultCategory` | `"general"` | Default category for new discussions |
| `github-discussions.pageSize` | `10` | Number of discussions to load per page (1-100) |

### Example Configuration

```json
{
  "github-discussions.autoRefresh": true,
  "github-discussions.refreshInterval": 600,
  "github-discussions.defaultSort": "top",
  "github-discussions.defaultCategory": "Q&A",
  "github-discussions.pageSize": 20
}
```

## How It Works

The extension uses a **Virtual File System** to expose GitHub Discussions as editable markdown files:

```
ghd://discussions/{number}/{title}.md
```

When you save changes to a discussion file, the extension automatically syncs your edits back to GitHub via the GraphQL API.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code                                 │
├─────────────────────────────────────────────────────────────────┤
│  Activity Bar    │    Editor Area    │      Sidebar             │
│  ┌───────────┐   │   ┌───────────┐   │   ┌────────────────┐     │
│  │ Discussions│   │   │ ghd://... │   │   │ Tree View      │     │
│  │   Icon    │   │   │ .md file  │   │   │ - Category 1   │     │
│  └───────────┘   │   │           │   │   │   - Discussion │     │
│                  │   │           │   │   │   - Discussion │     │
│                  │   └───────────┘   │   │ - Category 2   │     │
│                  │                   │   │   - Discussion │     │
│                  │                   │   └────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ GitHub GraphQL  │
                    │      API        │
                    └─────────────────┘
```

### Data Flow

1. Authenticate via VS Code's built-in GitHub auth (scopes: `repo`, `read:user`)
2. Fetch discussions via GitHub GraphQL API
3. Display discussions in the sidebar tree view grouped by category
4. Open discussions as virtual markdown files for editing
5. Sync changes back to GitHub on save

## Known Issues

- Discussions from private repositories require appropriate GitHub permissions
- Large discussions with many comments may take longer to load

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/manaty226/vscode-gh-discussions.git
cd vscode-gh-discussions

# Install dependencies
npm install

# Compile the extension
npm run compile

# Run tests
npm test

# Package the extension
npm run package
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run Jest unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run compile` | Compile TypeScript |
| `npm run watch` | Watch mode compilation |
| `npm run lint` | Check code style with ESLint |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run package` | Create .vsix extension package |

### Project Structure

```
src/
├── extension.ts              # Main entry point
├── providers/                # Presentation layer
│   ├── DiscussionsProvider.ts        # Tree view for sidebar
│   ├── DiscussionFileSystemProvider.ts   # Virtual FS (ghd://)
│   └── WebviewProvider.ts            # Rich markdown rendering
├── services/                 # Business logic layer
│   ├── AuthenticationService.ts      # GitHub auth integration
│   ├── GitHubService.ts              # GraphQL API communication
│   ├── AutoRefreshService.ts         # Background updates
│   ├── CacheService.ts               # In-memory caching
│   └── StorageService.ts             # Persistent storage
├── models/                   # Data models
└── utils/                    # Utility functions
```

## Release Notes

### 0.5.0

- Exclude your own comments from notification badge
- Improved visibility for comments and replies in WebView
- Enhanced dark mode support

### 0.4.0

- @mention support with autocomplete in comments and replies
- Mention suggestions include discussion participants, collaborators, and org members

### 0.3.0

- Progress indicator when saving discussions

### 0.2.0

- Lazy loading for categories with pagination support
- Filter to show only OPEN discussions
- QuickPick selection for discussions from command palette

### 0.1.0

- Virtual File System support for editing discussions
- Rich markdown preview with Mermaid diagram support
- Auto-refresh functionality
- Category-based organization

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- GitHub API integration via [@octokit/graphql](https://github.com/octokit/graphql.js)

---

**Enjoy managing your GitHub Discussions directly in VS Code!**
