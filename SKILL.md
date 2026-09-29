---
name: resume-autofill
description: Drive a real Chromium browser to fill job-application resumes on recruiting sites (campus and social recruiting, bank hiring portals) from one local profile file, then save and verify. Use when the user asks to fill, complete, update or submit a resume/profile on a specific company's recruiting site.
whenToUse: The user names a company recruiting site, or asks to fill/complete a resume or application form on the web, or asks to re-run resume filling for another company.
---

# Resume autofill

Fill a company's online resume from one local profile file, using the user's own logged-in browser.

Two rules govern everything below.

**Cost rule.** Every model request re-sends the whole conversation. A browser read or
action is one request. So the cost of a run is (context size x number of requests).
Minimize *requests*: observe once, then act several times on the refs you got; never
re-observe "just to check"; cap `maxTokens`; prefer one screenshot over two observes.
Never paste a large page dump twice.

**Truth rule.** Never invent a value that is not in the profile file. If a required
field has no profile value, ask the user once, in a single batched question, then write
the answer back into the profile file so it is never asked again.

## Phase 0 - environment gate

Run `node scripts/preflight.mjs` (from this skill directory). It checks the four hard
requirements and prints one line per check.

| Check | Requirement | If it fails |
| --- | --- | --- |
| Model tier | A low-cost model. Check your own model identity in your runtime context. | Tell the user this workflow is tool-call heavy and to switch to a low-cost model before continuing. Ask once; do not nag. |
| Working directory | A dedicated directory holding the profile file and per-site notes | Offer to create one (default: current workspace) and stop until it exists. |
| Operating system | macOS | SMS auto-reading needs the macOS Messages database. On other systems the run can continue but the user must retype every SMS code. Say so before spending calls. |
| Browser plugin | The `browser-skill` plugin and a working `bsk` CLI | You can install this yourself — see below — rather than only pointing at a guide. |

This skill itself never touches the keyboard or the network directly: all browser work
goes through the `browser-skill` plugin tools.

**Portability: you can bootstrap the missing environment.** BrowserSkill publishes an
install guide written for agents, covering CLI install, the right skill/plugin, connection
checks and a first task:

```
https://raw.githubusercontent.com/Tencent/BrowserSkill/main/AGENT_INSTALL.md
```

Fetch it and follow it when `bsk` or the plugin is missing. Two things stay human: the
browser extension must be installed from the Chrome/Edge store, and the extension must be
told to allow the local connection. Everything else you can do. Confirm with `bsk doctor`
before continuing.

**Lazy-tool trap.** The `browser_*` tools do not exist until the `browser-skill` skill
has been loaded in this session. Loading `resume-autofill` does not load them. If any
`browser_*` call returns "unknown tool", call the `browser-skill` skill first, then
retry. Do this once, up front, before Phase 2.

## Phase 1 - profile file

The profile is a flat `key: value` Markdown file, one fact per line, in the working
directory (default `简历信息-解析版.md`). Flat beats nested: the model parses it in one
read and the user can edit any line without understanding a schema.

**Onboarding: build the profile from the user's existing resume. Never open with a blank
template** — it is 100+ fields, which is enough friction to kill adoption.

Onboarding splits three ways, and keeping the split matters:

| Who | Does what |
| --- | --- |
| `scripts/bootstrap-profile.mjs` | The deterministic half: labelled lines, dates, ID/mobile/email patterns, education blocks. Writes a **draft** and prints exactly which keys are still missing. |
| You (the model) | The prose half: read the extracted text and draft the narrative fields a rule cannot parse (实习/工作内容、项目内容、自我评价). |
| The user | The private half: facts in no document — expected salary, referees, compliance answers, photo paths. |

Run it like this:

1. `node scripts/bootstrap-profile.mjs --file <resume> --json` → writes
   `<workspace>/简历信息-草稿.md` and reports `filledKeys` / `missing`.
   It refuses to overwrite an existing draft (exit 3) so user edits are never lost;
   pass `--force` or `--out` when you really mean to.
2. Fill the narrative fields you can from the resume text (use
   `scripts/extract-resume.mjs --file <resume>` if you need the raw text).
3. Present the **remaining `missing` keys to the user as one batched question**, grouped,
   and let them fill them in. Do not ask one field at a time.
4. Have the user confirm the whole file, then rename it to the live profile name
   (`简历信息-解析版.md`).

Extraction is lossy — it can reorder columns and split lines mid-word — so the draft is a
lead, never truth. If a scanned/image-only resume yields no text, ask for a text-based
version or read the fields off the image instead. If there is no resume file at all, only
then fall back to a blank template from `references/profile-schema.md`.

Either way: **do not guess values**, and do not enter Phase 3 until the profile is confirmed.

- If the profile already exists, read it once and derive the site's answers. Read it again
  only after the user reports an edit.
- When a site demands something the profile lacks, ask for **all** of it in one
  `ask_user_question` call, then append the answers to the file.

## Phase 2 - pick the sites

Read `references/sites.md` (registry: company, URL, status, reference doc). Work only on
the sites the user asked for. For an `unverified` site, expect to spend calls discovering
its flow, and write the result back as a new reference in Phase 4.

Before touching a site, read its reference doc in `references/sites/<name>.md`. That doc
exists to stop you re-deriving things: entry path, control quirks, required-field traps.
Reading it costs a fraction of one `observe`.

If there is no reference doc, follow `references/browser-playbook.md` from scratch.

## Phase 3 - per-site loop

Repeat for each target site. Keep your own running note of which fields are done; do not
re-derive state from the page.

1. **Session.** `browser_session start`; record the session id. Use the user's existing
   logged-in browser; never start a second browser.
2. **Login.** Default to phone + SMS login (fill the profile phone, request the code), then
   run `node scripts/read-sms-code.mjs --wait 180` once — it polls internally until the code
   lands or the deadline passes, so do not loop it by hand. Keep `--minutes` at its
   default; it is a freshness filter, not a recall knob. For an image CAPTCHA, screenshot
   the captcha element and read it. Hand off to the user with `browser_assist request-help`
   only for: CAPTCHA puzzles you cannot read, QR/face verification, OTP that never
   arrives, and file uploads. The plugin exposes no upload action; the `bsk` CLI has
   `bsk upload`, but driving the browser from the CLI breaks the one-process rule, so
   whether to allow it is a per-user decision (ask once, never assume).
3. **Navigate.** Follow the reference doc's entry path to the resume edit form.
4. **Fill.** Cheapest mechanism first, in this order, and batch aggressively:
   - multi-line fields: `fill` directly (real `textarea`, exposed as a textbox ref);
   - plain selects and cascaders: click the field, take the option refs from that same
     observe, click the option;
   - plain single-line inputs wrapped so they look like buttons: `click` the field, then
     `press` one character at a time;
   - dates: open the picker, use its year label to jump decades, then the month.
   Details and the exact ref arithmetic are in `references/browser-playbook.md`.
   **Discover required fields once**: if the form is long, click Save early and read the
   validation list. One save reveals every missing required field, which is far cheaper
   than probing field by field.
5. **Save.** Click Save and verify the site's own success signal (green toast, section
   flips from 不完整/incomplete to complete, completeness percentage rises). Do not
   report success from the absence of errors; require the success signal.
6. **Report.** Per site: saved or not, the success signal you saw, and anything you could
   not fill, with the reason.

Skip optional fields when they cost a separate request each and add nothing. Say which
ones you skipped.

## Phase 4 - write back

After each site, update the knowledge, because this is what makes the next run cheap:

- Create or update `references/sites/<name>.md`: entry path, control quirks, required
  fields, traps, and what a successful save looks like.
- Flip that site's status to `verified` in `references/sites.md`.
- Append any new personal fact to the profile file.
- If a run was slow, note the specific wasted calls in the site doc so the next run
  avoids them.

## Stop conditions

Stop and report instead of retrying when: the plugin or `bsk` is unavailable; login needs
a human step the user has not completed; a required value is missing from the profile and
the user has not answered; or the same action has failed twice for the same reason.

Call `browser_session stop` on your owned session when a run ends; do not leave it open.
Reason (measured 2026-09-28): the plugin allows at most 5 concurrent sessions, and its
idle-reap — which closes an idle session's window after ~10 minutes with no browser call —
does **not** decrement the session counter. So every left-open session leaks one slot, and
once 5 slots are leaked every new `browser_session start` fails with
"session limit reached (5 concurrent sessions)". If you hit that, run `browser_session
list` and `stop` each dead session to free the slots. Return any borrowed tab first, and
say in your summary that the window was closed so the slot is freed.
