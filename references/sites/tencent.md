# 腾讯校招 (join.qq.com)

Status: `verified` — 2026-09-28: logged in with WeChat, reached the editor, filled the four
empty GPA fields and saved. Success signal observed (§4). The account already held a
maintained resume, so only the empty fields were touched.

## 1. Entry path

`https://join.qq.com` is a marketing page. The account dropdown's own command list gives the
real routes (grep them out of the bundle — see §5):

| Page | URL |
| --- | --- |
| **My resume (view)** | `https://join.qq.com/resume.html` |
| Application progress | `/progress.html` |
| Account | `/account.html` |
| Login page | `/login.html?state=…` |

`resume.html` opens with a **full-viewport hero** (`L1 mask cover=100%`). The tree is
actionable as-is, but the resume body only appears after **one or two `wheel deltaY 900`** —
expect to scroll twice before the resume content is in the tree.

## 2. ⚠️ Login: QQ and WeChat are TWO DIFFERENT ACCOUNTS

This is the single most expensive trap on this site. `登录` offers only social login —
**QQ账号登录** and **微信账号登录** — and they create *separate* accounts with separate
resumes. The browser already had a QQ session, so the 2026-09-28 run took the easy path and
landed on:

| | QQ account | WeChat account (the one the user actually uses) |
| --- | --- | --- |
| resume id | 20××××39 | **21××××81** |
| last updated | 2021-08-06 | **2026-09-08** |
| completeness | 33% | **66%** |
| 姓名 | (empty) | filled (see profile `姓名`) |
| 帆软 full-time job | absent | present |

**Ask the user which entrance to use before logging in** — do not pick whichever session is
already live. Confirm by reading the nav (`你好，<nickname>`) and the resume id/completeness
after entering; a stale account looks like a broken product.

- Consent is an Element-UI checkbox: the ref click fails with `element not visible`. Click
  `.el-checkbox__inner` instead, then the login button.
- **QQ quick-login pushes a confirmation to the phone QQ app** ("请打开QQ手机版，确认登录") —
  a human step. The help request timed out at 10 min but the login completed anyway, so
  re-observe before re-requesting.
- **WeChat quick-login succeeded from the existing browser session in one click** — it shows
  the nickname and avatar and asks nothing else. Verify the nickname with the user first.

## 3. The resume editor

`resume.html` → `编辑` → `简历编辑` (no URL change; same SPA page). It renders these sections:

> 内推串码 · 简历附件 · 基础信息 · 意向信息 · 教育经历 · 实习经历 · 项目经历 · 获奖信息 ·
> AI应用技能 · 语言能力 · 作品或个人主页 · 资料证明人 · 其他关键信息

**A `岗位已下架，请重新选择岗位` modal is NOT a product gate.** On the stale QQ account both
its buttons (确认 and an unnamed close X) bounced to 岗位投递, which made it look like "you
must apply before you can edit". On the correct account the editor opens clean with no modal.
Diagnose the account before concluding anything about the flow.

### Locked fields

国家/地区, 个人证件类型 and 证件号码 are `[disabled]` and the page states
**`简历提交成功后无法自助修改`** (changes need an email to `campus@tencent.com`). 内推串码 is
also disabled once a resume has been submitted. Treat the identity block as read-only.

### Observed gaps on the maintained (WeChat) account

`个人照片` (upload, ≤300KB jpg/png) · `GPA-GPA` · `GPA-BASE` · `实验室` · `AI应用技能` = 无 ·
`作品或个人主页` = 无 (though a CSDN 个人主页链接 exists) · `研究方向`.

### The account's data disagrees with the local profile

**Reconcile before filling anything.** Five fields differ between this site's own account
data and the local profile:

| Field | Which side looks authoritative |
| --- | --- |
| 紧急联系人 (name and number) | account |
| 当前所处地 | account |
| 硕士奖学金 排名档位 | account |
| 学业奖学金 年份区间 | account |
| 期望工作城市 列表 | account |

The site account and the PDF uploaded to it agree with each other, so the profile file is the
outlier and is probably the stale copy. **That implies the profile is wrong on other sites
too** — treat this as a profile-accuracy bug, not a Tencent quirk.

The concrete values are personal data, so they live in the workspace file `档案待核对.md`
(handbook C2), never in this deliverable. Decide which set is correct, fix the profile, and
leave only this field-level description here.

## 4. Success signal

Saving does **not** navigate away — the page stays on `简历编辑`, so an unchanged-looking
page is not failure. The real signal lives on `resume.html`:

- `最近更新时间` advances to today (2026-09-08 → 2026-09-28 on the verified run);
- newly filled fields show up as new rows — the two `GPA x/y` lines were absent before.

`简历完善程度` did **not** move (66% → 66%) even though the save landed, so do not treat it
as the success signal.

Save path: `button.el-button--primary` (Element-UI) → a `确认保存简历吗？` modal → click 确认.

Filling notes:

- The two GPA pairs use **identical placeholders** (`请输入你的绩点` /
  `请输入你所在院校的满绩绩点`), one pair per education block. A plain selector hits
  当前教育经历 first; once that pair is filled,
  `input[placeholder="…"]:placeholder-shown` targets 先前教育经历-1 exactly.
- 个人照片 needs a human: the plugin has no upload action, and 腾讯 caps the file at **300KB**
  (`sips -s format jpeg -s formatOptions 82 in.png --out out.jpg` took a 383KB PNG to 116KB).
- The remaining optional blanks (实验室 / 研究方向 / 论文 / AI应用技能) had no source data and
  were left empty.

**The form is long and the idle reaper eats unsaved state — collect every user-supplied
value *before* opening the editor, then fill and save in one uninterrupted burst.** On
2026-09-28 a first pass filled the GPAs, then parked while waiting on the user; the session
was reaped (~10 min) and the whole fill was lost.

## 5. Finding routes cheaply

The bundle is at `cdn.multilingualres.hr.tencent.com/joinqq/static2/js/p_zh-cn_index.build.js`
and **returns 0 bytes without a `Referer: https://join.qq.com/`**. Once fetched:

```bash
grep -ohE '"[a-zA-Z0-9_/-]{1,40}\.html"' qq.js | sort -u   # all page routes
grep -ohE 'command":"[a-zA-Z0-9_./-]{2,40}"' qq.js         # account-dropdown commands
```

The dropdown itself never appears in the accessibility tree (Element-UI `el-dropdown`, hover
only) — reading its `command` list from the bundle is cheaper than hunting for it.

## 6. Wasted calls on the 2026-09-28 run — do not repeat

- Clicking `登录` then the account button to find the resume: the dropdown is invisible to the
  a11y. Grep the bundle instead.
- Concluding "腾讯 requires an application before you can edit the resume": wrong, it was the
  stale account's delisted position.
- Repeated `wheel` before `observe` on `resume.html`: one wheel is not enough; the hero needs
  two before the resume body enters the tree.
