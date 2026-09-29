#!/usr/bin/env node
/**
 * Read the most recent SMS verification codes from the macOS Messages database.
 *
 * Why this exists: on modern macOS the `message.text` column is frequently NULL
 * and the body lives in `message.attributedBody` as a typedstream (NSKeyedArchiver)
 * blob. Re-deriving that decode costs the agent a lot of tokens, so it lives here.
 *
 * Usage:
 *   node read-sms-code.mjs [--minutes 5] [--limit 20] [--pattern 验证码|code] [--json]
 *                          [--wait 180]
 *
 * `--minutes` is a FRESHNESS filter, not a recall knob. The caller polls in a tight
 * loop, so a wide window buys no extra recall — it only drags already-expired codes
 * into the candidate list. Real codes live ~5 minutes (Xiaomi's own SMS says so), so
 * the default matches that TTL. Widen it only for a diagnostic ("did it ever arrive?").
 *
 * `--wait <seconds>` polls internally every 5s until a code appears or the deadline
 * passes. Prefer it over the caller looping: SMS delivery routinely lags the
 * "code sent" UI by 30-90s, and one call that waits beats N calls that guess.
 *
 * Exit codes:
 *   0  at least one candidate message found
 *   1  no candidate found (caller should wait and retry a few times)
 *   2  Messages database unreadable (usually missing Full Disk Access)
 *
 * Privacy: only returns rows whose body matches `--pattern`, and only within the
 * time window. It never dumps the whole inbox.
 */
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DB = join(homedir(), 'Library', 'Messages', 'chat.db');
// Apple epoch (2001-01-01) offset from Unix epoch, in seconds.
const APPLE_EPOCH_OFFSET_S = 978307200;
const APPLE_EPOCH_OFFSET_NS = BigInt(APPLE_EPOCH_OFFSET_S) * 1000000000n;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const minutes = Number(arg('minutes', '5'));
const limit = Number(arg('limit', '20'));
const pattern = new RegExp(arg('pattern', '验证码|校验码|动态码|verification|verify|code'), 'i');
const asJson = flag('json');

const windowNs = BigInt(Math.floor(minutes * 60)) * 1000000000n;
const waitSeconds = Number(arg('wait', '0'));

function query(sql) {
  const out = execFileSync('/usr/bin/sqlite3', ['-json', '-readonly', DB, sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  // sqlite3 -json prints NOTHING (not even "[]") when the result set is empty.
  const trimmed = out.trim();
  return trimmed.length === 0 ? [] : JSON.parse(trimmed);
}

/**
 * Best-effort recovery of text from an attributedBody typedstream blob.
 * The blob is not a clean string, so this strips the typedstream framing and
 * control bytes, then keeps the longest printable run. Callers should treat the
 * result as untrusted and prefer extracting a code with a regex over reuse.
 */
function decodeAttributedBody(hexOrNull) {
  if (!hexOrNull) return '';
  let buf;
  try {
    buf = Buffer.from(hexOrNull, 'hex');
  } catch {
    return '';
  }
  const marker = buf.indexOf(Buffer.from('NSString'));
  const body = marker >= 0 ? buf.subarray(marker + 8) : buf;
  const printable = body
    .toString('utf8')
    // drop C0/C1 control bytes and the replacement char produced by bad splits
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\ufffd]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Prefer the longest run that actually looks like a sentence, not framing junk.
  const runs = printable.split(/[^\p{Script=Han}\p{L}\p{N}\s,，。.:：、()（）【】\-—]/u).filter((s) => s.trim().length >= 4);
  runs.sort((a, b) => b.length - a.length);
  return (runs[0] ?? '').trim();
}

function collectHits() {
  // Recomputed per poll: `now` moves, so a fixed window would slide out from under us.
  // `m.date` is nanoseconds since the Apple epoch (2001-01-01), NOT since 1970, so the
  // offset must be SUBTRACTED from the current time. Adding it points the threshold
  // ~31 years into the future and silently matches nothing.
  const nowAppleNs =
    (BigInt(Math.floor(Date.now() / 1000)) - BigInt(APPLE_EPOCH_OFFSET_S)) * 1000000000n;
  const sinceNs = nowAppleNs - windowNs;

  let rows;
  try {
    rows = query(
      `SELECT m.ROWID AS rowid,
              datetime(m.date/1000000000 + ${APPLE_EPOCH_OFFSET_S}, 'unixepoch', 'localtime') AS local_time,
              m.is_from_me AS is_from_me,
              strftime('%s','now') - (m.date/1000000000 + ${APPLE_EPOCH_OFFSET_S}) AS age_s,
              h.id AS sender,
              m.text AS text,
              hex(m.attributedBody) AS body_hex
         FROM message m
         LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.date > ${sinceNs}
        ORDER BY m.date DESC
        LIMIT ${limit};`,
    );
  } catch (error) {
    const msg = String(error.stderr || error.message || error);
    if (/unable to open database|authorization denied|Operation not permitted/i.test(msg)) {
      console.error(
        'Cannot read ~/Library/Messages/chat.db. Grant Full Disk Access to the app running the agent ' +
          '(System Settings → Privacy & Security → Full Disk Access), then retry.',
      );
      process.exit(2);
    }
    console.error(msg.trim());
    process.exit(2);
  }

  const found = [];
  for (const row of rows ?? []) {
    if (row.is_from_me) continue;
    const text = (row.text && row.text.trim()) || decodeAttributedBody(row.body_hex);
    if (!text || !pattern.test(text)) continue;
    const codes = [...text.matchAll(/(?<!\d)(\d{4,8})(?!\d)/g)].map((m) => m[1]);
    found.push({ time: row.local_time, ageSeconds: row.age_s ?? null, sender: row.sender ?? '', text, codes });
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + waitSeconds * 1000;
let hits = collectHits();
while (hits.length === 0 && Date.now() < deadline) {
  if (!asJson) {
    console.error(`no code yet; re-checking for ${Math.ceil((deadline - Date.now()) / 1000)}s more...`);
  }
  await sleep(5000);
  hits = collectHits();
}

if (hits.length === 0) {
  if (asJson) console.log(JSON.stringify({ ok: false, windowMinutes: minutes, hits: [] }));
  else console.error(`No verification message in the last ${minutes} minute(s).`);
  process.exit(1);
}

if (asJson) console.log(JSON.stringify({ ok: true, windowMinutes: minutes, hits }, null, 2));
else {
  hits.forEach((hit, i) => {
    const age = hit.ageSeconds === null ? '' : `, ${hit.ageSeconds}s ago`;
    console.log(`${i === 0 ? '>' : ' '} [${hit.time}${age}] ${hit.sender} :: ${hit.text}`);
    if (hit.codes.length) console.log(`    candidate code(s): ${hit.codes.join(', ')}`);
  });
  if (hits.length > 1) {
    console.log(
      '\n  Newest first (marked ">"). Unless that one was already rejected, use it and ignore\n' +
        '  the rest — anything older than the code TTL (~5 min) cannot still work.',
    );
  }
}
