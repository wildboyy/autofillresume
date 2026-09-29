#!/usr/bin/env node
/**
 * Print a resume's text so the model can read it.
 *
 * Use this when you want the raw text (to interpret prose sections, or when the
 * rule-based parser in `bootstrap-profile.mjs` cannot handle the layout).
 * For turning a resume into a profile draft, prefer `bootstrap-profile.mjs`.
 *
 * Extraction is LOSSY. Treat the output as a lead, never as truth.
 *
 * Usage:
 *   node extract-resume.mjs --file ~/Desktop/resume.pdf [--max-chars 30000] [--json]
 *
 * Exit codes: 0 extracted, 1 input problem, 2 missing extractor
 */
import { extractText } from './lib/extract-text.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const asJson = process.argv.includes('--json');

const input = arg('file');
if (!input) {
  console.error('Usage: node extract-resume.mjs --file <path-to-resume> [--json]');
  process.exit(1);
}

const result = extractText(input, { maxChars: Number(arg('max-chars', '30000')) });
if (!result.ok) {
  console.error(result.message);
  process.exit(result.code);
}

if (asJson) {
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} else {
  console.error(`# extracted via ${result.via} | ${result.chars} chars${result.truncated ? ' (truncated)' : ''}`);
  console.error(`# WARNING: ${result.warning}`);
  console.error('# Draft the profile from this, then have the user confirm every value before use.');
  console.log(result.text);
}
