# Co-Pilot CEO Review System

> This file is the bridge between two Claude Code sessions. One session executes, the other reviews as "co-pilot CEO." The user copy-pastes plans between them.

---

## ROLE

The **Co-Pilot CEO** is a separate Claude Code session that:
- Receives plans from the executing session (user pastes them)
- Analyzes for bugs, missing pieces, and improvement opportunities
- Searches the web for better patterns, UX research, and library best practices
- Writes concrete code fixes (not just descriptions) into the **Active Zone** below
- Returns the file path so the user can tell the executing session to read it

**The CEO does NOT write code to the project.** It writes suggestions into this file. The executing session reads this file and applies them.

**RULES:**
1. ALWAYS search the web first before reviewing a plan
2. ALWAYS update this file's Active Zone for every review
3. ALWAYS end with the file path
4. ONLY exception to web search: pure deletion tasks with zero design decisions
5. **NEVER edit project source code directly** — the CEO writes suggestions HERE, the executing session applies them. No Edit/Write/Bash commits on project files. Ever.

---

## REVIEW PROTOCOL (18 categories)

### Correctness (5)
1. **Library API misuse** — incompatible GSAP options, wrong Firebase compat SDK methods, deprecated CDN APIs
2. **Data convention mismatch** — grammarData format inconsistency, answeredKeys "correct"/"wrong" vs boolean, localStorage key collisions across exams
3. **Firebase null guards** — `|| []` / `|| {}` for all Firebase data (vanilla JS; Firebase returns `null` not `undefined`)
4. **State-conditional DOM** — wrong visibility/class/content for a given app state (focus mode, retry mode, teacher session, offline, dark mode)
5. **CDN version drift** — CDN-loaded library (GSAP 3.12.5, Firebase 10.14.0 compat) used with API from a different version; no lockfile to catch this

### Completeness (5)
6. **Prose vs code gap** — plan describes in bullets, no implementation
7. **Generated file edits** — plan modifies index.html, styles.css, or sitemap.xml directly instead of editing the generator scripts in `/usr/local/bin/english_resources/`
8. **Reinventing existing code** — utility already exists in shared modules (UISound, BugReport, getCachedCards, IQ_EASE, NavState, etc.)
9. **Script-repo sync** — plan edits `/usr/local/bin/` scripts but does not update version-controlled copies in `.scripts/`
10. **Content accuracy** — Dual Scope golden rule: keep original PDF text exactly; never invent, rephrase, or reorganize questions; vocab entries must not include answer words; hints must not reveal answers

### Architecture (3)
11. **Systemic vs whack-a-mole** — normalize at data layer or shared module, not per-file
12. **Duplicate affordance** — two patterns for the same action (e.g., two ways to toggle dark mode)
13. **Single-file app bloat** — inline script/style growth in lesson HTML; shared logic belongs in interactive-quiz.js or a new shared module, not duplicated per lesson file

### UX & Design (2)
14. **UX discoverability** — hidden actions need visible alternative (NNG); keyboard shortcuts must have on-screen equivalent
15. **CSS variable / inline style conflicts** — GRADE_COLORS inline styles conflicting with CSS class styles; alpha channels causing bleedthrough

### Project-Specific (3)
16. **GPU safety** — no animated `backdrop-filter`, no mass compositing layers (GPU rasterization OFF on this machine)
17. **GSAP-First** — no CSS transition/animation/@keyframes; all motion via GSAP (exceptions: shadcn internals, :focus-visible, cursor, scrollbar)
18. **Python generator correctness** — generator changes in templates.py/colors.py/scanning.py cascade to ALL generated pages site-wide; verify with `--dry-run`; test both light/dark mode output

---

## FOR THE EXECUTING SESSION

1. Read the **Active Zone** below
2. Apply all **BUGS** first — will break if not fixed
3. Apply **MISSING** items
4. Consider **IMPROVEMENTS** — sorted by priority
5. Check the **Priority Table**

If Active Zone says "No active task" — CEO hasn't reviewed yet.

---

## LESSONS LEARNED

| Date | Task | Lesson |
|------|------|--------|
| 2026-03-29 | Migration plan | Serwist needs `@serwist/turbopack` for Next.js 16 Turbopack — plain `@serwist/next` won't work |
| 2026-03-29 | Migration plan | localStorage is per-origin — domain change = data loss. Use custom domain to eliminate the problem |
| 2026-03-29 | Migration plan | Always count actual files before planning migration — plan said 19, reality was 28 |
| 2026-03-29 | Migration plan | Zustand + persist > useReducer + Context for complex quiz state (eliminates re-render cascade, free localStorage) |
| 2026-03-29 | Migration plan | Firebase auth proxy (`/__/auth/*` rewrite) must exist from day one on Vercel — eiken-correction past mistake |
| 2026-03-29 | Migration plan | When extracting data from HTML to TypeScript, verify extraction with diff script — content accuracy is non-negotiable |
| 2026-04-07 | v1 crash triage | Firebase database rules can silently get overwritten by other project deploys — check rules after ANY deploy |
| 2026-04-07 | v1 crash triage | CSP `connect-src` must include `fonts.gstatic.com` for service worker font fetches (not just `font-src`) |
| 2026-04-07 | v1 crash triage | `gsap.from({opacity:0})` spreads faster than expected — audit found 19 locations, not the 2 originally planned |
| 2026-04-07 | v1 crash triage | Max 2 `backdrop-filter` per page — v1 had 10 in one CSS file, 12 on one Engoo page |
| 2026-04-08 | v2 scaffold | Serwist production build requires `next build --webpack` (Turbopack doesn't support Serwist) |
| 2026-04-08 | v2 scaffold | Zustand persist middleware has a bug in v5.0.5-5.0.9 — always use v5.0.10+ |
| 2026-04-08 | v2 scaffold | `tw-animate-css` may be pulled in by shadcn — verify before removing (GSAP-First exemption if needed) |
| 2026-04-10 | Post-triage audit | Batch fixes that target "all eiken files" can miss non-numbered files (universal_phrases, speaking_phrase_bank) — always glob-verify |
| 2026-04-10 | Post-triage audit | CSS page-load fades (`@keyframes fadeIn`) are acceptable GSAP-First exceptions — they fire before JS loads |
| 2026-04-10 | Post-triage audit | Theme crossfade `transition:` on `*` is acceptable — document it, don't fight it |
| 2026-04-10 | Security audit | Next.js 16.1.6 is patched for CVE-2026-23864 (DoS), CVE-2025-66478 (RCE), CVE-2025-29927 (middleware bypass) |
| 2026-04-10 | Security audit | `poweredByHeader: false` should be in every Next.js project's config — reveals framework to attackers |
| 2026-04-10 | Security audit | Firebase client API keys are safe to expose IF: domain-restricted in Console + Security Rules enforced |
| 2026-04-10 | Phase 2 review | `correction` type has NO `correctAnswer` — only `correctText`. `error` has BOTH. Critical distinction. |
| 2026-04-10 | Phase 2 review | `choices` field appears as instruction text on fillin/error/pair — not just on choice type |
| 2026-04-10 | Phase 2 review | Extended answer fields (answer/translation/explanation/grammar) in 実戦問題5 apply to ALL types, not just choice |
| 2026-04-10 | Phase 2 review | NavState.categoryMap keys vary per file — use `Record<string, number[]>`, not fixed keys |
| 2026-04-10 | Phase 5 review | Leitner `prune()` must use `max(addedAt, lastReviewedAt)` — pruning by `addedAt` alone loses actively-struggling items |
| 2026-04-10 | Phase 5 review | Plan test counts become stale fast (96 → 129 in one session) — always verify with `npx vitest run`, not plan text |
| 2026-04-10 | Phase 5 review | Exhaustive switch with `never` check must be in EVERY type-discriminated render path, not just the main one |
| 2026-04-10 | Phase 5 review | Dynamic import chains need `.catch()` — silent code-split failures drop user actions in production |
| 2026-04-10 | Phase 6 review | CSS `@scope` at-rule is baseline (Dec 2025) — use it instead of find-replace or CSS Modules for verbatim CSS ports |
| 2026-04-10 | Phase 6 review | Next.js `<Script>` `onReady` callback is more reliable than defensive try/catch for window globals |
| 2026-04-10 | Phase 6 review | Route-boundary `<Script>` tags > root layout — don't ship 8KB to pages that don't need it |
| 2026-04-10 | Phase 6 review | Mirror `next-themes` `.dark` class to `data-theme` attribute for compat with v1 CSS — one-line useEffect |
| 2026-04-10 | Phase 6 review | FeedbackPopup: Portal + absolute positioning from `getBoundingClientRect()` = React-safe + looks in-place |
| 2026-04-10 | Phase 6 review | Self-host third-party assets (SND.dev sounds) for student apps — privacy + reliability + CSP simplicity |

---
---

# ACTIVE ZONE

> Only the current task appears here. Old tasks are cleared to prevent file bloat.

---

## CEO Review: Phase 6 Pixel-Perfect v1 Dualscope Parity (2026-04-10, Opus 4.6 max effort)

**Plan reviewed:** `~/.claude/plans/nifty-dancing-graham.md` (Phase 6: Pixel-Perfect v1 Parity)
**Status:** Pre-execution. Phase 5 shipped (133/133 tests passing confirmed). Phase 6 is a dedicated presentation-layer rebuild to adopt v1's exact CSS + DOM + class names.

**Methodology:** Read the full plan. Web searches for (a) CSS `@scope` baseline status, (b) Next.js Script `afterInteractive` race conditions, (c) PostCSS scoping alternatives. Verified test count with `npx vitest run`.

---

### THE BIG ONE: Use CSS `@scope` at-rule instead of find-replace

**The plan's biggest risk is the CSS scoping strategy.** It proposes mechanical find-replace of every selector in `dualscope-lesson.css` (3,000+ lines) to prepend `.quiz-root`. This is fragile for at least 6 reasons:

- `body`, `html`, `:root`, `*` selectors need special handling
- `@keyframes`, `@font-face`, `@media`, `@supports` must NOT be scoped
- `::selection`, `::-webkit-scrollbar` pseudo-elements need exceptions
- CSS custom property cascade breaks if `:root` is rewritten to `.quiz-root:root`
- Attribute selectors like `[data-theme="dark"] .x` need to become `[data-theme="dark"] .quiz-root .x` — requires structural parsing, not find-replace
- Any third-party CSS imported via `@import` would leak

**CEO recommendation: Use CSS `@scope` at-rule.** As of December 2025, `@scope` is **Baseline: Newly Available** — supported in Chrome 118+, Safari 17.5+, Firefox 146+. This is 100% clean, zero build tooling, and handles all the above edge cases correctly:

```css
@scope (.quiz-root) {
  /* All v1 dualscope-lesson.css rules go here unchanged */
  .view-home { ... }
  .qcard { ... }
  :scope {  /* replaces :root */
    --bg: #F5F0E6;
  }
}
```

Source: [CSS @scope baseline 2026](https://web-standards.dev/news/2026/01/scope-css-baseline/), [MDN @scope](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@scope), [Smashing Magazine guide](https://www.smashingmagazine.com/2026/02/css-scope-alternative-naming-conventions/)

**Browser support caveat:** Chrome 118 / Safari 17.5 / Firefox 146 cover ~97% of current users but not older installs. The target audience (Japanese high school students on school Chromebooks / tablets) should be verified. If older browsers need support, fall back to PostCSS with `postcss-prefix-selector` + explicit exclusions.

**If you choose `@scope`:** Reduces Phase 6A from find-replace work to literally wrapping the v1 CSS in `@scope (.quiz-root) { ... }`. Maybe 10 minutes instead of an hour of mechanical edits.

---

### BUGS in the Phase 6 Plan

#### BUG-1 (HIGH): CSP + `ui-sounds.js` contradiction

**The plan says:** "CSP already allows `cdn.jsdelivr.net` in script-src + connect-src (already done)"

**Reality:** The CEO audit from 2026-04-10 (Part B) found that **v2 has NO CSP header at all** in `vercel.json` (item SEC-1, still open). This claim in the Phase 6 plan is wrong.

**Fix:**
1. Add the CSP header to `vercel.json` (from previous CEO review, item SEC-1) BEFORE shipping Phase 6
2. Ensure the CSP includes `cdn.jsdelivr.net` in both `script-src` and `connect-src`
3. Also allow `https://sound-effects.bhptn.com` if that's where SND.dev serves from — verify by inspecting `public/ui-sounds.js`

Without CSP set up, Phase 6 will work (no restrictions), but Phase 6 + a later security hardening will break sounds.

#### BUG-2 (HIGH): Sound loading race despite `try/catch` defense

**The plan says:** "If React tries to call `window.UISound.play()` before `ui-sounds.js` finishes loading, it throws. The hook wraps it defensively: `try { window.UISound?.play(name) } catch {}`"

**The real problem:** Defensive try/catch means sounds are **silently dropped** during initial interaction. A user who clicks a choice in the first 500ms after page load gets no sound feedback — confusing and hard to debug.

**Better fix:** Use Next.js `<Script>` component's `onReady` callback (which does work with `afterInteractive`, per Next.js docs):

```tsx
// app/layout.tsx — or better, QuizClient.tsx (see BUG-3)
<Script
  src="/ui-sounds.js"
  strategy="afterInteractive"
  onReady={() => {
    useSoundStore.setState({ ready: true })
    // Apply persisted mute state NOW that UISound exists
    const muted = localStorage.getItem('iq-sound-muted') === '1'
    if (window.UISound) window.UISound.muted = muted
  }}
  onError={(e) => errorLogger.log('ui-sounds-load-failed', e)}
/>
```

Then `useSound()` returns no-op **until** `ready === true`, and a subtle visual hint shows "Sound loading..." if needed.

Source: [Next.js Script component docs](https://nextjs.org/docs/app/api-reference/components/script), [afterInteractive behavior](https://lightrun.com/answers/vercel-next-js-nextscript-does-not-trigger-onload-callback-when-used-with-beforeinteractive-strategy)

#### BUG-3 (MEDIUM): `<Script>` in root layout loads for all pages

**The plan proposes:** Adding `<Script src="/ui-sounds.js" strategy="afterInteractive" />` to `app/layout.tsx`.

**Problem:** This loads the sound library on every page — landing page, grade index pages, eiken pages, etc. Only the 4 Dual Scope quiz routes actually use sound. That's ~8KB of script + network request on pages that don't need it.

**Fix:** Move the `<Script>` tag into `app/grade2/dualscope/[slug]/QuizClient.tsx` (the quiz route boundary). Route-level scripts work with `afterInteractive` strategy and only load on matching routes.

This also answers plan CEO question #4 ("Is the ~8KB overhead acceptable?") — **No, load route-conditionally.**

#### BUG-4 (MEDIUM): `[data-theme="dark"]` vs `.dark` class mismatch

**The plan says:** v1 toggles dark mode via `[data-theme="dark"]` on `<html>`. v2 uses next-themes which toggles `.dark` class. The plan proposes a triple selector:
```css
.quiz-root.dark, [data-theme="dark"] .quiz-root, html.dark .quiz-root { ... }
```

**Problem:** This only fixes the top-level theme selector. The copied `dualscope-lesson.css` has **many internal selectors** like `[data-theme="dark"] .card { ... }`, `[data-theme="dark"] .top-nav { ... }`, etc. Those won't match because v2 never sets `[data-theme="dark"]`.

**Fix options (pick one):**

**Option A (recommended):** Add a sync effect in `QuizClient.tsx` that mirrors next-themes' `.dark` class to `data-theme` attribute:
```tsx
'use client'
import { useTheme } from 'next-themes'
useEffect(() => {
  document.documentElement.dataset.theme = resolvedTheme === 'dark' ? 'dark' : 'light'
}, [resolvedTheme])
```
This keeps the copied CSS untouched and works for the whole app.

**Option B:** Find-replace `[data-theme="dark"]` → `html.dark` in the copied CSS. Less invasive but creates drift from upstream v1 CSS.

CEO recommendation: **Option A** — one line of TS vs thousands of CSS edits.

#### BUG-5 (MEDIUM): Store's `collapsibleState` field is internally contradictory

**The plan adds:** `collapsibleState: Record<string, { vocab: boolean, hint: boolean, answer: boolean }>` to quiz-store.

**But then the gotcha section says:** "Not persisted: panels close on view switch (matches v1?)" and "Keep ephemeral."

**Contradiction:** If it's ephemeral (not persisted across reloads AND resets on view switch), it should be **local component state in `QuestionCard`**, not store state. Putting it in the store adds complexity for no benefit.

**Fix:** Remove `collapsibleState` from the store plan. Use `useState` in `CollapsiblePanel.tsx`. When the parent `QuestionView` unmounts (on view switch), local state is lost — matching v1 behavior.

#### BUG-6 (MEDIUM): FeedbackPopup in-place morph risks React reconciliation

**The plan says:** "Rewrite FeedbackPopup to morph the Check button in place using GSAP timeline. Remove the Portal."

**The risk:** If the button is inside a React tree that re-renders during the morph animation (e.g., a Zustand subscription fires), React will reset inline styles applied by GSAP, causing flicker or broken animation.

**Mitigation:** 
1. Wrap the morph in `useGSAP` from `@gsap/react` (auto-cleanup)
2. Use `gsap.context()` scoped to a ref
3. Memoize the parent component with `React.memo` so it doesn't re-render on unrelated state changes during the morph
4. Set a ref-based "isMorphing" flag and skip re-renders during that window

Even with mitigation, Portal is architecturally safer. CEO recommendation on plan question #2: **Keep Portal**. Position it via CSS `position: absolute` with coordinates from `button.getBoundingClientRect()` so it LOOKS in-place but renders in a Portal. Best of both worlds.

---

### MISSING from the Phase 6 Plan

#### MISSING-1: Lesson-specific accent colors (plan CEO question #3)

The plan punts on this with option (a): "use Lesson 15's palette as a universal default across all 4 lessons." **This causes visual regression on Lessons 16/17/実戦問題5** which have different accent colors for `--coord`, `--subord`, etc.

**CEO recommendation: Option (b)** — extract per-lesson color maps to a new field in LessonMeta (from Phase 2 type system). Apply via CSS custom properties at the `.quiz-root` level:

```tsx
<div 
  className="quiz-root" 
  data-exam-id={meta.examId}
  style={meta.colorTokens as React.CSSProperties}
>
```

Where `meta.colorTokens = { '--coord': '#3a7a8c', '--subord': '#...' }`. 20 minutes of data extraction per lesson. Matches v1 fidelity.

#### MISSING-2: SND.dev privacy / third-party concerns

**Context:** This is a student app for Japanese high schoolers. SND.dev loads sound files from a third-party CDN. The plan doesn't discuss:
- What does SND.dev log? (requests, IPs, user-agents?)
- Does it set cookies?
- Is the CDN URL stable, or does it require API keys?
- Are there GDPR/COPPA implications for minors in a school context?

**Fix:** Either:
1. **Self-host the sound files** — download from SND.dev, put in `public/sounds/`, modify `ui-sounds.js` to load locally. Eliminates third-party dependency.
2. **Document and verify** — read `public/ui-sounds.js` to understand the load path, confirm no tracking, add to privacy docs.

CEO recommendation: **Self-host.** Sound files are small (usually <100KB total for 11 effects). Removes a network dependency, improves load speed, eliminates privacy questions. One-time 30-minute task.

#### MISSING-3: Accessibility concerns

The plan focuses on pixel-perfect visual parity but doesn't mention accessibility. Issues:
- **Sounds with no aria-live alternative** — deaf/hard-of-hearing students get no feedback
- **Focus mode overlay** — no documented focus trap (WCAG 2.4.3)
- **Keyboard shortcuts** — plan says "full v1 parity (j/k, h/w, p, f, Esc, arrows)" but doesn't mention visible alternatives for discoverability (WCAG 2.1.1)
- **`.collapsible` height animation** — needs `aria-expanded` on toggle buttons
- **Custom color themes** — Japanese text contrast on warm-beige background needs WCAG AA verification

**Fix:** Add an accessibility sub-phase. Include:
- `aria-expanded` on collapsible toggle buttons
- `aria-live="polite"` region for correct/wrong feedback (text backup for sounds)
- Focus trap in FocusMode using `focus-trap-react` or manual
- Visible keyboard shortcut legend (toggleable with `?` key)
- Color contrast audit with axe-core

This is a 30-minute add during Phase 6F (Badges + polish).

#### MISSING-4: Gradual rollout / feature flag

**The plan ships Phase 6 as a big-bang CSS rewrite.** Users on v2 production will see a completely different UI instantly. If something breaks:
- No A/B comparison
- No rollback without git revert + redeploy (1-2 min window of breakage)
- No way to test with real users before full rollout

**Fix:** Add a feature flag via query param (`?classicUI=1`) or localStorage (`iq-use-v1-ui`). Default to NEW v1 style, but allow flipping back to current v2 Tailwind style for the first week. Remove flag after validation.

Simpler alternative: Launch on a single lesson first (Lesson 15), verify for 24 hours, then enable on the other 3.

#### MISSING-5: Playwright visual regression tests (plan CEO question #10)

**The plan asks** whether to add Playwright visual regression tests in Phase 6 or defer. **CEO answer: Add them in Phase 6.**

Rationale: This is a presentation-layer rewrite with the explicit goal of matching v1. Without pixel-level comparison, there's no objective way to know when "parity" is achieved. Store tests (the existing 133) don't cover visual output at all.

Minimum viable: Playwright screenshot tests for:
- Home view (light + dark)
- Question view with one of each 7 input types
- Progress panel (closed + open)
- Focus mode
- Teacher panel

That's ~20 snapshots. Compare against v1 HTML screenshots as the ground truth. Phase 6G becomes: "run snapshot diff, iterate until diff < threshold."

#### MISSING-6: Bundle size impact

**The plan adds 3,000+ lines of CSS** (v1-design-tokens.css + v1-dualscope.css) on top of existing `interactive-quiz.css` (3,209 lines). Total CSS payload for quiz pages: ~6,500 lines.

No mention of:
- Bundle size measurement before/after
- CSS code splitting per route
- `@next/bundle-analyzer` integration (previously recommended in audit IMP-3)

**Fix:** Add `@next/bundle-analyzer` NOW (pending item IMP-3 from 2026-04-08 review). Measure the Phase 6 impact. If quiz route CSS >100KB gzipped, investigate pruning unused rules with PurgeCSS or similar.

#### MISSING-7: View transition decision (plan CEO question #5)

The plan asks whether to implement the 200ms crossfade. CEO answer: **Skip for now, add in Phase 7 polish.** Use GSAP timeline on the view wrapper when you do add it — do not use the experimental View Transitions API (bad browser support + SSR complications).

#### MISSING-8: Overview view strategy (plan CEO question #7)

The plan proposes showing a generic section list instead of v1's lesson-specific conjunction grids. CEO answer: **Ship neither.** Hide the "Overview" tab entirely for now and mark the view as coming-soon. Shipping a weaker version damages the "pixel-perfect v1 parity" promise.

---

### IMPROVEMENTS

#### IMP-1: Use `iq-sound-muted` localStorage key for backward compat

**Plan question #6:** "use the same localStorage key as v1 so returning students keep their preference?"

**CEO answer: YES, absolutely.** Reuse `iq-sound-muted`. The v2 codebase already reuses v1's Firebase paths and localStorage keys for quiz progress — sound mute should follow the same pattern. Cost: zero. Benefit: returning students don't lose preference.

#### IMP-2: Address pending audit items in the same Phase

While doing the CSS work, also clean up these items from the 2026-04-10 audit that are still open:
- **GSAP-3:** Remove `tw-animate-css` (unused, violates GSAP-First)
- **GSAP-1/2:** Document `@keyframes fadeIn` and `transition` on `*` as CLAUDE.md exemptions
- **SEC-1:** Add CSP header to `vercel.json` (required for BUG-1 fix anyway)
- **SEC-2:** Add `poweredByHeader: false` to `next.config.ts` (1 line)

All together: ~10 minutes of additional work that closes 4 outstanding items.

#### IMP-3: Commit checkpoint strategy

Phase 6 has 7 sittings (6A through 6G). Each sitting should be one commit minimum, ideally one PR. Rationale: if Phase 6C breaks question cards, you can revert ONLY that commit instead of losing Phase 6A+B work.

---

### Answers to Plan's 10 CEO Questions (consolidated)

| # | Question | CEO Answer |
|---|----------|-----------|
| 1 | CSS scoping strategy | Use CSS `@scope` at-rule (baseline since Dec 2025) |
| 2 | FeedbackPopup morph vs Portal | Keep Portal, position with `getBoundingClientRect()` to look in-place |
| 3 | Lesson-specific theming | Option (b): extract per-lesson color maps to LessonMeta |
| 4 | Sound library loading | Route-conditional in QuizClient.tsx, not root layout |
| 5 | View transition timing | Skip for Phase 6, add in Phase 7 polish |
| 6 | `soundMuted` localStorage key | Reuse v1's `iq-sound-muted` |
| 7 | Overview view divergence | Hide the tab entirely, mark coming-soon |
| 8 | Collapsible state persistence | Local component state, not store |
| 9 | Visual regression safety | `@scope` + route-boundary CSS imports + Playwright snapshots |
| 10 | Test coverage | Add Playwright visual regression in Phase 6, not deferred |

---

### Priority Table (Phase 6)

| # | Type | Severity | Impact |
|---|------|----------|--------|
| BIG-ONE | Use `@scope` | CRITICAL | Eliminates find-replace fragility, 50x faster |
| BUG-1 | CSP missing | HIGH | Phase 6 will break when CSP is eventually added |
| BUG-2 | Sound race | HIGH | Silent UX bug (no feedback in first 500ms) |
| BUG-3 | Script in root layout | MEDIUM | Wastes bandwidth on non-quiz pages |
| BUG-4 | data-theme vs .dark | MEDIUM | Dark mode partially broken in copied CSS |
| BUG-5 | collapsibleState in store | MEDIUM | Unnecessary store complexity |
| BUG-6 | FeedbackPopup morph risk | MEDIUM | React reconciliation flicker |
| MISSING-1 | Lesson colors | HIGH | Visual regression on 3 of 4 lessons |
| MISSING-2 | SND.dev privacy | MEDIUM | Privacy/compliance question |
| MISSING-3 | Accessibility | MEDIUM | Deaf students get no feedback |
| MISSING-4 | Gradual rollout | MEDIUM | No safe escape hatch |
| MISSING-5 | Visual regression tests | MEDIUM | No objective parity measurement |
| MISSING-6 | Bundle size | LOW | Unmeasured growth |
| MISSING-7 | View transition | DEFERRED | Phase 7 polish |
| MISSING-8 | Overview view | DEFERRED | Hide, don't ship weaker |

**Summary: 1 CRITICAL recommendation, 6 BUGS, 8 MISSING items**
**Estimated additional effort over the 7-sitting plan: 1-2 extra sittings for accessibility + visual regression tests**

---

### Pending items carried forward (STILL OPEN as of 2026-04-10)

**v1 (3 items):**
- 2 eiken files still have `filter:blur` in @keyframes (`universal_phrases`, `speaking_phrase_bank_simple`)
- `sw.js` CACHE_NAME still v4, cross-origin fix never applied
- Engoo Day 6 `.hdr` still has compound `backdrop-filter`

**v2 security (2 items, blocking Phase 6):**
- SEC-1: No CSP headers in vercel.json — **MUST FIX before Phase 6 ships** (per BUG-1)
- SEC-2: `poweredByHeader: false` not set

**Phase 5 bugs (4 items, from prior review):**
- BUG-1: `leitner.prune()` uses `addedAt` only — active items can be pruned
- BUG-2: `ReviewCard` switch has no exhaustive `never` check
- BUG-3: `makeId` `:` collision risk for future eiken migration
- BUG-4: Dynamic import chain has no `.catch()`

---

**Sources:**
- [CSS @scope baseline 2026](https://web-standards.dev/news/2026/01/scope-css-baseline/)
- [MDN @scope reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@scope)
- [Smashing Magazine @scope guide](https://www.smashingmagazine.com/2026/02/css-scope-alternative-naming-conventions/)
- [Next.js Script component](https://nextjs.org/docs/app/api-reference/components/script)
- [postcss-prefix-selector fallback](https://github.com/jackall3n/postcss-scope)

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`

---

## Previous: CEO Post-Implementation Review: Phase 5 Spaced Review (2026-04-10, Opus 4.6 max effort)

**Plan reviewed:** `~/.claude/plans/nifty-dancing-graham.md` (Phase 5: Spaced Review)
**Critical finding:** **Phase 5 is already shipped.** 129/129 tests passing. All 14 files from the plan exist and are fully wired. This is a post-implementation audit, not a pre-execution review.

**Methodology:** Sonnet agent verified every plan claim against actual code. Opus read the critical files (`leitner.ts`, `spaced-review-store.ts`, `quiz-store.ts recordAnswer`, `ReviewCard.tsx`). Web search for Leitner best practices 2026 + Zustand persist/hydration patterns.

**Progress since last review (2026-04-08):**
- Phase 2 (types + data): DONE
- Phase 3 (quiz engine, ~25 components): DONE
- Phase 4 (teacher reveal, dual-store architecture): DONE
- Phase 5 (spaced review, Leitner 5-box): DONE
- Tests: 96 → **129** (8 test files)

---

### BUGS in the Shipped Implementation

#### BUG-1 (HIGH): `prune()` uses only `addedAt`, not `lastReviewedAt` — actively-struggling items get pruned

**File:** `lib/spaced-review/leitner.ts` lines 95-106

```typescript
export function prune(items, cutoffDays = 90, now = Date.now()): SpacedReviewItem[] {
  const cutoff = now - cutoffDays * DAY_MS
  return items.filter((item) => {
    if (typeof item.addedAt !== 'number') return false
    if (typeof item.nextReview !== 'number') return false
    return item.addedAt >= cutoff  // ← only checks addedAt
  })
}
```

**The bug:** A student who keeps getting the same question wrong for 91 days will have it silently pruned from their review queue — even though they just got it wrong yesterday. Combined with the store's dedup logic (`resetToBoxZero` in `addWrongAnswer` does NOT update `addedAt`), a persistently-wrong item keeps its original `addedAt` timestamp forever and eventually gets pruned despite active failures.

**Why it matters:** The whole point of spaced review is to retain items the student struggles with. Pruning them silently defeats the purpose.

**Fix:**
```typescript
return items.filter((item) => {
  if (typeof item.addedAt !== 'number') return false
  if (typeof item.nextReview !== 'number') return false
  const lastTouch = item.lastReviewedAt ?? item.addedAt
  return lastTouch >= cutoff
})
```

Alternative: update `addedAt` in the dedup branch of `addWrongAnswer` (line 92-101 of `spaced-review-store.ts`) so re-encountering a wrong answer resets the prune clock.

#### BUG-2 (MEDIUM): `ReviewCard` `renderByType` switch has no exhaustive `never` check

**File:** `components/spaced-review/ReviewCard.tsx` lines 48-63

```typescript
switch (item.type) {
  case 'choice': return <ChoiceReview ... />
  case 'pair': return <PairReview ... />
  // ...7 cases
}
// No default branch with `never` check
```

**The bug:** If a new `QuestionType` is ever added (e.g., `'matching'`), TypeScript won't catch that `ReviewCard` is missing the case. The function just returns `undefined`, React renders nothing, and the review card appears blank — silently broken.

**Note:** `components/quiz/card/QuestionCard.tsx` uses exhaustive checks per CLAUDE.md ("Exhaustive type switch in `QuestionCard` with `never` check"). ReviewCard should match.

**Fix:**
```typescript
switch (item.type) {
  case 'choice': return <ChoiceReview ... />
  // ... 7 cases
  default: {
    const _exhaustive: never = item.type
    throw new Error(`Unknown question type: ${_exhaustive}`)
  }
}
```

#### BUG-3 (MEDIUM): `makeId` uses `:` delimiter — latent collision risk

**File:** `lib/spaced-review/spaced-review-store.ts` line 71-73

```typescript
function makeId(examId: string, si: number, qi: number): string {
  return `${examId}:${si}:${qi}`
}
```

**The bug:** If any future `examId` contains a colon (e.g., `"eiken:pre1:part1"`), IDs collide. Current examIds are safe (`"dualscope-lesson15"` etc.), but this is a latent bug that will bite when eiken content is migrated.

**Fix:** Use a delimiter that can't appear in slugs, or sanitize:
```typescript
function makeId(examId: string, si: number, qi: number): string {
  return `${encodeURIComponent(examId)}:${si}:${qi}`
}
```

#### BUG-4 (LOW): Dynamic import chain in `recordAnswer` has no error handling

**File:** `lib/stores/quiz-store.ts` lines 277-294

```typescript
void import('@/lib/spaced-review/correct-display').then(({ getCorrectDisplay }) => {
  dispatchWrongAnswerToReviewQueue(...)  // ← also does a dynamic import internally
})
```

**The bug:** Two nested dynamic imports with no `.catch()`. If the code-split chunk fails to load (network error, deploy in flight), the wrong answer is silently dropped. User experience: "I got it wrong but it's not in my review queue."

**Fix:** Add `.catch(err => errorLogger.log('spaced-review-dispatch', err))` to both import chains. The `error-logger` utility already exists per the Phase 4 notes.

---

### MISSING Features

#### MISSING-1 (MEDIUM): No "undo" for mis-clicks in review mode

If a student accidentally clicks "Got it right" on compose (or clicks the wrong choice button), there's no way to undo. The item gets promoted incorrectly and disappears from the queue if it was at box 4.

**Suggestion:** Add an "Undo last" button in `ReviewHeader` or a brief toast with undo action (5-second window).

#### MISSING-2 (LOW): No max queue size ceiling

The queue grows unbounded. localStorage quota is ~5-10MB, so ~10,000 items is probably fine, but there's no safety net. A student spamming wrong answers could exceed quota (and the `lazyLocalStorage.setItem` silently swallows quota errors — line 29-32 of store).

**Suggestion:** Cap at 500 items. When adding a new wrong answer beyond cap, evict the oldest non-due item first.

#### MISSING-3 (LOW): `persist.version: 1` but no `migrate` function

If the schema ever changes (e.g., add a new field to `SpacedReviewItem`), existing users' localStorage data won't be migrated — it'll be wiped on bump to `version: 2`. Not a bug now, but set up the migration slot early.

**Suggestion:** Add a no-op `migrate: (state, version) => state` for now.

#### MISSING-4 (LOW): No review stats / streak tracking

v1 had review session streaks. The current implementation tracks per-session results but doesn't persist a lifetime "total reviewed" or "current review streak". Nice-to-have for Phase 7 polish.

---

### IMPROVEMENTS

#### IMP-1: Document the shipped Phase 5 architecture in CLAUDE.md

The v2 CLAUDE.md already has a "Spaced Review Architecture (Phase 5 — Complete)" section with excellent coverage. Good. Consider adding a "Known limitations" subsection listing BUG-1 through BUG-4 for future contributors.

#### IMP-2: Add the Phase 5 lesson to memory

This session's fresh finding should be in lessons learned:
- **The plan said 96/96 tests; reality is 129/129.** Always verify tests count against `npx vitest run`, not plan text.
- **Leitner `prune()` by `addedAt` only is a long-term memory bug.** Always prune by `max(addedAt, lastReviewedAt)`.

---

### What Got RIGHT (Architecture Wins)

- **Middleware order correct:** `devtools → persist → immer` ✓
- **`skipHydration: true` + manual rehydrate hook** ✓ (matches quiz-store pattern)
- **`partialize`** only persists `items`, not session state ✓
- **Lazy localStorage wrapper** handles SSR + test stubs gracefully ✓
- **Global store, not factory** — correct choice for cross-lesson review ✓
- **Session snapshot is a stable copy** — mutations to main queue during session don't affect ordering ✓
- **Dynamic import from quiz-store** — keeps spaced-review out of test import graph ✓
- **Pure leitner module** — 100% testable without store or React ✓
- **`version: 1` on persist** — sets up future schema migrations ✓
- **`correction` type handled correctly** — no `correctAnswer`, only `correctText` ✓ (CEO review from previous session was applied)
- **Separate `correctDisplay` from raw `correctAnswer`** — UI vs data distinction ✓
- **`recordAnswer` dispatches via nested dynamic import** — elegant decoupling ✓

---

### Priority Table (Phase 5)

| # | Type | Severity | Fix effort |
|---|------|----------|-----------|
| BUG-1 | Long-term memory loss | HIGH | 3 lines in leitner.ts |
| BUG-2 | Type safety | MEDIUM | 5 lines in ReviewCard.tsx |
| BUG-3 | Latent collision | MEDIUM | 1 line in makeId() |
| BUG-4 | Silent failure | LOW | 2 .catch() calls |
| MISSING-1 | UX (undo) | MEDIUM | New button + state |
| MISSING-2 | Quota safety | LOW | Ceiling check |
| MISSING-3 | Schema migration | LOW | Add migrate fn |
| MISSING-4 | Stats tracking | LOW | Future polish |

**Summary: 4 BUGS (1 HIGH, 2 MEDIUM, 1 LOW), 4 MISSING items, 2 IMPROVEMENTS**
**Critical fix: BUG-1 (5 min).** Phase 5 is otherwise production-ready.

---

### Outstanding Items from Previous Reviews (still open)

**v1 (3 items, ~20 min):**
- 2 eiken files (`universal_phrases`, `speaking_phrase_bank_simple`) still have `filter:blur` in @keyframes
- `sw.js` CACHE_NAME still v4, cross-origin fix never applied
- Engoo Day 6 `.hdr` still has compound `backdrop-filter`

**v2 from audit 2026-04-10 (some now partially resolved by Phase 4/5 landing):**
- SEC-1 (no CSP headers in vercel.json) — STILL OPEN
- SEC-2 (`poweredByHeader: false`) — STILL OPEN
- GSAP-3 (`tw-animate-css` still installed) — CHECK IF SHADCN NEEDS IT

---

**Sources:**
- [Leitner system best practices 2026](https://okti.app/en/blog/spaced-repetition-explained/)
- [Zustand persist skipHydration patterns](https://medium.com/@judemiracle/fixing-react-hydration-errors-when-using-zustand-persist-with-usesyncexternalstore-b6d7a40f2623)
- [React 19 hydration guide](https://dev.to/melvinprince/mastering-hydration-in-react-19-the-ultimate-guide-to-faster-smarter-rendering-46ep)

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`

---

## Previous: CEO Review: Phase 2 Type System + Data Extraction (2026-04-10, Opus 4.6 max effort)

**Plan reviewed:** `~/.claude/plans/nifty-dancing-graham.md` (Phase 2 section)
**Methodology:** Opus agent read all 5 source HTML files and verified every field, type, and edge case claim against actual grammarData. Web search for TypeScript discriminated union best practices and Zustand middleware patterns.

---

### BUGS in the Phase 2 Plan (will cause broken components in Phase 3)

#### BUG-1: `choices` field exists on non-choice types — plan doesn't account for this

The plan assumes `choices` is a choice-type-only field. **Wrong.** It appears as instruction text on other types:

- **`fillin` in Lesson 16**: `choices: "空欄に冠詞を入れなさい"` (line 671) — instruction string
- **`error` in Lesson 16**: `choices: "下線部 a～d の中から誤りを1つ選び、正しく直しなさい。"` (line 900) — instruction string
- **`pair` in Lesson 16**: `choices: "選択肢: is, are"` (lines 615-661) — instruction string

But Lesson 15 and 17 `fillin`/`error`/`pair` questions do NOT have `choices`. So it's optional and file-specific.

**Fix:** Add `choices?: string` to the base question type (shared across ALL types), not just the `choice` discriminant. In the `choice` type, `choices` is required and contains the option labels. In other types, it's optional instruction text.

#### BUG-2: `correction` type has NO `correctAnswer` field — plan doesn't state this

The plan groups `correction` with other types that have `correctAnswer`. **`correction` ONLY has `correctText`.**

- `error` type: `correctAnswer` (which underlined part is wrong) + `correctText` (the fix)
- `correction` type: ONLY `correctText` (the underlined word IS the error, no selection needed)

**Fix:** The `correction` discriminant must NOT include `correctAnswer`. It should be:
```typescript
interface CorrectionQuestion {
  type: 'correction'
  num: string
  text: string
  correctText: string | string[]  // the fix
  vocab: [string, string][]
  hint: string[]
  // NO correctAnswer
}
```

#### BUG-3: Extended answer fields apply to ALL types in 実戦問題5, not just choice

The plan says "実戦問題5 adds `answer`, `translation`, `explanation`, `grammar`, `choiceExplanations` to choice questions." This is **partially wrong:**

- `answer`, `translation`, `explanation`, `grammar` → appear on **ALL 4 types** in 実戦問題5 (choice, fillin, scramble, error)
- `choiceExplanations` → appears ONLY on `choice` type

**Fix:** These 4 fields must be optional on the base question type or handled via a `PracticeQuestion` extension:
```typescript
// Option A: optional on base
interface BaseQuestion {
  // ...common fields
  answer?: string
  translation?: string
  explanation?: string
  grammar?: string
}

// Option B: intersection type for practice5
type Practice5Question = BaseQuestion & {
  answer: string
  translation: string
  explanation: string
  grammar: string
}
```

CEO recommendation: **Option A** (optional on base) — simpler, avoids a separate type hierarchy for one file.

#### BUG-4: `choiceExplanations` type should be `Record<string, string>`, not "object"

The plan says `choiceExplanations` without specifying the type. The actual structure is:
```typescript
choiceExplanations?: Record<string, string>
// Example: { "a. into": "○ 正解。be made into ～ で...", "b. of": "× be made of ～ は..." }
```

Keys are the choice labels (e.g., `"a. into"`), values are explanation strings.

#### BUG-5: `open` field on sections not mentioned

Every section in grammarData has `open: boolean` — `true` for the first section, `false` for rest. Controls initial accordion state.

**Fix:** Add to Section type:
```typescript
interface Section {
  title: string
  open: boolean
  questions: Question[]
}
```

#### BUG-6: NavState.categoryMap keys vary dramatically between files

The plan doesn't flag that 実戦問題5 uses **completely different category keys**:
- Lessons 15/16/17: `{ basic: [...], comm: [...], advanced: [...] }`
- 実戦問題5: `{ selection: [...], completion: [...], ordering: [...], correction: [...] }`

The LessonMeta type must use `Record<string, number[]>` for categoryMap, not a fixed key set.

---

### MISSING from the Phase 2 Plan

#### MISSING-1: `hint` should be explicitly optional

The plan says "usually 3 items, sometimes omitted on compose questions." But it's also absent on some choice and pair questions. The type should be:
```typescript
hint?: string[]  // not hint: string[]
```

#### MISSING-2: Exhaustive switch with `never` for discriminated union

When Phase 3 builds the quiz renderer, a switch on `question.type` must use exhaustive checking:
```typescript
function renderQuestion(q: Question) {
  switch (q.type) {
    case 'choice': return <ChoiceInput question={q} />
    // ...all 7 types
    default: {
      const _exhaustive: never = q
      throw new Error(`Unknown question type: ${(q as any).type}`)
    }
  }
}
```

Add a note in `quiz.ts` recommending this pattern for Phase 3.

#### MISSING-3: `scramble` field documentation

The plan mentions `scramble` as a question type but doesn't document that it has a unique `scramble: string` field containing the jumbled words (e.g., `scramble: "[ so / Ann / that / us / can / join ]"`). This field only exists on scramble-type questions.

#### MISSING-4: `pair` answer extraction from text

`pair` questions embed choices in the `text` string using parentheses (e.g., `"( awake, wake )"` within the sentence). There is no separate `choices` field for the actual pair options — they must be parsed from `text`. The plan should note this for Phase 3's PairInput component.

#### MISSING-5: Interactive file type needs its own `satisfies` check

The interactive file (`dualscope-lesson16-interactive.html`) has a completely different data model:
```typescript
interface InteractiveSentence {
  number: string
  english: string
  keywords: string[]
  japanese: string
  grammar: { term: string; meaning: string; note: string }
  special?: boolean
}
```

The plan mentions `interactive.ts` types but doesn't show the actual structure. Confirm this matches.

---

### IMPROVEMENTS

#### IMP-1: Use a base interface + discriminated union pattern

Rather than repeating common fields, use:
```typescript
interface BaseQuestion {
  num: string
  text: string
  vocab: [string, string][]
  hint?: string[]
  choices?: string  // instruction text (optional on all types)
  // 実戦問題5 extended fields (optional)
  answer?: string
  translation?: string
  explanation?: string
  grammar?: string
}

interface ChoiceQuestion extends BaseQuestion {
  type: 'choice'
  correctAnswer: string
  choices: string  // required for choice (overrides optional)
  choiceExplanations?: Record<string, string>
}

interface CorrectionQuestion extends BaseQuestion {
  type: 'correction'
  correctText: string | string[]
  // NO correctAnswer
}

// ... etc for all 7 types

type Question = ChoiceQuestion | PairQuestion | FillinQuestion | ScrambleQuestion | ComposeQuestion | ErrorQuestion | CorrectionQuestion
```

Source: [TypeScript discriminated unions](https://learntypescript.dev/07/l8-discriminated-union/), [Exhaustive checking](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html)

#### IMP-2: Zustand store setup note for Phase 3

When Phase 3 creates the quiz store, use the curried TypeScript form and correct middleware order:
```typescript
export const useQuizStore = create<QuizState>()(
  devtools(
    persist(
      immer((set) => ({ /* state + actions */ })),
      { name: 'iq-progress', skipHydration: true }  // skipHydration for SSR
    ),
    { name: 'QuizStore' }
  )
)
```

`skipHydration: true` prevents hydration mismatch in Next.js SSR. Hydrate manually in a `useEffect`.

Source: [Zustand TypeScript guide](https://sanjewa.com/blogs/zustand-typescript-type-safe-state-management/), [Zustand persist docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist)

---

### COMPLETE FIELD INVENTORY (verified against actual data)

| Type | Required | Optional |
|------|----------|----------|
| ALL | `num`, `type`, `text`, `vocab` | `hint`, `choices` (instruction), `answer`, `translation`, `explanation`, `grammar` |
| `choice` | + `correctAnswer` (string), `choices` (required string) | `choiceExplanations` (Record) |
| `pair` | + `correctAnswer` (string) | |
| `fillin` | + `correctAnswer` (string[]) | |
| `scramble` | + `correctAnswer` (string), `scramble` (string) | |
| `compose` | + `correctAnswer` (string) | |
| `error` | + `correctAnswer` (string) | `correctText` (string \| string[]) |
| `correction` | + `correctText` (string \| string[]) | NO correctAnswer |

**Section:** `{ title: string, open: boolean, questions: Question[] }`
**categoryMap:** `Record<string, number[]>` (keys vary per file)

---

### Priority Table

| # | Type | Severity | Impact |
|---|------|----------|--------|
| BUG-1 | Type design | HIGH | Phase 3 ChoiceInput won't render instruction text on fillin/error |
| BUG-2 | Type design | HIGH | Phase 3 CorrectionInput will try to access non-existent correctAnswer |
| BUG-3 | Type design | HIGH | Phase 3 won't show answer/explanation on non-choice questions in 実戦問題5 |
| BUG-4 | Type design | MEDIUM | choiceExplanations will be untyped |
| BUG-5 | Type design | MEDIUM | Section accordion state lost |
| BUG-6 | Type design | MEDIUM | CategoryMap type too rigid for 実戦問題5 |
| MISSING-1 | Type design | MEDIUM | TypeScript errors on questions without hint |
| MISSING-2 | Architecture | LOW | Nice-to-have for Phase 3 |
| MISSING-3-5 | Completeness | LOW | Documentation gaps |

**Summary: 6 BUGS, 5 MISSING, 2 IMPROVEMENTS**

---

### v1 + v2 Remaining Items (from previous audit, still open)

**v1 (3 items):**
- 2 eiken files (`universal_phrases`, `speaking_phrase_bank_simple`) still have `filter:blur` in @keyframes
- `sw.js` CACHE_NAME still v4, cross-origin fix never applied
- Engoo Day 6 `.hdr` still has compound `backdrop-filter`

**v2 (6 items):**
- No CSP headers in vercel.json (SEC-1)
- `poweredByHeader: false` not set (SEC-2)
- `tw-animate-css` still installed (GSAP-3)
- globals.css @keyframes/transition violations need CLAUDE.md exemptions (GSAP-1/2)
- CLAUDE.md build command wrong + legacy HTML undocumented (DOC-1/2)

These are independent of Phase 2 and can be done in parallel or after.

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`

---

## Previous: CEO Fresh Audit: v1 + v2 Post-Triage State (2026-04-10, Opus 4.6 max effort)

**Methodology:** 2 parallel deep-analysis agents (v1 state + v2 state) + 5 web searches (Next.js CVEs, Firebase security, Vercel CSP, service worker patterns, security headers). Every finding verified against current code.

**Previous work sign-off:** v1 crash triage (2026-04-07) was exceptional — 25+ files fixed, all major CEO items addressed, 19 gsap.from locations converted. v2 Phase 0+1 complete, deployed to Vercel. BUG-1/3/4 from v2 review applied.

---

## PART A: v1 Remaining Issues (English-Resources)

### BUG-V1-1: 2 eiken files MISSED by triage — still have `filter:blur` in @keyframes

**Category:** #16 GPU safety

The triage fixed 6 eiken part files but **missed 2 non-numbered files**:

**`英検/準１級/eiken_pre1_universal_phrases.html`:**
- Lines 134-139: `@keyframes cosmicWarpIn` still has `filter: brightness(0) saturate(0)` through `filter: brightness(1) saturate(1)`
- Lines 243-247: `@keyframes cosmicRise` still has `filter: blur(4px)` → `filter: blur(0)`

**`英検/準１級/eiken_pre1_speaking_phrase_bank_simple.html`:**
- Lines 142-146: `@keyframes cosmicWarpIn` — same filter animation
- Lines 251-255: `@keyframes cosmicRise` — same blur animation

**Fix:** Apply the identical changes that were applied to the 6 part files:
- `cosmicWarpIn`: Remove `filter` from all keyframe steps, keep only `opacity`
- `cosmicRise`: Remove `filter: blur()` from all keyframe steps, keep `opacity + transform`

### BUG-V1-2: `sw.js` — cross-origin fix and cache bump NEVER applied

**Category:** Service worker

- Line 7: `CACHE_NAME = 'eng-res-v4'` — **still v4**, never bumped to v5
- No `if (url.origin !== self.location.origin) return;` guard added
- No `.catch()` added to the fetch at line 83

The CSP `connect-src` fix in `firebase.json` (commit `097a45e`) was applied, which resolved the 116 console errors for NEW visitors. But returning visitors with the cached v4 service worker still experience errors until the browser auto-updates the SW (up to 24 hours). Bumping to v5 would force immediate eviction.

**Fix (3 changes):**
```js
// Line 7:
var CACHE_NAME = 'eng-res-v5';

// After line 75 (before static asset check):
if (url.origin !== self.location.origin) return;

// Line 83 — wrap fetch in .catch():
return fetch(event.request).then(function(response) {
  if (response.ok) {
    var clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
  }
  return response;
}).catch(function() { return new Response('', { status: 408 }); });
```

### BUG-V1-3: Engoo Day 6 `.hdr` still has compound `backdrop-filter`

**File:** `高校２年/論理・表現II/Engoo/Day 6｜Local Problems and possible solutions.html` lines 98-99

The triage (item 1A) removed `backdrop-filter` from `.c` cards but left it on `.hdr` (sticky header): `backdrop-filter: saturate(180%) blur(20px)`. Compound `saturate + blur` is especially expensive.

**Fix:** Remove `backdrop-filter` from `.hdr`, change bg to `rgba(15,14,13,0.97)`.

### CONFIRMED CLEAN

- All `gsap.from({opacity:0})` → `gsap.fromTo()` conversions complete (zero bare `gsap.from` calls remain)
- interactive-quiz.css: 2 `backdrop-filter` instances (down from 10) ✓
- teacher-reveal.css: 1 active blur + 1 `none` reset ✓
- dualscope-lesson.css: only `.sub-nav` retains blur (intentional, per CEO review) ✓
- Firebase listeners all have `.off()` cleanup (except `.info/connected` which is a singleton sentinel — acceptable) ✓
- All HTML files under 200KB ✓
- database.rules.json complete with all 9 rule nodes ✓

---

## PART B: v2 Issues (English-Resources-v2)

### SECURITY

#### SEC-1 (HIGH): No Content-Security-Policy header — XSS wide open

**File:** `vercel.json`

v2 has 5 security headers (HSTS, X-Frame-Options, etc.) but ZERO CSP. Any XSS injection has no browser-level barrier. Given the app loads Firebase RTDB data and renders it in the DOM, this is a real attack surface.

**Fix:** Add to vercel.json headers array:
```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.firebaseio.com https://*.googleapis.com https://apis.google.com https://www.gstatic.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://fonts.gstatic.com https://fonts.googleapis.com; frame-src https://*.firebaseapp.com https://accounts.google.com; img-src 'self' data: blob:;"
}
```

Source: [Vercel security headers](https://vercel.com/docs/headers/security-headers), [Next.js CSP guide](https://nextjs.org/docs/pages/guides/content-security-policy)

#### SEC-2 (MEDIUM): `X-Powered-By` header not disabled

**File:** `next.config.ts`

Next.js sends `X-Powered-By: Next.js` by default, revealing the framework to attackers for targeted exploits.

**Fix:** Add `poweredByHeader: false` to next.config.ts:
```ts
const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // ...rest
}
```

Source: [Next.js poweredByHeader docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/poweredByHeader)

#### SEC-3 (LOW): Firebase API key in `public/firebase-config.js`

The API key `AIzaSyD-U-cS30gdz1D-p4KqoYRni9nQdnJZ_L0` is hardcoded in a public file. This is **by design** for Firebase client-side SDKs — security is enforced by Firebase Security Rules, not key secrecy.

**However**, verify in Firebase Console → Project Settings → API Keys that:
1. The key has **HTTP referrer restrictions** set to production domains only
2. The key has **API restrictions** limited to Firebase-related APIs only
3. No other APIs (Maps, Gemini, etc.) are in the key's allowlist

Source: [Firebase API key best practices](https://firebase.google.com/docs/projects/api-keys), [Firebase security checklist](https://firebase.google.com/support/guides/security-checklist)

#### SEC-4 (INFO): CVE status — SAFE

- **CVE-2026-23864** (DoS via memory exhaustion in RSC, CVSS 7.5): Fixed in Next.js 16.1.5. v2 runs **16.1.6** — PATCHED. ✓
- **CVE-2025-66478** (RCE in RSC, CVSS 10.0): Fixed in Next.js 15.x. v2 runs 16.1.6 — PATCHED. ✓
- **CVE-2025-29927** (Middleware bypass, CVSS 9.1): Fixed in Next.js 15.x. v2 runs 16.1.6 — PATCHED. ✓

Source: [CVE-2026-23864](https://www.akamai.com/blog/security-research/cve-2026-23864-react-nextjs-denial-of-service), [CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478)

### GSAP-FIRST VIOLATIONS

#### GSAP-1 (MEDIUM): `globals.css` has 6+ CSS `@keyframes` and `animation:` declarations

**File:** `app/globals.css` lines 105-218

The v2 CLAUDE.md (line 77) says **"Prohibited: CSS `animation:` / `@keyframes`"**. But `globals.css` contains:
- `@keyframes drift` (line ~176)
- `@keyframes pulse` (line ~180)
- `@keyframes fadeIn` (line ~184)
- `animation:` declarations on `.fade-in-1` through `.fade-in-8` utility classes
- Multiple `animation:` properties on hero/glow elements

These are used for page-load entrance animations. Either:
- **Option A:** Convert to GSAP via `useGSAP` in the page components (strict compliance)
- **Option B:** Document a CLAUDE.md exemption: "Page-load skeleton fades using CSS `@keyframes fadeIn` are permitted as a performance optimization (fires before JS loads)"

CEO recommendation: **Option B** — CSS page-load fades are acceptable because they fire before React hydration. GSAP can't animate elements before JS loads. Add the exemption to CLAUDE.md.

#### GSAP-2 (MEDIUM): `globals.css` has blanket `transition:` on `*` and `body`

**File:** `app/globals.css` lines 159-173

```css
*, *::before, *::after {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
```

This enables smooth theme toggle crossfade but violates the GSAP-First prohibition on CSS `transition:`. The transition applies to EVERY element on the page.

**Fix:** Document this as an explicit exemption in CLAUDE.md: "Theme crossfade `transition:` on `background-color`, `color`, `border-color` is permitted on `*` for dark/light toggle smoothness."

#### GSAP-3 (MEDIUM): `tw-animate-css` still installed and imported

**File:** `package.json` + `app/globals.css` line 2

Still present. No `animate-*` classes found in TSX source — it's unused but creates a policy contradiction.

**Fix:** Check if any shadcn component CSS references `animate-*` classes. If not, remove:
```bash
npm uninstall tw-animate-css
# Then remove "@import 'tw-animate-css'" from globals.css line 2
```

### DOCUMENTATION GAPS

#### DOC-1 (MEDIUM): CLAUDE.md Key Commands section says `npx next build`

**File:** `CLAUDE.md` ~line 154

Should say `npm run build` (which maps to `next build --webpack`). Running `npx next build` directly skips the `--webpack` flag and breaks the Serwist service worker build.

#### DOC-2 (MEDIUM): Legacy HTML architecture undocumented in CLAUDE.md

CLAUDE.md only references `lib/firebase.ts` for Firebase. The dual-path architecture (Next.js React + legacy vanilla HTML in `public/content/`) is not documented. Future contributors won't know:
- `public/firebase-config.js` uses Firebase compat SDK (not modular)
- `public/interactive-quiz.js` is a v1 copy with specific crash-fix constraints
- Legacy files must maintain their own `backdrop-filter` cap (max 2)

#### DOC-3 (LOW): Serwist dual-package split not explained

`app/serwist.ts` imports from `@serwist/turbopack` (dev), while `app/serwist/[path]/route.ts` uses `@serwist/next` (build). This split is correct but undocumented.

---

## Priority Table (combined v1 + v2)

| # | Project | Type | Severity | Fix effort |
|---|---------|------|----------|-----------|
| BUG-V1-1 | v1 | GPU safety | HIGH | 15 min (2 files, same pattern as part files) |
| BUG-V1-2 | v1 | Service worker | MEDIUM | 5 min (3 line changes) |
| BUG-V1-3 | v1 | GPU safety | LOW | 2 min (1 element) |
| SEC-1 | v2 | Security (XSS) | HIGH | 10 min (add CSP header) |
| SEC-2 | v2 | Security (info leak) | MEDIUM | 1 min (add config) |
| SEC-3 | v2 | Security (API key) | LOW | 5 min (Firebase Console) |
| GSAP-1 | v2 | Standard compliance | MEDIUM | 5 min (document exemption) |
| GSAP-2 | v2 | Standard compliance | MEDIUM | 2 min (document exemption) |
| GSAP-3 | v2 | Standard compliance | MEDIUM | 5 min (check + remove) |
| DOC-1 | v2 | Documentation | MEDIUM | 1 min |
| DOC-2 | v2 | Documentation | MEDIUM | 10 min |
| DOC-3 | v2 | Documentation | LOW | 5 min |

**Total: 3 v1 bugs, 3 security items, 3 GSAP-First items, 3 doc gaps**
**Estimated fix time: ~1 hour**

---

## Recommended Session Order

1. **v1 quick pass** (~20 min): Fix BUG-V1-1 (2 eiken files), BUG-V1-2 (sw.js), BUG-V1-3 (Engoo Day 6)
2. **v2 security** (~15 min): SEC-1 (CSP), SEC-2 (poweredByHeader), SEC-3 (Firebase Console check)
3. **v2 standards cleanup** (~15 min): GSAP-1/2 (document exemptions), GSAP-3 (remove tw-animate-css)
4. **v2 docs** (~15 min): DOC-1 (build command), DOC-2 (legacy architecture), DOC-3 (serwist split)
5. **Then continue v2 Phase 2** (data extraction)

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`
