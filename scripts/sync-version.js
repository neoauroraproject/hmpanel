#!/usr/bin/env node
/**
 * Sync VERSION file to all package.json files.
 * Usage: node scripts/sync-version.js [version]
 * If version omitted, reads from VERSION file.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const versionFile = path.join(root, 'VERSION');
const pkgFiles = [
  path.join(root, 'package.json'),
  path.join(root, 'backend', 'package.json'),
  path.join(root, 'frontend', 'package.json'),
];

const argVersion = process.argv[2];
let version = argVersion?.trim().replace(/^v/i, '');

if (!version) {
  if (!fs.existsSync(versionFile)) {
    console.error('VERSION file missing and no version argument provided.');
    process.exit(1);
  }
  version = fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/i, '');
}

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid semver: ${version}`);
  process.exit(1);
}

fs.writeFileSync(versionFile, `${version}\n`);

for (const file of pkgFiles) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Synced version ${version} → VERSION + ${pkgFiles.length} package.json files`);
