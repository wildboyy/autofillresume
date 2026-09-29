# 字节跳动 (ByteDance) campus recruiting

- **Entry**: ByteDance campus recruiting site -> 校园招聘 -> resume editor
- **Status**: partially verified. Login, navigation and single-field edits were confirmed;
  a full save was **not** completed, so treat the field inventory below as unconfirmed.
- **Stack**: Formily (React). Inputs are **bare** — no `name`, no `id`, no `placeholder` —
  so there is nothing to select on. Work purely from accessibility refs.

## Login

- Login state does **not** survive an agent session; expect to log in every run.
- The CAPTCHA is a **click-the-shapes puzzle** ("点击两个形状相同的物体") rendered in an
  iframe. It cannot be solved by reading a screenshot: the iframe exposes only
  关闭 / 刷新 / 反馈 and a token, and the puzzle image is a canvas with no coordinate
  click path. **Hand this off to the user** with `browser_assist request-help`.
- Because of that, ByteDance is not a fully unattended target. Budget one human step per
  run, and prefer to do all ByteDance work in a single visit so the login is reused.

## Verified behaviour

- The resume preview page is server-rendered, which makes it a reliable way to confirm a
  saved value: reload the preview and read the value back. A name change was confirmed
  this way (姓名 -> zzzz, with a 最近更新 timestamp).
- 期望工作地点 is a searchable multi-select. Searching a city that is not in the site's
  list returns 没有找到相关结果 — 苏州 did, while major cities resolved. Do not assume a
  city exists; verify by searching before selecting.
- Clearing and re-adding a value is easy to do by accident here; a refresh restored an
  accidentally cleared 期望工作地点. After every edit, reload and confirm.

## Approach

1. Hand the CAPTCHA to the user first, then fill without interruption.
2. Prefer `fill` for narrative fields; the Formily inputs that expose a real textbox are
   the cheap ones.
3. After each section, reload the resume preview and read the value back — this site gives
   no other reliable save signal.
4. Record the confirmed field inventory here on the next run, and flip this file to
   verified once a full save succeeds.

## Migrated from the pre-plugin Playwright era

This site was automated earlier with a standalone Playwright script (`src/` in the
workspace) before browser-skill existed. That script is retired, but the site facts it
established are still true and are recorded here so they are not rediscovered.

### Routes: `/resume` is a layout route and 404s

The route table (recovered from the site's JS bundle) does contain `path:"/resume"`, but it
is a **parent layout route that renders no page**. Visiting `/campus/resume` returns the
SPA's own 404. The real pages are its children:

```js
{ name: "Campus.MyResumePageTitle", path: "/resume", leafPaths: [
    { path: "/edit", component: $_ },   // -> /campus/resume/edit   resume editor
    { path: "/view", component: Ad },   // -> /campus/resume/view   read-only preview
    { path: "/application/:id" },
]}
```

- Resume editor: `https://jobs.bytedance.com/campus/resume/edit`
- Read-only preview: `https://jobs.bytedance.com/campus/resume/view`

Do not guess routes; when a path 404s, grep the bundles for the route table (same technique
as in `xiaomi.md` — it works on any SPA).

### Formily inputs carry no identifying attributes

```
div.ud-formily-item                 <- the form item; its label text lives inside
  ├─ (label div, e.g. "姓名*")
  └─ div.ud-formily-item-control → … → input.ud__native-input
```

The `input` is bare: **no `name`, no `id`, no `placeholder`**. The 姓名 and 邮箱 fields
compute to the *identical* CSS path:

```
div.ud__input.ud__input--size-lg > label.ud__input-input-wrap > … > input.ud__native-input
```

So structural/attribute selectors cannot tell fields apart — which is why the plugin's refs
(not CSS) are the right handle here, and why a CSS-based attempt fails even in the main
document. If you must locate by label: take the form item's own text **excluding nested
child items' text** (otherwise a group item like 基本信息 matches everything inside it),
prefix-match the target label, then descend to the inner `input`.

**Schema field names are not DOM attributes.** The injected `resume_form_schema` gives
business names (`name`, `mobile`, `email`, `identification`, `education_list`, …) but the DOM
has no `name="name"`. This mismatch is what made the first round of selectors fail entirely.

### Field inventory source

The resume editor's initial HTML embeds the entire form schema in a `<script>` element
(`resume_form_schema` / `resume_form_config`, **74 fields**). One `browser_inspect html` of
the page head reveals the field list and which are required — far cheaper than probing.
This is the same trick that made the Xiaomi form cheap.

### Ready signals

Never wait for network idle on this site (it holds long-lived connections). Wait for:

| Page | Ready signal |
| --- | --- |
| Job list / landing | `div.header-content` |
| Login page | `input[placeholder="手机号码"]` |
| Resume editor | `.ud-formily-item` |

### Login traps

- The login page has **two** 登录 elements: a header `<a>登录</a>` and the submit button.
  Target the submit button by its class (`button.loginSubmit`), not by text.
- 获取验证码 can be disabled with no visible explanation. Check and report its state first:
  a countdown means SMS rate limiting; no countdown with an empty consent box means consent
  was not ticked (**and a page reload resets it**); a slider on the page means human
  verification is still pending.
- The consent checkbox's real `input.atsx-checkbox-input` is hidden; clicking it fails.
  Click the visible `label.atsx-checkbox-wrapper`.
- A full-viewport AI-assistant guide appears on first visit per browser profile and its mask
  swallows every click. Dismiss it first (稍后再说). It does not reappear on later visits in
  the same profile — which is why it is easy to forget.

### No autosave

A value written without clicking 保存 reverts on reload. Useful (experiments are side-effect
free) but it also means a recycled session loses everything — save as you go.

## Open questions for the next run

- Which fields are actually required before the site will save?
- Does the site show a completeness percentage or a validation list (the trick that made
  the bank portal cheap)?
- Does the resume editor live inside an iframe? If so, note the nesting here.
