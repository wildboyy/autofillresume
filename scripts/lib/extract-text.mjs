/**
 * Shared resume text extraction.
 *
 * Kept in one place so `extract-resume.mjs` (print for the model) and
 * `bootstrap-profile.mjs` (parse into a draft profile) cannot drift apart.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';

const OFFICE_EXT = ['.docx', '.doc', '.rtf', '.html', '.htm', '.odt', '.wordml'];
const TEXT_EXT = ['.md', '.markdown', '.txt', '.text'];

export function expandPath(p) {
  const expanded = p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export function hasBin(bin) {
  try {
    return execFileSync('/bin/sh', ['-lc', `command -v ${bin}`], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Extract plain text from a resume file.
 * @returns {{ok: true, text: string, via: string, warning: string, bytes: number}
 *          | {ok: false, code: number, message: string}}
 */
export function extractText(inputPath, { maxChars = 200000 } = {}) {
  const file = expandPath(inputPath);
  if (!existsSync(file)) return { ok: false, code: 1, message: `Resume file not found: ${file}` };
  const size = statSync(file).size;
  if (size === 0) return { ok: false, code: 1, message: `Resume file is empty: ${file}` };

  const ext = extname(file).toLowerCase();
  let text = '';
  let via = '';
  let warning = '';

  try {
    if (ext === '.pdf') {
      if (!hasBin('pdftotext')) {
        return {
          ok: false,
          code: 2,
          message:
            'pdftotext not found (ships with poppler). macOS: brew install poppler.\n' +
            'Or ask the user to export the resume as .docx / .txt.',
        };
      }
      text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      via = 'pdftotext -layout';
      warning = 'PDF text extraction is lossy and can reorder columns or split lines mid-word.';
    } else if (OFFICE_EXT.includes(ext)) {
      if (!hasBin('textutil')) {
        return { ok: false, code: 2, message: 'textutil not found (macOS only). Ask for .txt or .md instead.' };
      }
      text = execFileSync('textutil', ['-convert', 'txt', '-stdout', file], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      via = 'textutil -convert txt';
      warning = 'Office/HTML conversion drops tables and text boxes; check for missing sections.';
    } else if (TEXT_EXT.includes(ext)) {
      text = readFileSync(file, 'utf8');
      via = 'direct read';
    } else {
      return {
        ok: false,
        code: 1,
        message:
          `Unsupported extension "${ext || '(none)'}". Supported: .pdf ${OFFICE_EXT.join(' ')} ${TEXT_EXT.join(' ')}\n` +
          'Ask the user to export the resume as PDF or plain text.',
      };
    }
  } catch (error) {
    return { ok: false, code: 1, message: `Extraction failed: ${String(error.stderr || error.message).slice(0, 400)}` };
  }

  text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length === 0) {
    return {
      ok: false,
      code: 1,
      message:
        'Extracted no text. The file is probably a scanned image.\n' +
        'Ask for a text-based version, or read the fields off the image with an image-capable model.',
    };
  }
  const truncated = text.length > maxChars;
  return {
    ok: true,
    file,
    bytes: size,
    via,
    warning,
    truncated,
    chars: text.length,
    text: truncated ? text.slice(0, maxChars) : text,
  };
}
