import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  workspaceFolder: './test-fixtures',
  mocha: {
    ui: 'tdd',
    color: true,
    timeout: 60000,
    grep: 'E2E',
  },
  installExtensions: [],
  launchArgs: [
    '--disable-extensions',
    '--disable-workspace-trust',
  ],
});