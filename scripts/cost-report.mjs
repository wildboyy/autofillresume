#!/usr/bin/env node
/**
 * Estimate time and token cost of a DSH session from its event log.
 *
 * Why estimates: DSH does not persist provider usage. The session log does store
 * every message body, so we replay it and estimate tokens, which is enough to
 * compare two runs of the same task (before/after a skill or flow change).
 *
 * The metric that actually dominates spend is TOTAL INPUT TOKENS: every model
 * request re-sends the whole prior context, so cost grows with
 * (context size x number of requests). Cutting one `observe` call removes a
 * full-context request, which is worth far more than shortening the prompt.
 *
 * Usage:
 *   node cost-report.mjs                     # newest session in the workspace
 *   node cost-report.mjs --session <id>
 *   node cost-report.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SESSIONS = join(
  process.env.DSH_HOME ?? join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness'),
  'sessions',
);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}
const asJson = process.argv.includes('--json');

/** Rough bilingual token estimate: CJK ~1.6 chars/token, latin ~4 chars/token. */
function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x3000 && c <= 0x303f)) cjk += 1;
  }
  const latin = Math.max(0, [...text].length - cjk);
  return Math.round(cjk / 1.6 + latin / 4);
}

function collectText(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectText(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'type') continue;
      collectText(v, out);
    }
  }
  return out;
}

function locateSession() {
  const explicit = arg('session');
  const file = arg('file');
  if (file) return file;
  let newest;
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.name.endsWith('.jsonl.zstd')) continue;
      if (explicit && !full.includes(explicit)) continue;
      const mtime = statSync(full).mtimeMs;
      if (!newest || mtime > newest.mtime) newest = { path: full, mtime };
    }
  };
  walk(SESSIONS, 0);
  return newest?.path;
}

const path = locateSession();
if (!path || !existsSync(path)) {
  console.error('No session log found. Pass --file <session.v3.jsonl.zstd>.');
  process.exit(2);
}

const raw = path.endsWith('.zstd')
  ? execFileSync('/opt/homebrew/bin/zstd', ['-dc', path], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  : readFileSync(path, 'utf8');

const turns = new Map();
let contextTokens = 0;
let totalInput = 0;
let turn = 0;
let step = 0;
let compactionResets = 0;
const toolCalls = new Map();
let firstTime;
let lastTime;

function bucket(t) {
  if (!turns.has(t)) {
    turns.set(t, { turn: t, steps: 0, toolCalls: 0, outputTokens: 0, inputTokens: 0, start: undefined, end: undefined });
  }
  return turns.get(t);
}

for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    continue;
  }
  firstTime ??= event.time;
  lastTime = event.time ?? lastTime;

  switch (event.type) {
    case 'turn/start': {
      turn = event.data?.turn ?? turn;
      bucket(turn).start = event.time;
      break;
    }
    case 'turn/end': {
      const t = event.data?.turn ?? turn;
      bucket(t).end = event.time;
      break;
    }
    case 'step/start': {
      step = event.data?.step ?? step;
      const b = bucket(turn);
      b.steps += 1;
      // Every step issues one model request carrying the whole context so far.
      b.inputTokens += contextTokens;
      totalInput += contextTokens;
      break;
    }
    case 'tool/call': {
      const name = event.data?.name ?? event.data?.tool ?? 'unknown';
      toolCalls.set(name, (toolCalls.get(name) ?? 0) + 1);
      bucket(turn).toolCalls += 1;
      break;
    }
    case 'assistant/message': {
      const text = collectText(event.data?.message?.content ?? event.data?.message ?? '').join('\n');
      const tokens = estimateTokens(text);
      bucket(turn).outputTokens += tokens;
      contextTokens += tokens;
      break;
    }
    case 'user/message':
    case 'system/message': {
      contextTokens += estimateTokens(collectText(event.data).join('\n'));
      break;
    }
    case 'tool/result': {
      contextTokens += estimateTokens(collectText(event.data?.result ?? event.data).join('\n'));
      break;
    }
    case 'compaction/end': {
      // The summary replaces the raw history; approximate the new floor.
      contextTokens = estimateTokens(collectText(event.data).join('\n')) + 4000;
      compactionResets += 1;
      break;
    }
    default:
      break;
  }
}

const rows = [...turns.values()].sort((a, b) => a.turn - b.turn);
const sum = (key) => rows.reduce((acc, r) => acc + r[key], 0);
const report = {
  session: path.split('/').pop(),
  wallClockMinutes: firstTime && lastTime ? +((lastTime - firstTime) / 60000).toFixed(1) : null,
  turns: rows.length,
  steps: sum('steps'),
  toolCalls: sum('toolCalls'),
  estimatedOutputTokens: sum('outputTokens'),
  estimatedInputTokens: totalInput,
  compactionResets,
  toolCallsByName: Object.fromEntries([...toolCalls].sort((a, b) => b[1] - a[1])),
  perTurn: rows.map((r) => ({
    ...r,
    wallClockSeconds: r.start && r.end ? +((r.end - r.start) / 1000).toFixed(1) : null,
  })),
};

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`session      ${report.session}`);
  console.log(`wall clock   ${report.wallClockMinutes} min`);
  console.log(`turns/steps  ${report.turns} / ${report.steps}   tool calls ${report.toolCalls}`);
  console.log(`input  (est) ${report.estimatedInputTokens.toLocaleString()} tokens   <- dominates cost`);
  console.log(`output (est) ${report.estimatedOutputTokens.toLocaleString()} tokens`);
  console.log(`compactions  ${report.compactionResets}`);
  console.log('\ntool calls by name:');
  for (const [name, count] of Object.entries(report.toolCallsByName)) console.log(`  ${String(count).padStart(5)}  ${name}`);
  console.log('\nper turn:');
  console.log('  turn  steps  tools  wall(s)  out(est)  in(est)');
  for (const r of report.perTurn) {
    console.log(
      `  ${String(r.turn).padStart(4)}  ${String(r.steps).padStart(5)}  ${String(r.toolCalls).padStart(5)}  ` +
        `${String(r.wallClockSeconds ?? '-').padStart(7)}  ${String(r.outputTokens).padStart(8)}  ${String(r.inputTokens).padStart(8)}`,
    );
  }
}
