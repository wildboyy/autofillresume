#!/usr/bin/env node
/**
 * Enforce handbook rule C2: personal data must never appear in the deliverable.
 *
 * Strategy: the profile file is the definition of "personal". Read its identity-critical
 * values and search the skill directory for them. Two tiers:
 *
 *   Tier 1 - pattern scan (independent of any profile): anything that looks like a
 *            mainland ID number, a CN mobile number, or an email address.
 *            Catches leaks even when the profile file is missing or was never filled.
 *   Tier 2 - value scan: values of identity-critical keys, matched literally.
 *            Key-driven instead of "all values", because most profile values are generic
 *            vocabulary (民族/学历/状态/是否…) and flagging those would make the check
 *            useless noise.
 *
 * Run before every commit or delivery. Non-zero exit blocks the change.
 *
 * Usage:
 *   node check-no-pii.mjs [--profile <file>] [--dir <skill-dir>] [--extra-keys a,b] [--json]
 *
 * Exit codes: 0 clean, 1 leak found, 2 usage/setup error.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(HERE, '..');
const WORKSPACE = resolve(SKILL_DIR, '..', '..', '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const asJson = process.argv.includes('--json');
const profilePath = resolve(arg('profile', join(WORKSPACE, '简历信息-解析版.md')));
const scanDir = resolve(arg('dir', SKILL_DIR));

/** Identity-critical profile keys. Prefix match, so 教育1学校 matches 教育1学校. */
const CRITICAL_KEYS = [
  '姓名', '曾用名', '证件号码', '手机号', '电子邮箱', '备用邮箱', '微信号', 'QQ号',
  '紧急联系人姓名', '紧急联系电话', '社交主页地址', '社交主页名称',
  '现居住地址', '现居住城市', '户籍所在地',
];
const CRITICAL_SUFFIXES = ['学校', '公司', '姓名', '联系电话', '导师'];

/** Values that are enumerations, not personal data. Exact match, case-insensitive. */
const GENERIC_VALUES = new Set([
  '无', '是', '否', '男', '女', '有', '没有',
  '中国大陆', '随时到岗', '身份证', '校招', '社招',
  '未婚', '已婚', '丧偶', '离异',
  '共青团员', '中共党员', '群众', '预备党员', '民主党派',
  '汉族', '满族', '回族', '蒙古族',
  '大学本科', '硕士研究生', '博士研究生', '高中', '大专', '专科',
  '全日制', '非全日制', '成人教育', '统招全日制',
  'CET-4', 'CET-6', '无',
]);

const extraKeys = (arg('extra-keys', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

/** Tier 1 patterns. Deliberately narrow to avoid flagging real documentation. */
const PATTERNS = [
  { name: 'mainland ID number', re: /\b\d{17}[\dXx]\b/g },
  { name: 'CN mobile number', re: /\b1[3-9]\d{9}\b/g },
  { name: 'email address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
];

/**
 * Obvious placeholders must not trip the pattern scan, or the check becomes noise that
 * people learn to ignore. Documentation is *supposed* to contain fake examples.
 */
const PLACEHOLDER_LITERALS = new Set(['13800138000', '13800138001', '12345678901']);
const PLACEHOLDER_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.invalid', 'localhost'];
/**
 * Role-based local parts belong to an organisation, not a person: a recruiting portal's
 * `campus@…` / `hr@…` contact address is documentation, not personal data. Without this,
 * any site doc that quotes a company contact address would fail the check.
 */
const ROLE_LOCAL_PARTS = new Set([
  'campus', 'hr', 'jobs', 'job', 'recruit', 'recruiting', 'career', 'careers',
  'noreply', 'no-reply', 'donotreply', 'support', 'service', 'help', 'info',
  'contact', 'admin', 'webmaster', 'postmaster', 'privacy', 'security', 'feedback',
]);

function isPlaceholder(sample, kind) {
  const s = sample.trim();
  if (kind === 'email address') {
    const at = s.lastIndexOf('@');
    const local = s.slice(0, at).toLowerCase();
    const domain = s.slice(at + 1).toLowerCase();
    if (PLACEHOLDER_EMAIL_DOMAINS.includes(domain) || domain.endsWith('.invalid') || domain.endsWith('.test')) return true;
    return ROLE_LOCAL_PARTS.has(local);
  }
  if (PLACEHOLDER_LITERALS.has(s)) return true;
  // Repeated-digit fakes: 13000000000, or an all-same-digit 18-char ID body.
  if (/^1[3-9](\d)\1{8}$/.test(s)) return true;
  if (/^(\d)\1{17}[\dXx]?$/.test(s)) return true;
  return false;
}

/** Files worth scanning, and files to skip. */
const SCAN_EXT = /\.(md|mjs|js|cjs|json|ya?ml|txt)$/i;
const SKIP_NAMES = new Set(['check-no-pii.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry.name) && !SKIP_NAMES.has(entry.name) && full !== profilePath) out.push(full);
  }
  return out;
}

function loadProfileValues(file) {
  if (!existsSync(file)) return { ok: false, values: [] };
  const values = new Map(); // value -> key
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0 || line.trim().startsWith('#')) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    if (GENERIC_VALUES.has(value)) continue;
    const critical =
      CRITICAL_KEYS.some((k) => key === k || key.startsWith(k)) ||
      CRITICAL_SUFFIXES.some((s) => key.endsWith(s)) ||
      extraKeys.some((k) => key === k || key.startsWith(k));
    if (!critical) continue;
    const nameLike = key === '曾用名' || key.endsWith('姓名') || key.endsWith('导师');
    const minLen = nameLike ? 2 : DEFAULT_MIN_LEN;
    if (value.length < minLen) continue;
    if (!values.has(value)) values.set(value, key);
  }
  return { ok: true, values: [...values].map(([value, key]) => ({ value, key })) };
}

/**
 * Mask a matched value for display. This tool's own output can end up in a shared log or
 * issue, so it must not re-leak what it is reporting.
 */
function mask(s) {
  const v = String(s);
  if (v.length <= 4) return '*'.repeat(v.length);
  const head = v.slice(0, Math.min(3, v.length - 2));
  const tail = v.slice(-2);
  return `${head}${'*'.repeat(Math.max(1, v.length - head.length - tail.length))}${tail}`;
}

/**
 * A two-character CJK value (a person's name) is prone to substring false positives:
 * profile 姓名: 王伟 makes "王伟明同学" look like a leak. Require such a value to stand
 * alone — not directly followed by another CJK character — so it is not matching as the
 * prefix of a longer word/name. Trade-off: "王伟同学"-style prose is then missed, but
 * structured docs write names at line ends or before punctuation, so this is net-positive.
 */
function matchesWhole(line, value) {
  if (!line.includes(value)) return false;
  if (value.length === 2 && /^[\u4e00-\u9fff]{2}$/.test(value)) {
    let idx = line.indexOf(value);
    while (idx !== -1) {
      const after = line[idx + 2];
      if (after === undefined || !/[\u4e00-\u9fff]/.test(after)) return true;
      idx = line.indexOf(value, idx + 1);
    }
    return false;
  }
  return true;
}

/**
 * Minimum value length worth scanning. Most short values are enumerations, but a
 * two-character Chinese name is the single most sensitive value in the profile, so any
 * name-like key (姓名/曾用名/联系人姓名/导师/…) is exempt from the length floor.
 * (A length-3 floor once let a real two-character name through; limiting the exemption to
 * the literal 姓名/曾用名 keys still left 紧急联系人姓名/推荐人姓名/导师 leaking.)
 */
const DEFAULT_MIN_LEN = 3;

const profile = loadProfileValues(profilePath);
const findings = [];

for (const file of walk(scanDir)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const rel = relative(scanDir, file);
  lines.forEach((line, i) => {
    const redact = (value) => line.split(value).join(mask(value)).trim().slice(0, 100);
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      const m = line.match(re);
      if (m) {
        const real = m.filter((hit) => !isPlaceholder(hit, name));
        if (real.length > 0) {
          findings.push({ file: rel, line: i + 1, kind: `pattern: ${name}`, sample: mask(real[0]), text: redact(real[0]) });
        }
      }
    }
    for (const { value, key } of profile.values) {
      if (!matchesWhole(line, value)) continue;
      // A masked form such as 1585****203 must not count as a leak.
      findings.push({ file: rel, line: i + 1, kind: `profile value (${key})`, sample: mask(value), text: redact(value) });
    }
  });
}

const report = {
  ok: findings.length === 0,
  scannedDir: scanDir,
  profile: profilePath,
  profileReadable: profile.ok,
  criticalValuesChecked: profile.values.length,
  findings,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`scan          ${scanDir}`);
  console.log(`profile       ${profilePath}${profile.ok ? '' : '  (NOT FOUND - tier 2 skipped)'}`);
  console.log(`critical keys ${profile.values.length} distinct values checked`);
  if (findings.length === 0) {
    console.log('\ncheck-no-pii: PASS');
  } else {
    console.log(`\ncheck-no-pii: FAIL - ${findings.length} hit(s). Personal data must not ship.\n`);
    for (const f of findings) {
      console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.sample}`);
      console.log(`      ${f.text}`);
    }
    console.log('\nFix per handbook C2: replace literals with "read key X from the profile",');
    console.log('or use an obviously fake placeholder such as 13000000000.');
  }
}
process.exit(findings.length === 0 ? 0 : 1);
