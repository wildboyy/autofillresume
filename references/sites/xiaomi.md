# 小米 (Xiaomi) — Moka ATS on `xiaomi.jobs.f.mioffice.cn`

Status: `verified` — 2026-09-27 run logged in, created the resume by uploading the PDF,
repaired the fields the parser drops, and saved. A 2026-09-28 audit pass closed the last
gap (project 起止时间) through the calendar picker. Success signal observed both times.

## 1. Entry path

Everything real lives on the Moka tenant. Do not spend calls on `hr.xiaomi.com` (a static
funnel with no login of its own).

- `https://xiaomi.jobs.f.mioffice.cn/campus` → job list; `登录` sits top-right.
- The account button (`1585****203`) is **not** in the accessibility tree's dropdown
  order — clicking/hovering it changes nothing observable. Do not hunt for a 个人中心 menu.

### Routes: read them from the bundle, never guess

`/campus/personal` and `/campus/resume` both render the SPA's own **404**
(`您正在寻找的页面不存在`). One call each, both wasted. The route table is in the page's
JS bundles:

```bash
curl -s https://xiaomi.jobs.f.mioffice.cn/campus -o xm.html
grep -oE 'src="[^"]+\.js[^"]*"' xm.html           # bundle URLs (feishucdn)
# then grep the downloaded bundles:
grep -ohE 'path:"[^"]{0,40}"' b_*.js | sort -u
```

The resume subtree is `fo=[{path:"/resume", leafPaths:[{path:"/edit"},{path:"/view"},…]}]`.
Relative to the site path `campus`:

| Page | URL |
| --- | --- |
| **Create / edit resume** | `https://xiaomi.jobs.f.mioffice.cn/campus/resume/edit` |
| Read-only resume | `https://xiaomi.jobs.f.mioffice.cn/campus/resume/view` |
| My applications | `/campus/application` |

## 2. Login

`/campus` → `登录` → `/campus/login`. Plain top-level form, no iframe, refs work.

| Field | Control |
| --- | --- |
| `+86` | combobox |
| `手机号码` | textbox — `fill` works directly |
| `验证码` | textbox |
| `获取验证码` | button, `disabled` until phone + consent |
| consent | checkbox |
| `登录` | button |

1. `fill` the phone from `手机号` in the profile, `click` the consent checkbox.
2. `click` `获取验证码` → a **drag-to-fit slider CAPTCHA** opens in an iframe
   (`L1 modal cover=100% / Iframe`). The plugin has no drag action → hand off with
   `browser_assist request-help`.
3. When it passes, the button flips to `重新获取(NNs)`. That countdown is your proof the
   SMS was dispatched — check for it instead of assuming.
4. Read the code with `node scripts/read-sms-code.mjs --wait 180`. Keep the default
   5-minute window — it is a freshness filter matched to the code TTL, and widening it
   only lets an expired code compete with the live one.

**Do not set `completionCriteria` on that help request.** A `{textMissing:…}` criterion
fired instantly and dismissed the dialog before the human could touch it (hit on
2026-09-27). Pass no criterion and let the human close it.

Delivery lag is real: dispatched 18:01:12, arrived 18:01:48. `--wait` exists for this.

## 3. The resume form (`/campus/resume/edit`)

The initial HTML embeds the entire form schema in `<script id="js-websiteInfo">`
(`resume_form_schema` / `resume_form_config`). One `browser_inspect html` of the page head
tells you which sections and fields are required — cheaper than probing. Required:
`resume_attachment`, `basic_info` (name/mobile/email), `education`; `career`, `project`,
`works`, `award`, `language`, `sns` are optional at section level. Fields with
`visible:false` (工作年限, 出生日期, 国籍) do not render at all.

### Do the attachment first — it is required *and* it autofills

Upload the PDF (human step, `browser_assist request-help` with the absolute path). Moka
parses it and fills education, internships, projects and awards, then reports
`上传并解析完成`.

**The parse resets `年龄`, `个人证件` and `所在地点`.** Re-observe and re-enter them after
the parse; do not trust values you set before it.

Verified outcome of the parse: education ×2, internships ×3 with full descriptions,
awards ×2. It left `项目经历`, `作品`, `语言能力` empty and `自我评价` blank.

### Section inventory — there is no 工作经历

Read the section list off the **skeleton** state (it renders every section, empty ones
included) — cheaper and more complete than the loaded tree:

> 附件简历 · 基本信息 · 教育经历 · 实习经历 · 项目经历 · 作品 · 获奖 · 语言能力 · 自我评价

This tenant's campus template does **not** render 工作经历, even though Moka's schema
defines a `career` section. Full-time history has nowhere to go — it has to live in the
uploaded PDF.

### Repeatable sections (项目经历 / 作品 / 获奖 / 语言能力)

- Each item ends in a control pair: the **add** is
  `<div class="formOperate-addBtn addMore__d36c7e">`, the **remove** is
  `.formOperate-removeBtn`; in a pair the add comes first.
- **In an empty section the add control is inert `StaticText "添加"` with no ref**, and
  `.formOperate-addBtn` matches the *first* one on the page (education's) — so a bare
  click silently appends a stray education row. These need one human click via
  `browser_assist request-help`; once the row exists its fields are reachable normally.
  `项目经历` and `语言能力` were added this way on 2026-09-27.
- The control pairs are **not siblings**, so the `~` combinator cannot index them.

### Selector cheat-sheet

The a11y tree is unreliable here: it drops the controls for 邮箱/性别 and does not expose
the children of the nested country tree. Where a ref is missing, use CSS (the form is in
the main document):

| Field | Selector |
| --- | --- |
| 姓名 | `#name` (also `[data-cy="nameInput"]`) |
| 邮箱 | `#email` |
| 年龄 | `#age` |
| 所在地点 combobox | `[data-cy="current_cityInput"]`, search input `#currentCityCode` |
| 家乡 combobox | `[data-cy="hometown_cityInput"]`, search input `#hometownCityCode` |
| 证件类型 | ref only (combobox `中国 - 居民身份证`) |
| 保存 | `button.atsx-btn-primary` — label is `保存` when editing, `完成` on first create |

### 所在地点 / 家乡: an `atsx-tree` left in the DOM

These are drill-down tree-selects, not cascaders: 中国大陆 → 安徽 → 合肥. Three traps:

1. **Clicking a label selects, it does not expand.** You must click the caret:
   `li:has(> .atsx-tree-node-content-wrapper [data-cy-value="安徽"]) > .atsx-tree-switcher`.
2. **The closed dropdown stays in the DOM**, so a bare `[data-cy-value="…"]` resolves to
   the *hidden* copy and fails with `element not visible`. Scope every click:
   `.atsx-select-dropdown:not(.atsx-select-dropdown-hidden) …`.
3. The displayed value is the leaf (`合肥`), not a joined path.

The filter box (`#currentCityCode`) accepts typed text but sits on `搜索中` forever — do
not rely on it.

### 起止时间 date fields (`atsx-date-picker-period-month`)

The visible `YYYY - MM` is **not** a `placeholder` attribute. `input[placeholder="YYYY - MM"]`,
`input[placeholder="YYYY - MM"]:placeholder-shown`, and every id guess
(`project[0].start_time`, `…time_period`, `…time_period[0]`) all miss, and `fill` on the
mirror textbox sets nothing. The label itself is the only handle:

```
[data-cy="project[0].periodInputBegin"]   # and …periodInputEnd
```

Click it, then walk the picker. The panel is a two-column portal: **years (newest → 1900)
first, then months `01`–`12`**, and it renders at the very end of the a11y tree — *after*
the `保存` button. Budget several cursor reads; the year column alone is ~127 nodes, so cap
`maxTokens` and page through rather than reading it whole.

1. click the `…Begin` label, then the year, then the month → the label shows `2025 - 02`;
2. the panel re-anchors to `…End` by itself; repeat to set the end;
3. refs survive the year click (the panel re-renders identically), but a month cell
   scrolled out of view fails with `element not visible` — re-observe rather than reuse.

Education and internship 起止时间 use the same control, so the recipe generalises.

## 4. Success signal

The route flips from `创建简历` / `编辑简历` to the read-only **`我的简历`** page
(`RootWebArea "我的简历 - 小米校园招聘"`) with a `最近更新 : <timestamp>` line. Absence of
a validation error is not success; require the page change.

**The view page is not a complete mirror of what was saved.** It does not render
`职位名称` for 实习经历 (the values are stored — check the edit page before concluding a
field is empty), and it omits sections that have no items at all. Audit against the edit
page, not the view.

## 5. Wasted calls on the 2026-09-27 run — do not repeat

- Guessing `/campus/personal` and `/campus/resume`: two 404s. Read the bundle.
- Hunting for an account dropdown: 3 observes, nothing in the tree.
- Trying `[title="中国大陆"]`, `.atsx-cascader-menu-item`, `body > div:last-child …`:
  wrong guesses at markup that `browser_inspect html ref=<treeitem>` reveals in one call.
- `#6b8ea05e-…` from `aria-controls`: that id is referenced but never set in the DOM.
- A digit-leading id in a CSS selector (`#6b8ea0…`) throws `DOM Error while querying`;
  use `[id="…"]` if you ever need it.
- Paging the full 200-country a11y tree: never needed once the switcher selector worked.
- **2026-09-28.** Four CSS guesses at the date field (`…start_time`, `…end_time`,
  `…time_period[0/1]`, `input[placeholder="YYYY - MM"]`) — the label carries no placeholder
  attribute. Go straight to `[data-cy="…periodInputBegin"]`.
- Clicking `.formOperate-addBtn` to open 项目经历 matched *education's* add and appended a
  stray row. Recover via that item's `.formOperate-removeBtn`, then hand the click off.
- Reading the view page and concluding 实习 `职位名称` was empty — it had been saved all
  along; the view template just omits it.
