/**
 * esbuild configuration for bundling Mermaid.js
 * Creates a single IIFE bundle for use in VSCode webviews
 *
 * Mermaid is fetched from node_modules at build time.
 * Run `npm install` before running this script.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, 'media');
const OUTPUT_FILE = path.join(MEDIA_DIR, 'mermaid.bundle.js');
const MERMAID_PACKAGE_PATH = path.join(__dirname, 'node_modules', 'mermaid', 'package.json');

// Get mermaid version from package.json
const packageJson = require('./package.json');
const declaredVersion = packageJson.devDependencies.mermaid;

// Check if mermaid is installed in node_modules
if (!fs.existsSync(MERMAID_PACKAGE_PATH)) {
  console.error('Error: mermaid is not installed in node_modules.');
  console.error('Please run `npm install` first.');
  process.exit(1);
}

// Get actual installed version from node_modules
const mermaidPackage = require(MERMAID_PACKAGE_PATH);
const installedVersion = mermaidPackage.version;

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  console.log(`Created directory: ${MEDIA_DIR}`);
}

console.log(`Bundling Mermaid.js from node_modules...`);
console.log(`  Declared version (package.json): ${declaredVersion}`);
console.log(`  Installed version (node_modules): ${installedVersion}`);

esbuild.build({
  entryPoints: ['./src/mermaid-entry.js'],
  bundle: true,
  format: 'iife',
  // No globalName - mermaid-entry.js directly assigns to window.mermaid
  // This avoids exposing a predictable global name that could be polluted
  platform: 'browser',
  outfile: OUTPUT_FILE,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  // Ensure all dependencies are bundled from node_modules
  external: [],
  // Target modern browsers (VSCode uses Chromium)
  target: ['chrome100'],
  // Add banner with version info
  banner: {
    js: `/* Mermaid.js v${installedVersion} - Bundled from node_modules for VSCode GitHub Discussions Extension */`
  }
}).then(() => {
  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`Mermaid bundle created successfully!`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Source: node_modules/mermaid@${installedVersion}`);
}).catch((error) => {
  console.error('Failed to bundle Mermaid:', error);
  process.exit(1);
});
