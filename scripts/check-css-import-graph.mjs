#!/usr/bin/env node
/**
 * Walk the same root CSS entrypoints as src/main.tsx and ensure every
 * relative @import target exists on disk. Catches postcss-import ENOENT
 * that Vitest does not surface (CSS is not fully resolved like vite build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const stylesRoot = path.join(repoRoot, 'src', 'styles');

const ENTRY_RELS = [
  'themes/index.css',
  'layout/index.css',
  'components/index.css',
  'tracks/index.css',
  'mobile/index.css',
];

/** Quoted path in @import '...' or "..." (postcss-import style in this repo). */
const IMPORT_RE = /@import\s+(['"])([^'"]+)\1/g;

function isFilesystemImport(spec) {
  if (spec.startsWith('http://') || spec.startsWith('https://') || spec.startsWith('data:')) {
    return false;
  }
  if (spec.startsWith('@')) return false;
  return spec.startsWith('./') || spec.startsWith('../');
}

function walk(absPath, visited, missing) {
  const key = path.resolve(absPath);
  if (visited.has(key)) return;
  if (!fs.existsSync(key)) {
    missing.add(path.relative(repoRoot, key));
    visited.add(key);
    return;
  }
  visited.add(key);
  const text = fs.readFileSync(key, 'utf8');
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const spec = m[2];
    if (!isFilesystemImport(spec)) continue;
    const next = path.resolve(path.dirname(key), spec);
    walk(next, visited, missing);
  }
}

const visited = new Set();
const missing = new Set();
for (const rel of ENTRY_RELS) {
  walk(path.join(stylesRoot, rel), visited, missing);
}

if (missing.size > 0) {
  const list = [...missing].sort().join('\n  ');
  console.error(`check-css-import-graph: missing @import target(s):\n  ${list}`);
  process.exit(1);
}
