# Browser playbook

Generic mechanics for driving a form through the `browser-skill` plugin. Site files in
`references/sites/` only record what is *site-specific*; anything reusable belongs here.

## 0. Entry: take the final URL, skip the funnel

Decide the entry URL before you decide anything about the page. Most recruiting sites put a
marketing funnel in front of the real application system, and the funnel is usually
skippable. Every call spent inside it buys nothing.

- **The CTA link carries its destination.** One `observe` on the marketing page shows it:
  `@e9 link "立即加入" [→ xiaomi.jobs.f.mioffice.cn]`. Read the host, then navigate straight
  to the application origin in a fresh session and never return to the funnel.
- Worked example, measured: `hr.xiaomi.com` is a static page (`/website/campus.html`, no
  login of its own — `/login` redirects off-site to `mi.com`). The real system is the Moka
  ATS at `https://xiaomi.jobs.f.mioffice.cn/campus`, which owns the `登录` entry. Entering
  at the top cost ~10 calls; entering at the ATS costs 3 calls to reach the login form.
- **Do not guess routes to find the destination.** `/campus/position` -> 404, `/login` ->
  redirect to `mi.com`: two wasted calls. Read the link you already hold instead.
- After a cross-origin CTA click the owned session can vanish
  (`no active browser sessions`, then `session "..." does not belong to this plugin`).
  Do not chase the link through the browser; start a session on the final origin.

**A page that reports itself as blocked is often just a full-viewport hero.**
`L1 mask cover=100%` on the first observe, together with
`L2 page … occluded by L1 (~440 nodes, not actionable)`, does **not** mean a modal covers
the form. It means the visible layer fills the viewport and the rest of the tree sits below
the fold. Cheapest fix, in this order:

1. `wheel deltaY ~900`, then `observe` once — the tree collapses to a single `L1 page`
   carrying every ref, and the real content (CTAs, project blocks, sections) appears.
2. Only if that fails: scoped `screenshot` of the suspected mask, then decide.

Do **not** open with a full-page screenshot, `Escape`, or a web search for the real URL. On
the Xiaomi run that order cost ~10 calls to reach a fix that was one scroll.

## 1. The cost model, and why it drives every choice

Each browser call is one model request that re-sends the entire conversation. A form-fill
run issues hundreds of them, so **the number of calls is the cost**, not the size of this
document. Measured baseline on one real run (bank portal + campus site): 686 requests,
~148M estimated input tokens, ~294k output.

Practical rules:

- `browser_inspect observe` is the expensive call. Treat each one as a purchase.
- **Act several times per observation.** Refs stay usable across actions that do not
  change the accessibility tree (fill, press). Re-observe only after an action that
  adds/removes nodes (opening a menu, selecting an option, opening a date panel).
- **Always pass `maxTokens`.** Without it you get the whole tree. The tree order is:
  page nav -> section list -> summary paragraph -> form fields -> dropdown options
  (rendered next to their field) -> footer. Cap at what you need.
- **A ref-scoped `screenshot` is cheap**: `browser_inspect screenshot ref=@eN` returns a
  small crop (~448x64) and is the right way to confirm one field's value. A full-page
  screenshot is ~10x that; use it only to judge layout or scroll position.
- **Batch calls.** Several `click`/`press` calls in one message execute in order. This is
  how you type a value, and how you walk a multi-level menu.
- **Never re-observe "to check".** Verify with a scoped screenshot instead.
- `browser_inspect observe cursor=<cursor>` continues a truncated read. It costs the same
  as a fresh observe, so only use it when you genuinely need the tail.

## 2. Refs: how they behave

- A ref such as `@e17` is bound to the observation that produced it. After the tree
  changes, refs die (`unknown` / `element not visible`) or, worse, resolve to the
  *position* of whatever now sits there. A stale ref can therefore click the wrong thing.
- Consequence: **after every tree-changing action, re-observe before the next click.**
- Refs are only assigned to interactive nodes. Inside an open dropdown, the field button
  is `F` and the options are `F+1`, `F+2`, ... in list order. This is only valid for the
  observation you are holding; useful when one observe already showed both.
- Refresh cadence that works: `observe -> click -> observe -> click option -> act -> act`.

### Ref hazards confirmed the hard way

Each of these produced a real wrong value or a wasted call during testing. Treat them as
hard rules.

1. **A new observation replaces every ref.** Refs from an earlier observation fail with
   `unknown`, and refs from a *different* tree state can silently resolve to the wrong
   element. Never mix refs across observations.
2. **`maxTokens` truncation withholds refs it did not print.** The shortcut "the option is
   the field's ref plus k" only works for options that were actually emitted. Reading with
   `maxTokens: 1300` and then clicking a predicted `@e48` fails with `ref unknown`.
3. **Do not batch "click to open a dropdown" with "click the option."** The option list
   may not be rendered when the second click fires, so it lands on whatever is at those
   coordinates. Sequence it as click -> observe -> click.
4. **After selecting an option, re-verify the next field's ref instead of assuming the
   numbering reverted.** It usually reverts, but the base numbering shifts whenever an
   earlier node appears or disappears — for example, once the photo upload slot is
   filled, one ref disappears and every later field moves up by one. During testing this
   assumption set 民族 to 回族 when 满族 was intended.
5. **`press` does not honour modifier combos.** `press "Meta+a"` reports success but types
   a literal `a`, which on an editable field inserts an unwanted character. There is no
   select-all shortcut; clear fields with `End` plus `Backspace` per character.

## 3. Control taxonomy

### A. Real `textarea` / `input` (exposed as `textbox`)
Use `fill` directly. Multi-line narrative fields are the cheapest fields in the form:
one call each. **Check for a textbox ref before assuming a field is hard.**

### B. Input wrapped so the a11y tree reports `button` (Element Plus style)
`fill` fails with `element DIV not fillable`. These are fillable anyway:

1. `click` the field ref — this focuses the real inner `<input>`;
2. `press` **one character per call**.

`press` accepts a single key or combo. It handles digits, letters and CJK (`press 无`),
and the punctuation that URLs need (`: / . ? =`). It rejects multi-character strings:
`press "13000000000"` fails with `unknown key`. So a phone number is 11 calls — still far
cheaper than one wasted observe.

Clearing such a field: `press End`, then `press Backspace` once per character. Clicking
the field's clear icon also works — that icon sits at the **right edge** of the field, so
a click near the right end clears instead of focusing.

### C. Single select
`click` the field, then read the options from the *same* observation you already have if
the list is in it; otherwise `observe` once, then click the option. Options render in the
tree immediately after the field.

Selecting by keyboard works too: `click` field, `ArrowDown` xN, `Enter`. This saves an
observe when you already know the option's position.

### D. Multi-select (toggles, keeps the panel open)
- Typing into the field filters the list (the field is usually filterable).
- **Do not press `ArrowDown` after filtering.** It activates the first entry of the
  *unfiltered* list, so `Enter` selects the wrong value. This produced a wrong
  certificate value on a real run.
- Correct sequence: `click` field -> `press` the filter text -> `observe` -> `click` the
  single remaining option.
- Removing an existing tag: clicking the **right end** of the tag hits its `×`. Focusing
  the inner input and pressing `Backspace` may not remove it.

### E. Cascader (multi-level picker)
Click through one level at a time; only leaves are selectable. Sub-level options are
inserted into the tree right after the parent level's last entry, so they get the next
refs. Expect provinces -> cities -> districts, and for things like "专业类别" expect three
levels (category -> group -> major). Budget one observation per level.

### F. Date pickers
1. `click` the field -> panel appears with `前一年` / `<year> 年` / `后一年` and 12 months;
2. `click` the **year label** -> switches to a 10-year table;
3. `前一年` in that table jumps a whole **decade** — this is how you reach an old year
   without clicking `前一年` thirteen times;
4. `click` the year -> back to months -> `click` the month.

Trap: selecting a year may leave a default month (often the last used one), so the field
can briefly read `2016-09` when you want `2016-06`. Always click the month explicitly.

### G. File upload
The plugin exposes **no** upload action, so a required photo blocks the save. Options, in
order of preference:
1. hand off with `browser_assist request-help`, giving the exact local file paths;
2. ask the user to upload and confirm.

The underlying CLI does have `bsk upload --file <path> --session <id> [target]`, but the
browser-skill guidance forbids driving the browser through a separate process, so treat
that as a user decision rather than something to do silently. If the user opts in, it is
the one way to clear a required-upload blocker without a human.

### H. CAPTCHA and OTP
- Text CAPTCHA: `screenshot` the captcha ref, read the characters, fill them. Fully
  automatable.
- Click-the-shapes / image-puzzle CAPTCHA: hand off.
- SMS: `node scripts/read-sms-code.mjs --wait 180` (see section 6).

## 4. Frames

CSS selectors search **only the main document**. These portals nest
`mainframe -> contentframe -> inner`, so a selector like
`.el-input__wrapper.is-focus input` or `#el-id-4413-111` fails with
`did not match any element` even though the element exists. Inside frames, refs are the
only handle. Selectors are safe only on the top-level page (for example a login form).

## 5. Find every required field in one shot

Long forms hide their required set. Instead of probing field by field:

1. fill what you know,
2. click **Save**,
3. read the validation output — it lists exactly which fields are required and empty.

One save reveals the whole remaining requirement list, including fields that carry no
asterisk until another field is chosen (selecting a country can add "current city" as
required; choosing "campus recruiting" can drop a whole block from required to optional).

Then, when the save finally succeeds, confirm it by the site's own signal: a success
toast, the section flipping from "incomplete" to complete, or the completeness percentage
rising. **Absence of errors is not success.** If Save leaves the form in edit mode, a
validation error is still present — scroll to the top of the form, the banner is usually
there.

## 6. Verification and diagnostics

- Confirm a field: `screenshot ref=@eN` (cheap crop).
- Confirm a click did something: `browser_inspect network` (bounded; follow `since`).
  A click that produces no request and no visible change did nothing.
- `browser_inspect console` for page errors.
- If a ref errors as `unknown` or `element not visible`, re-observe once and retry;
  do not retry the same ref twice.

## 7. Login

- **Several login entrances usually mean several different accounts — ask which one.**
  Tencent offers QQ and WeChat "one-click" login; they create *separate* accounts, and the
  one already signed in to the browser is often the stale one. On 2026-09-28 the run
  picked QQ because its session was live, and landed on a 2021-era resume at 33% with a
  delisted position; the resulting `岗位已下架，请重新选择岗位` modal looked like a
  product-level gate ("you must apply before you can edit") when it was really just the
  wrong account. When a site shows more than one entrance, ask the user which account they
  actually use **before** logging in.
- **Default to phone + SMS login; do not interrupt the user for account choice.**
  Many sites offer several login methods (SMS / WeChat / Alipay / account+password), and
  they are usually separate accounts. Interrupting per site is too many stops, so the
  default is: fill the profile phone number, request the SMS code, auto-read it, log in.
  Hand off to the user only for real blockers (CAPTCHA, QR/face, OTP that never arrives,
  file upload). The account-choice problem (SMS may land on a different account than the
  one the user actually uses — e.g. 2026-09-28 阿里巴巴: user's real account is 微信) is
  recorded in `references/known-issues.md` and deferred.
- Reuse an already-connected browser profile; do not launch a second browser. What the run
  needs is a profile that holds the target site's login state, not necessarily the user's
  everyday one. If several instances are connected, pick the right one with
  `bsk browsers` plus `browser_session start` on that browser, and confirm the site's
  account name in the nav before assuming the login is present.
- These sites usually drop the login between agent sessions, so plan on logging in each
  run: password login, or mobile + text CAPTCHA + SMS code.
- Reading an SMS code on macOS: `node scripts/read-sms-code.mjs --wait 180`.
  Leave `--minutes` at its 5-minute default: it is a freshness filter, not a recall knob.
  Codes expire in ~5 minutes, so a wider window only lets an expired code sit in the
  candidate list (on 2026-09-27 the 10-minute default surfaced a 39-minute-old code next
  to the live one). Widen it only to diagnose "did it ever arrive?".
  Use `--wait`: delivery lags the "code sent" UI by anything up to ~90s, and one call that
  polls internally beats four that guess (a 2026-09-27 run polled for 22s over a code that
  landed at 48s and wrongly concluded no SMS was ever sent). It reads
  `~/Library/Messages/chat.db`, decodes the `attributedBody` typedstream blob when
  `message.text` is NULL, and returns only messages matching a verification pattern — it
  never dumps the whole inbox. It needs Full Disk Access for the app running the agent.
  Sanity-check it with a wide window (`--minutes 60`) before blaming the site.

## 8. Handing off to the human

Use `browser_assist request-help` for the things only a human can do: puzzle CAPTCHAs,
QR or face verification, an OTP that never arrives, and file uploads. Include a precise
prompt and the exact file paths involved. Stale `targets` are reported as
`not found` but the request still reaches the user. Resume only after the user reports
`continued` or `completed`, then re-observe.

## 9. Ending a run

**Leave the owned session (Agent Window) open.** Do not call `browser_session stop` when a
run ends unless the user asks: on an *owned* session `stop` closes the entire Agent Window
(it only "returns" a *borrowed* tab), so the user watches the browser disappear right when
they want to inspect the result. Return borrowed tabs, and state in your summary that the
window is left open.

Save early and save often regardless — unsaved form state is lost when a session is
recycled.

The plugin reaps an **idle** session on its own — `bsk logs` shows
`idle session stopped`, observed at roughly 10 minutes without a browser call. Off-browser
detours (reading docs, grepping bundles, waiting on the user) count as idle, so a window
you "left open" can still be gone by the next turn. Check `bsk session list` before reusing
a session id, and re-open rather than assuming.

**Corollary — collect every user-supplied value before opening the form.** Parking a
half-filled form while you ask a question counts as idle, and the reaper takes the unsaved
fill with it. On 2026-09-28 a Tencent pass filled four GPA fields and then waited on the
user; the session was reaped and the entire fill had to be redone. Batch the questions
first, then fill and save in one uninterrupted burst.

## 10. Page-level traps

These were learned on this same set of Chinese ATS portals before the browser-skill plugin
existed, using Playwright. They are not about refs, so they still apply — and each one cost
real debugging time when it was discovered.

**Never wait for network idle.** These SPAs hold long-lived connections (an AI assistant's
SSE stream, analytics beacons), so the network **never** goes quiet and a "networkidle"
wait always burns its full timeout. Measured 3/3 timeouts; the one pass was a fresh browser
start, which makes it look intermittent rather than broken. Wait for a concrete ready
element instead:

| Page | Ready signal |
| --- | --- |
| Job list / landing | `div.header-content` |
| Login page | `input[placeholder="手机号码"]` |
| Resume editor | `.ud-formily-item` |

Fixing this alone took a full run from ~70s to ~9s, and removing a duplicated navigation
brought it to ~5.5–6.5s. **Wait strategy is a first-order performance knob, not a detail.**

**Character-by-character typing is not only a workaround — it is also less bot-like.**
A single programmatic value write produces no per-keystroke events, so the value appears
instantaneously in timestamps, which is easy for a site to flag. `press` one character at a
time emits real keydown/keypress/input events. So the expensive path happens to be the
safer one; do not "optimise" it away by hunting for a bulk-set that bypasses events.

**A hidden real input behind a visible wrapper must be clicked on the wrapper.** An Ant-style
checkbox is a hidden `input.atsx-checkbox-input` plus a visible
`label.atsx-checkbox-wrapper`; targeting the input fails as "not visible/clickable". This is
the same shape as the `div[role=button]` input case in section 3 — **when a click or fill
fails on a control, look for a visible wrapper or label and click that instead.**

**A disabled button fails silently.** Clicking a disabled 获取验证码 does nothing, and the
operator concludes the script is broken. Read and report the button's state *before*
clicking, with the usual causes:

| Symptom | Likely cause |
| --- | --- |
| Countdown such as "XX秒后重试" | SMS rate limit (one per number per ~60s, plus a daily cap) |
| No countdown, consent box empty | Consent not ticked — **and a page reload resets it** |
| A slider/puzzle on the page | Human verification not yet completed |

**Dismiss full-screen overlays before clicking anything.** A landing page can show a
full-viewport AI-assistant guide (with a 稍后再说 / "later" action) whose mask swallows every
click. It typically appears only on the first visit per browser profile, which is exactly
why it is easy to miss when re-testing.

**The same text can appear twice on one page.** The login page has a header `<a>登录</a>` and
the form's submit button, so text matching is ambiguous. Prefer a stable class or attribute
(`button.loginSubmit`).

**Do not assume a form autosaves.** One portal confirmed the opposite: a value written
without clicking Save reverted on reload. That makes experimentation safe, but it also means
progress is lost on any session recycle — save as you go (section 9).
