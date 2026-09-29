#!/usr/bin/env node
/**
 * Bootstrap a profile file from an existing resume.
 *
 * Onboarding must not start from a blank 100+ field template. This script does the
 * deterministic half: it reads a resume file, extracts text, rule-parses everything that
 * has a recognisable shape, writes a DRAFT profile, and prints exactly which keys are
 * still missing so the human only fills the remainder.
 *
 * Division of labour:
 *   - this script  -> labelled lines, dates, ID numbers, phones, emails, education entries
 *   - the model    -> free-form prose (internship/project descriptions, self-evaluation)
 *   - the human    -> private facts that are in no document (expected salary, referees)
 *
 * It never overwrites the live profile: the draft is a separate file that the user reviews
 * and renames. Extraction is lossy, so nothing here is confirmed until a human says so.
 *
 * Usage:
 *   node bootstrap-profile.mjs --file ~/Desktop/resume.pdf [--out <path>] [--force] [--json]
 *
 * Exit codes: 0 draft written, 1 input problem, 2 missing extractor, 3 output exists
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText } from './lib/extract-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(HERE, '..');
const WORKSPACE = resolve(SKILL_DIR, '..', '..', '..');
const SCHEMA = join(SKILL_DIR, 'references', 'profile-schema.md');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const asJson = process.argv.includes('--json');
const force = process.argv.includes('--force');

const inputPath = arg('file');
if (!inputPath) {
  console.error('Usage: node bootstrap-profile.mjs --file <resume> [--out <path>] [--force] [--json]');
  process.exit(1);
}
const outPath = resolve(arg('out', join(WORKSPACE, '简历信息-草稿.md')));

/* ---------------------------------------------------------------- schema keys */

/** Read the canonical key list out of the schema doc, so it stays the single source. */
function schemaKeys() {
  const keys = [];
  let inFence = false;
  for (const line of readFileSync(SCHEMA, 'utf8').split('\n')) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    const key = line.split('#')[0].trim();
    if (!key || !/^[^\s:]+$/.test(key)) continue;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}
const ALL_KEYS = schemaKeys();
const TEMPLATE_KEYS = ALL_KEYS.filter((k) => k.includes('N'));
const PLAIN_KEYS = ALL_KEYS.filter((k) => !k.includes('N'));
const FAMILIES = [...new Set(TEMPLATE_KEYS.map((k) => k.slice(0, k.indexOf('N'))))];

/* ------------------------------------------------------------------- parsing */

const LABELS = {
  姓名: '姓名', 名字: '姓名',
  性别: '性别',
  出生日期: '出生日期', 出生年月: '出生日期', 生日: '出生日期',
  年龄: '年龄',
  民族: '民族', 名族: '民族',
  政治面貌: '政治面貌',
  身高: '身高cm', 身高cm: '身高cm',
  体重: '体重kg', 体重kg: '体重kg',
  婚姻状态: '婚姻状态', 婚姻状况: '婚姻状态',
  籍贯: '籍贯', 出生地: '出生地',
  户籍: '户籍所在地', 户籍所在地: '户籍所在地',
  证件类型: '证件类型',
  证件号: '证件号码', 证件号码: '证件号码', 身份证号: '证件号码', 身份证号码: '证件号码',
  手机号: '手机号', 手机: '手机号', 移动电话: '手机号', 联系电话: '手机号', 电话: '手机号',
  邮箱: '电子邮箱', 电子邮箱: '电子邮箱', 邮件: '电子邮箱',
  备用邮箱: '备用邮箱',
  微信: '微信号', 微信号: '微信号',
  QQ: 'QQ号', QQ号: 'QQ号',
  现居住地址: '现居住地址', 居住地址: '现居住地址', 通讯地址: '现居住地址', 地址: '现居住地址',
  现居住城市: '现居住城市', 现居住国家: '现居住国家',
  '国家/地区': 'LOCATION_PATH', 国家地区: 'LOCATION_PATH', 所在地: 'LOCATION_PATH',
  英语水平: 'ENGLISH', 英语等级: 'ENGLISH',
  计算机水平: '计算机水平',
  职业资格证书: '职业资格证书',
  自我评价: '自我评价',
  特长及爱好: '特长及爱好', 兴趣爱好: '特长及爱好', 爱好: '特长及爱好',
  奖惩情况: '奖惩情况', 获奖情况: '奖惩情况', 荣誉奖项: '奖惩情况',
  // These describe the top degree but are printed outside the education blocks.
  最高学历: 'TOP_DEGREE', 最高学历毕业院校: 'TOP_SCHOOL',
  最高学历专业及方向: 'TOP_MAJOR', 最高学历毕业日期: 'TOP_GRAD',
};

/** Degree rank, used to decide which education entry the 最高学历* labels describe. */
const DEGREE_RANK = { 博士研究生: 4, 硕士研究生: 3, 大学本科: 2, 大专: 1, 高中: 0 };

/** Education sub-labels, resolved against the current education instance. */
const EDU_LABELS = {
  学校: '学校', 学校名称: '学校', 院校: '学校',
  学院: '学院', 院系: '学院',
  专业: '专业', 专业名称: '专业',
  学位: '学位',
  学历: '学历',
  教育类型: '学历类型',
  入学时间: '入学', 入学日期: '入学', 开始时间: '入学',
  毕业时间: '毕业', 毕业日期: '毕业', 结束时间: '毕业',
  是否是第一学历: '是否第一学历', 是否第一学历: '是否第一学历',
  GPA: 'GPA或排名', 绩点: 'GPA或排名', 排名: 'GPA或排名',
  主修课程: '主修课程',
  导师: '导师',
};

/** Repeatable-section sub-labels for the non-education families, mapped to schema fields. */
const REPEAT_LABELS = {
  实习: {
    公司: '公司', 单位: '公司', 公司名称: '公司',
    职位: '职位', 岗位: '职位', 职务: '职位',
    起止: '起止', 起止时间: '起止', 时间: '起止',
    内容: '内容', 工作内容: '内容', 实习内容: '内容', 描述: '内容',
    离职原因: '离职原因',
  },
  工作: {
    公司: '公司', 单位: '公司', 公司名称: '公司',
    职位: '职位', 岗位: '职位', 职务: '职位',
    起止: '起止', 起止时间: '起止', 时间: '起止',
    内容: '内容', 工作内容: '内容', 描述: '内容',
    离职原因: '离职原因',
  },
  项目: {
    名称: '名称', 项目名称: '名称',
    角色: '角色', 职位: '角色', 岗位: '角色',
    起止: '起止', 起止时间: '起止', 时间: '起止',
    链接: '链接', 地址: '链接', 网址: '链接',
    内容: '内容', 项目内容: '内容', 描述: '内容',
  },
  家庭: {
    关系: '关系', 与本人关系: '关系',
    姓名: '姓名', 名字: '姓名',
    工作单位: '工作单位', 单位: '工作单位',
    职务: '职务', 职位: '职务',
    联系电话: '联系电话', 电话: '联系电话',
  },
};

/** The label whose (re)appearance starts a new entry within each repeatable family. */
const REPEAT_PRIMARY = { 实习: '公司', 工作: '公司', 项目: '名称', 家庭: '关系' };

/** Schema fields per repeatable family, in schema order (for emitting rows and reporting missing). */
const REPEAT_FIELDS = {
  教育: ['学校', '学历', '学位', '专业', '学院', '学历类型', '是否最高学历', '是否第一学历', 'GPA或排名', '主修课程', '导师'],
  实习: ['公司', '职位', '起止', '内容', '离职原因'],
  工作: ['公司', '职位', '起止', '内容', '离职原因'],
  项目: ['名称', '角色', '起止', '链接', '内容'],
  家庭: ['关系', '姓名', '工作单位', '职务', '联系电话'],
};

const SECTION_HINTS = [
  { re: /教育(经历|背景|信息)|学历信息/, family: '教育' },
  { re: /实习(经历|信息)/, family: '实习' },
  { re: /工作(经历|经验|信息)/, family: '工作' },
  { re: /项目(经历|经验|信息)/, family: '项目' },
  { re: /家庭(情况|成员|信息)/, family: '家庭' },
];

const DEGREE_FROM_HEADER = [
  [/博士|博研/, '博士研究生'],
  [/硕士|研究生/, '硕士研究生'],
  [/本科|学士/, '大学本科'],
  [/专科|大专/, '大专'],
  [/高中|中专/, '高中'],
];

/** Normalise any common date spelling to YYYY-MM. */
function normMonth(s) {
  const t = String(s).trim();
  let m = t.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  m = t.match(/^(\d{4})$/);
  return m ? m[1] : '';
}

function stripMarkers(line) {
  return line
    .replace(/^[\s\-*•·　]+/, '')
    .replace(/^[\s\-*•·　]+/, '')
    .trim();
}

function parse(text) {
  const out = new Map();
  const provenance = new Map();
  const set = (key, value, from) => {
    if (!key || !value) return;
    if (out.has(key) && out.get(key)) return; // first win; do not let later noise overwrite
    out.set(key, value);
    provenance.set(key, from);
  };

  // Tier 1: patterns that need no label context.
  const idMatch = text.match(/\b\d{17}[\dXx]\b/);
  if (idMatch) set('证件号码', idMatch[0], 'pattern: 18-digit ID');
  const maskedText = idMatch ? text.split(idMatch[0]).join(' ') : text;
  const mobile = maskedText.match(/\b1[3-9]\d{9}\b/);
  if (mobile) set('手机号', mobile[0], 'pattern: mobile');
  const mail = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (mail) set('电子邮箱', mail[0], 'pattern: email');

  // Tier 2: labelled lines, with education instances tracked by position.
  let section = '';
  let eduIndex = 0;
  let yearBuffer = new Map(); // eduIndex -> {入学, 毕业}
  const eduValues = new Map(); // `${index}|${field}` -> value
  const pendingTop = new Map(); // 最高学历* labels, resolved after the blocks are known
  const familyIdx = new Map(); // family -> current instance index (non-education families)
  const familyValues = new Map(); // `${family}|${index}|${field}` -> value
  const setEdu = (index, field, value) => {
    const k = `${index}|${field}`;
    if (!value || eduValues.get(k)) return;
    eduValues.set(k, value);
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section headers (they also carry the degree level).
    let headerHit = false;
    for (const hint of SECTION_HINTS) {
      if (hint.re.test(line) && line.length <= 24) {
        section = hint.family;
        headerHit = true;
        if (section === '教育') {
          for (const [re, degree] of DEGREE_FROM_HEADER) {
            if (re.test(line)) {
              eduIndex += 1;
              setEdu(eduIndex, '学历', degree);
              break;
            }
          }
        }
        break;
      }
    }
    if (headerHit) continue;

    const body = stripMarkers(line);
    const sep = body.search(/[:：]/);
    if (sep <= 0) continue;
    const label = body.slice(0, sep).trim();
    const value = body.slice(sep + 1).trim();
    if (!value) continue;

    if (section === '教育' && EDU_LABELS[label]) {
      const field = EDU_LABELS[label];
      // A new 学校 label starts a new education entry.
      if (field === '学校') {
        if (eduIndex === 0 || eduValues.get(`${eduIndex}|学校`)) eduIndex += 1;
      }
      if (eduIndex === 0) eduIndex = 1;

      if (field === '入学' || field === '毕业') {
        const month = normMonth(value);
        if (month) {
          const buf = yearBuffer.get(eduIndex) ?? {};
          buf[field] = month;
          yearBuffer.set(eduIndex, buf);
        }
      } else {
        setEdu(eduIndex, field, field === '是否第一学历' ? value.replace(/^(是|否).*/, '$1') : value);
      }
      continue;
    }

    if (section !== '教育' && REPEAT_LABELS[section]?.[label]) {
      const field = REPEAT_LABELS[section][label];
      let idx = familyIdx.get(section) ?? 0;
      if (field === REPEAT_PRIMARY[section]) {
        if (idx === 0 || familyValues.get(`${section}|${idx}|${field}`)) idx += 1;
      }
      if (idx === 0) idx = 1;
      const k = `${section}|${idx}|${field}`;
      if (!familyValues.get(k)) familyValues.set(k, value);
      familyIdx.set(section, idx);
      continue;
    }

    if (LABELS[label]) {
      const mapped = LABELS[label];
      if (mapped === 'LOCATION_PATH') {
        // e.g. 中国-安徽省-合肥市-包河区 -> country + province/city
        const parts = value.split(/[-—>／/]+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 1) set('现居住国家', parts[0], `label: ${label}`);
        if (parts.length >= 3) set('现居住城市', `${parts[1]}${parts[2]}`, `label: ${label}`);
        else if (parts.length === 2) set('现居住城市', parts[1], `label: ${label}`);
        continue;
      }
      if (mapped === 'ENGLISH') {
        // "CET-6，430 分" carries both the level and the score.
        const m = value.match(/^([A-Za-z][A-Za-z0-9-]*)\s*[，,、]?\s*(.*)$/);
        set('英语水平', m ? m[1] : value, `label: ${label}`);
        if (m && /\d/.test(m[2])) set('英语补充水平说明', m[2].trim(), `label: ${label}`);
        continue;
      }
      if (mapped.startsWith('TOP_')) {
        pendingTop.set(mapped.slice(4), value);
        continue;
      }
      set(mapped, value, `label: ${label}`);
    }
  }

  // Tier 3: fold education buffers into the schema's template keys.
  //
  // Resumes list education in either order, but every recruiting portal and the profile
  // file itself use "most recent first". Sort by start date descending so the draft lands
  // in the convention the sites expect, instead of inheriting the resume's layout.
  const discovered = Math.max(eduIndex, ...[...yearBuffer.keys()], 0);

  // The 最高学历* labels describe the highest-ranked education entry, wherever it sits.
  // Resolved here because both the instance count and each entry's 学历 must be known.
  if (pendingTop.size > 0) {
    let best = 0;
    let bestRank = -1;
    for (let i = 1; i <= discovered; i += 1) {
      const rank = DEGREE_RANK[eduValues.get(`${i}|学历`)] ?? -1;
      if (rank > bestRank) {
        bestRank = rank;
        best = i;
      }
    }
    if (best === 0) best = discovered || 1;
    const topMap = { DEGREE: '学历', SCHOOL: '学校', MAJOR: '专业', GRAD: '毕业' };
    for (const [field, value] of pendingTop) {
      const target = topMap[field];
      if (!target) continue;
      if (target === '毕业') {
        const month = normMonth(value);
        if (month) {
          const buf = yearBuffer.get(best) ?? {};
          buf.毕业 = buf.毕业 ?? month;
          yearBuffer.set(best, buf);
        }
      } else {
        setEdu(best, target, value);
      }
    }
  }
  const ordered = Array.from({ length: discovered }, (_, i) => i + 1).sort((a, b) => {
    const sa = yearBuffer.get(a)?.入学 ?? '';
    const sb = yearBuffer.get(b)?.入学 ?? '';
    if (sa && sb) return sb.localeCompare(sa);
    if (sa) return 1; // entries with a start date come first
    if (sb) return -1;
    return a - b;
  });

  ordered.forEach((from, position) => {
    const i = position + 1;
    for (const field of ['学校', '学历', '学位', '专业', '学院', '学历类型', '是否最高学历', '是否第一学历', 'GPA或排名', '主修课程', '导师']) {
      const v = eduValues.get(`${from}|${field}`);
      if (v) set(`教育${i}${field}`, v, 'section: 教育');
    }
    const buf = yearBuffer.get(from);
    if (buf?.入学 || buf?.毕业) {
      const span = [buf.入学 ?? '', buf.毕业 ?? ''].join(' ~ ').trim();
      if (span !== '~') set(`教育${i}起止`, span, 'section: 教育');
    }
  });

  for (const fam of ['实习', '工作', '项目', '家庭']) {
    const count = familyIdx.get(fam) ?? 0;
    for (let i = 1; i <= count; i += 1) {
      for (const field of REPEAT_FIELDS[fam]) {
        const v = familyValues.get(`${fam}|${i}|${field}`);
        if (v) set(`${fam}${i}${field}`, v, `section: ${fam}`);
      }
    }
  }

  const familyCounts = {
    教育: discovered,
    实习: familyIdx.get('实习') ?? 0,
    工作: familyIdx.get('工作') ?? 0,
    项目: familyIdx.get('项目') ?? 0,
    家庭: familyIdx.get('家庭') ?? 0,
  };
  return { out, provenance, eduInstances: discovered, familyCounts };
}

/* -------------------------------------------------------------------- write */

const extracted = extractText(inputPath);
if (!extracted.ok) {
  console.error(extracted.message);
  process.exit(extracted.code);
}

const { out, provenance, eduInstances, familyCounts } = parse(extracted.text);

if (existsSync(outPath) && !force) {
  console.error(
    `Draft already exists: ${outPath}\n` +
      'Refusing to overwrite a file the user may have edited. Pass --force, or --out a different path.',
  );
  process.exit(3);
}

const filledKeys = [...out.keys()];
const missingPlain = PLAIN_KEYS.filter((k) => !out.has(k));
const missingRepeat = [];
for (const fam of FAMILIES) {
  const count = familyCounts[fam] ?? 0;
  const rows = count > 0 ? count : 1;
  for (let i = 1; i <= rows; i += 1) {
    for (const field of REPEAT_FIELDS[fam]) {
      const key = `${fam}${i}${field}`;
      if (!out.has(key)) missingRepeat.push(key);
    }
  }
}

const header = [
  `# 由 bootstrap-profile.mjs 从「${extracted.file}」自动生成`,
  `# 抽取方式: ${extracted.via}`,
  `# 注意: ${extracted.warning}`,
  '# 状态: 未经逐项确认。核对补全后再用于填表，确认后建议改名为 简历信息-解析版.md',
  '# 空值 = 未知，不是"无"；答案确实为"无"时请显式写 无',
  '',
].join('\n');

const lines = [];
for (const key of ALL_KEYS) {
  if (key.includes('N')) continue;
  lines.push(`${key}: ${out.get(key) ?? ''}`);
}
const emitted = new Set();
for (const fam of FAMILIES) {
  const count = familyCounts[fam] ?? 0;
  const rows = count > 0 ? count : 1; // always show at least one template row per family
  for (let i = 1; i <= rows; i += 1) {
    for (const tpl of TEMPLATE_KEYS) {
      if (!tpl.startsWith(fam)) continue;
      const key = tpl.replace('N', String(i));
      if (emitted.has(key)) continue;
      emitted.add(key);
      lines.push(`${key}: ${out.get(key) ?? ''}`);
    }
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${header}${lines.join('\n')}\n`, 'utf8');

const report = {
  ok: true,
  source: extracted.file,
  via: extracted.via,
  warning: extracted.warning,
  draft: outPath,
  keysInSchema: ALL_KEYS.length,
  filled: filledKeys.length,
  filledKeys,
  provenance: Object.fromEntries(provenance),
  educationInstances: eduInstances,
  repeatableFamilyCounts: familyCounts,
  missing: [...missingPlain, ...missingRepeat],
  repeatableFamilies: FAMILIES,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`source     ${extracted.file}  (${extracted.via})`);
  console.log(`draft      ${outPath}`);
  console.log(`filled     ${filledKeys.length} / ${ALL_KEYS.length} schema keys  (education entries: ${eduInstances})`);
  console.log(`\n已自动解析:`);
  for (const k of filledKeys) console.log(`  ${k}: ${out.get(k)}   <- ${provenance.get(k)}`);
  console.log(`\n仍需人工填写 (${report.missing.length} 项):`);
  console.log(`  ${report.missing.join('、')}`);
  console.log(`\n可重复小节（教育/实习/工作/项目/家庭）按实际段数自行复制模板行：`);
  console.log(`  ${FAMILIES.join('、')}`);
  console.log(`\n提醒: 抽取可能有损（见上方 warning）。这是草稿，必须让用户逐项核对后才能用于填表。`);
}
