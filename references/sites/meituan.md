# 美团招聘 (zhaopin.meituan.com)

Status: `partial` — campus entry and job list confirmed; **login entry not yet located**, so
no account or resume work has been done.

## 1. Entry path

- `https://zhaopin.meituan.com/web/home` → marketing home. Nav: 首页 · LongCat人才招聘 ·
  北斗计划 · 社会招聘 · **校园招聘** · 美团赛事 · 了解美团.
- `校园招聘` → `校园招聘 | 美团招聘`, with programme tabs 应届校招 / 北斗计划 /
  LongCat大模型人才校招 / 食杂零售管培生计划 / 国际化校招 / 转正实习 / 日常实习.
- The list is live: **576 校招职位** with filters 所在城市 / 所在海外国家·地区 / 职位类别 /
  部门 / 招聘类型 / 招聘专场.

`/web/...` routes could not be read from the bundle: the entry file
(`s3.meituan.net/static-prod01/com.sankuai.recruitment.official.website/entry-main-<hash>.js`)
is only ~7KB and the real chunks are loaded through a Phoenix runtime from
`portal-portm.meituan.com`. Get the entry URL from the **rendered** DOM
(`browser_inspect html` → `window.PHOENIX_ASSETS`), not from `curl`, which returns a shell.

## 2. Login — not found yet

**No login control exists on the home page, the campus page, or the job list** — only an
avatar placeholder (`image "头像"`, no ref) in the header. Presumably login is triggered by
投递 or by clicking that avatar. Do not assume a `/web/login` route; find the trigger.

## 3. Resume form

Not reached. Expect it behind login (candidate centre).

## 4. Success signal

Not observed.

## 5. Wasted calls on the 2026-09-28 recon — do not repeat

- `curl` on `/web/home`: 34KB but every useful script is injected at runtime, so route
  grepping finds nothing. Read `window.PHOENIX_ASSETS` from the rendered DOM instead.
- Reading the whole campus page in the a11y: the job list is long and the job titles are
  bare `StaticText` with no refs, so the listing cannot be clicked through a11y refs.
