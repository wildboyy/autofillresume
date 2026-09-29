#!/usr/bin/env node
/**
 * Preflight gate for the resume-autofill skill.
 *
 * Prints one line per requirement so the agent can decide in a single cheap call
 * whether the run can proceed, instead of discovering a missing prerequisite
 * half-way through a browser session.
 *
 * Usage:
 *   node scripts/preflight.mjs [--workdir <dir>] [--profile <file>] [--json]
 *
 * Exit codes: 0 all hard checks passed, 1 at least one hard check failed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const asJson = process.argv.includes('--json');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const workdir = resolve(arg('workdir', process.cwd()));
const profileName = arg('profile', '简历信息-解析版.md');
const profilePath = isAbsolute(profileName) ? profileName : join(workdir, profileName);

const checks = [];
const add = (name, status, detail, hard = true) => checks.push({ name, status, detail, hard });

/** 1. OS: macOS is required for reading SMS codes out of the Messages database. */
add(
  'operating system',
  process.platform === 'darwin' ? 'ok' : 'warn',
  process.platform === 'darwin'
    ? 'macOS: SMS verification codes can be read automatically'
    : `${process.platform}: SMS codes cannot be read automatically; the user must retype every code`,
  true,
);

/** 2. Working directory and profile file. */
if (!existsSync(workdir)) {
  add('working directory', 'fail', `${workdir} does not exist`);
} else {
  add('working directory', 'ok', workdir);
}
if (existsSync(profilePath)) {
  const lines = readFileSync(profilePath, 'utf8').split('\n').filter((l) => l.includes(':') && !l.trim().startsWith('#'));
  const filled = lines.filter((l) => l.split(':').slice(1).join(':').trim().length > 0);
  add('profile file', 'ok', `${profilePath} (${filled.length} populated of ${lines.length} keys)`);
} else {
  add(
    'profile file',
    'fail',
    `${profilePath} not found - create it from references/profile-schema.md and have the user fill it in`,
  );
}

/** 3. bsk CLI + daemon + browser extension, via the tool's own diagnostics. */
let bskPath;
try {
  bskPath = execFileSync('/bin/sh', ['-lc', 'command -v bsk'], { encoding: 'utf8' }).trim();
} catch {
  bskPath = '';
}
if (!bskPath) {
  add('bsk CLI', 'fail', 'not on PATH - install the bsk CLI from the browser-skill plugin guide');
} else {
  let version = '';
  try {
    version = execFileSync(bskPath, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    version = '(version probe failed)';
  }
  add('bsk CLI', 'ok', `${bskPath} ${version}`);

  try {
    const doctor = execFileSync('/bin/sh', ['-lc', `${JSON.stringify(bskPath)} doctor`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const bad = doctor
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(fail|error)\b/i.test(l));
    const notApplicable = doctor
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^N\/A\b/i.test(l));
    if (bad.length === 0) {
      const browser = doctor.split('\n').find((l) => /extension connected/i.test(l)) ?? '';
      const note = notApplicable.length > 0 ? ` (informational N/A: ${notApplicable.join(' | ')})` : '';
      add('bsk daemon', 'ok', (browser.trim() || 'daemon healthy') + note);
    } else {
      add('bsk daemon', 'fail', `bsk doctor reports: ${bad.join(' | ')}`);
    }
  } catch (error) {
    add('bsk daemon', 'fail', `bsk doctor failed: ${String(error.stdout || error.message).trim().slice(0, 300)}`);
  }
}

/** 4. The browser-skill plugin must be bundled into the active DSH profile. */
const dshHome = process.env.DSH_HOME ?? join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness');
const profilesDir = join(dshHome, 'profiles');
let pluginFound = false;
let pluginDetail = `${profilesDir} not found`;
if (existsSync(profilesDir)) {
  for (const profile of readdirSync(profilesDir)) {
    const pkg = join(profilesDir, profile, 'package.json');
    if (!existsSync(pkg)) continue;
    try {
      const parsed = JSON.parse(readFileSync(pkg, 'utf8'));
      const bundles = parsed?.dsh?.profile?.bundles ?? [];
      const hit = bundles.find((b) => String(b).includes('browser-skill'));
      if (hit) {
        pluginFound = true;
        pluginDetail = `${hit} in profile "${profile}"`;
        break;
      }
    } catch {
      /* ignore malformed profile package.json */
    }
  }
  if (!pluginFound) pluginDetail = `no browser-skill bundle in any profile under ${profilesDir}`;
}
add('browser plugin', pluginFound ? 'ok' : 'fail', pluginDetail);

/** 5. Model tier cannot be probed from a script; remind the agent to self-assess. */
add(
  'model tier',
  'manual',
  'compare your own model identity against a low-cost tier; this flow is tool-call heavy',
  false,
);

const failed = checks.filter((c) => c.status === 'fail');
const exitCode = failed.length > 0 ? 1 : 0;

if (asJson) {
  console.log(JSON.stringify({ ok: exitCode === 0, workdir, profilePath, checks }, null, 2));
} else {
  for (const c of checks) {
    const mark = c.status === 'ok' ? 'ok  ' : c.status === 'warn' ? 'warn' : c.status === 'manual' ? '?   ' : 'FAIL';
    console.log(`${mark} ${c.name.padEnd(18)} ${c.detail}`);
  }
  console.log(exitCode === 0 ? '\npreflight: PASS' : `\npreflight: FAIL (${failed.length} blocking)`);
}
process.exit(exitCode);
