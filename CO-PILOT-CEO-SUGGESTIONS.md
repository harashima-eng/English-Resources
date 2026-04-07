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

---
---

# ACTIVE ZONE

> Only the current task appears here. Old tasks are cleared to prevent file bloat.

---

## Current Task: Fix HTML Page Crashes (2026-04-07)

**Plan file:** `CRASH-FIX-PLAN.md` (repo root) — has full details + progress checkboxes

**Summary:** 18 issues across 20+ files causing browser crashes/freezes. Three parallel analyses identified:
- **P0 (Crash):** Engoo Day 6 has 12 stacked backdrop-filter layers (same pattern that crashed Dual Scope), querySelectorAll('*') in BugReport fires up to 16 DOM scans, Firebase listeners stack in teacher panel
- **P1 (Freeze):** Bug dashboard rebuilds Chart.js on every Firebase push, leaderboard observer retries forever, trReveal animates filter:blur(), 7 Eiken files run infinite box-shadow animations, styles.css has 3 large blur(80px) elements
- **P2 (Safety):** 2 gsap.from({opacity:0}) violations, forced reflow pattern, DOM refs in rageClicks
- **P3 (Size):** 3 Tokyo Rika files over 200KB with extractable inline CSS/JS

**CEO: Please review `CRASH-FIX-PLAN.md` and write suggestions below before Batch 2 begins.**

### CEO Review (2026-04-07, Opus 4.6 max effort)

**Methodology:** 3 parallel deep-analysis agents (project structure, CSS/compositing patterns, JS runtime patterns) + manual verification of every critical finding. Every line number below has been directly read and confirmed.

---

## BUGS in the Plan (will crash/break if not fixed)

### BUG-1: 2E fix is WRONG -- "add `filter: none` in reduced-motion" does NOT fix the primary crash

The plan says: `styles.css:30-32` -- "Fix: Add `filter: none` in reduced-motion query"

**This only fixes reduced-motion users.** The PRIMARY crash is that ALL dark-mode users get 3x `filter:blur(80px)` + infinite `@keyframes` animation on `transform`. The `prefers-reduced-motion:reduce` media query at line 25 already disables all animations (`animation:none!important`), so reduced-motion is already handled.

**Correct fix:** Edit `/usr/local/bin/english_resources/templates.py` (NOT `styles.css` which is generated). In `MAIN_STYLE` lines 70-72, remove `;animation:glowPulseN ...` from each selector. Delete lines 74-76 (`@keyframes glowPulse1/2/3`). Keep `filter:blur(80px)` -- static blur is a one-time rasterization, perfectly safe. Run generator after.

### BUG-2: Plan MISSES the biggest crash source -- `interactive-quiz.css` has 10 stacked `backdrop-filter` instances

**Not mentioned anywhere in the plan.** This affects EVERY quiz page on the site (all Dual Scope lessons, all Engoo lessons, all exam pages that load `interactive-quiz.css`).

10 distinct elements with `backdrop-filter` in this one file:
- `.iq-progress-tab` (line 325, blur 16px)
- `.iq-progress-panel` (line 395, blur 20px)
- `.iq-review-nav` (line 1038, blur 16px)
- `.iq-check-popup` (line 1491, blur 10px)
- `.iq-confirm-overlay` (line 1665, blur 4px)
- `.sr-modal-overlay` (line 2022, blur 4px)
- `.lb-panel` (line 2319, blur 20px)
- `.lb-overlay` (line 2440, blur 4px)
- `.iq-focus-arrow` (line 2678, blur 8px)
- `.iq-focus-indicator` (line 2714, blur 8px)

Multiple are visible simultaneously during quiz interaction. This is the mass-stacking scenario the project CLAUDE.md says doesn't exist.

**Fix:** Keep `backdrop-filter` only on `.iq-progress-panel` (line 395) and `.iq-progress-tab` (line 325). Remove from all 8 others, bump bg opacity to 0.95-0.97. For overlays, use `rgba(0,0,0,0.55)` solid.

### BUG-3: Plan MISSES `dualscope-lesson.css` -- 2 stacked sticky navbar backdrop-filters

Marked "out of scope (maintenance, not crash)" in the plan. **This IS a crash risk.** Two fixed-position navbars (`.top-nav` at blur 20px, `.sub-nav` at blur 16px) are ALWAYS visible simultaneously on every Dual Scope lesson page. Each has both light and dark variants = 4 `backdrop-filter` declarations.

**Fix:** Remove `backdrop-filter` from `.top-nav` (line 48 light, line 58 dark), change bg to `rgba(250,248,245,0.97)`. Keep on `.sub-nav`. Also remove from `.retry-view-header` (line 822).

### BUG-4: Plan MISSES Eiken `cosmicWarpIn` -- the MOST dangerous animation in the eiken files

Plan item 2D mentions cosmicPulse/marqueeGlow/headerBreathe but MISSES `cosmicWarpIn` (all 8 files, ~line 141). This animation applies `filter: brightness(0) saturate(0)` to `.page-wrap` -- the ENTIRE page wrapper -- during a 2.2s entrance. This forces the ENTIRE PAGE into a single compositing layer and invalidates all child `backdrop-filter` elements (like `.top-bar`) during load. This is the worst single animation in the eiken files.

**Fix:** Remove `filter` from `@keyframes cosmicWarpIn`, keep only `opacity`:
```css
@keyframes cosmicWarpIn {
  0% { opacity: 0; }
  30% { opacity: 0; }
  60% { opacity: 0.6; }
  100% { opacity: 1; }
}
```

### BUG-5: Plan MISSES Eiken `cosmicRise` -- `filter:blur + transform` double invalidation

All 8 eiken files, ~line 253. Animates `transform: translateY` AND `filter: blur(4px)` together. Combined invalidation on 3 elements (`.presents`, `.tagline`, `.film-progress`).

**Fix:** Remove `filter: blur()` from `@keyframes cosmicRise`, keep `opacity + transform`.

### BUG-6: Plan's gsap.from count is incomplete -- MISSES 4 Dual Scope HTML files (8 locations)

Plan item 3A lists only `interactive-quiz.js:1231` and `teacher-reveal.js:284`. But the SAME dangerous `gsap.from(items, {opacity:0})` pattern exists in:

**Collapsible toggle** (items get stuck invisible on rapid toggle):
- `Lesson 15｜接続詞.html` line 1227
- `Lesson 16｜名詞・冠詞・代名詞.html` line 1234
- `Lesson 17｜形容詞・副詞・群動詞.html` line 1196
- `実戦問題5｜総合問題.html` line 1323

**Section navigation** (badge/title get stuck invisible on rapid nav):
- Lesson 15 lines 1131-1132
- Lesson 16 lines 1138-1139
- Lesson 17 lines 1100-1101
- 実戦問題5 lines 1227-1228

**Fix for each:** `gsap.killTweensOf(items)` before + convert `gsap.from` to `gsap.fromTo` with explicit end state.

---

## MISSING from the Plan

### MISSING-1: `student-responses.js` -- MutationObserver on `document.body` with `subtree:true` never disconnected

**File:** `student-responses.js` lines 292-299

If teacher never logs in, this observer watches EVERY DOM mutation on the entire page for the session lifetime. On quiz pages with lots of card/collapsible interactions, this fires hundreds of times per session.

**Fix:** Add `setTimeout(function() { if (!isTeacher) panelCheck.disconnect(); }, 60000);` after line 299.

### MISSING-2: `teacher-reveal.css` compound `backdrop-filter`

Plan item 1C mentions Firebase listeners but not the CSS. `.tr-panel` (line 109) has `backdrop-filter: blur(24px) saturate(1.4)` -- compound filter is more expensive than single. Simplify to `blur(16px)`, remove `saturate`. Also remove `backdrop-filter` from `.tr-login-btn` (line 18), `.tr-toast` (line 758), `.tr-reopen-btn` (line 937).

### MISSING-3: `eiken_pre1_speaking_phrase_bank_simple.html` -- scroll listener missing `{ passive: true }`

Line 1797. All other eiken files have it. Easy 1-line fix.

### MISSING-4: Project CLAUDE.md lines 55-56 are incorrect

Says "this project doesn't do" mass stacked backdrop-filter. It does. Update documentation after fixes.

---

## IMPROVEMENTS to Existing Plan Items

### IMP-1: Item 1A priority should be lower

Engoo Day 6 having 12 stacked backdrop-filters is real, but it only affects ONE page. The `interactive-quiz.css` 10-instance problem (BUG-2 above) affects EVERY quiz page. Fix the shared CSS first.

### IMP-2: Items should be re-prioritized by blast radius

Current P0 has only 3 items. Suggested P0 (crash-risk, broad impact):
1. BUG-1 (templates.py glow fix) -- affects ALL index pages
2. BUG-2 (interactive-quiz.css 10 instances) -- affects ALL quiz pages
3. BUG-3 (dualscope-lesson.css navbars) -- affects ALL Dual Scope pages
4. BUG-4+5 (eiken cosmicWarpIn + cosmicRise) -- affects ALL eiken pages
5. MISSING-2 (teacher-reveal.css compound filter) -- affects ALL teacher panels
6. Existing 2D (eiken infinite animations) -- affects ALL eiken pages

Then P1 for functional bugs (gsap.from), P2 for memory leaks, P3 for minor items.

---

## Validated Items (plan got these right)

- 1B: `querySelectorAll('*')` in BugReport -- confirmed legitimate, good catch
- 1C: Firebase listener accumulation -- confirmed, adding connectedStudents cleanup
- 2A: Bug dashboard rebuild cascade -- confirmed and UPGRADED to HIGH priority. `on('value')` at line 210 triggers 7 function calls including 2x Chart.js destroy/create on every Firebase push. With `limitToLast(500)` initial load + rapid incoming reports, the page freezes before it even renders. The fix (debounce 500ms) in the plan is correct but may not be enough -- also add `requestAnimationFrame` guard so `renderCharts` can't overlap itself
- 2B: Leaderboard infinite retry -- confirmed at line 329
- 2C: trReveal filter:blur -- confirmed at lines 730-740
- 3B: Forced reflow void offsetWidth -- valid concern
- 3C: rageClicks DOM refs -- valid
- 4A-C: Tokyo Rika file sizes -- confirmed 240KB/232KB/132KB

---

**Summary: 6 BUGS (in plan), 4 MISSING, 2 IMPROVEMENTS**

The plan covers ~60% of the crash surface area. The other 40% (especially BUG-2: interactive-quiz.css 10 instances) is arguably the MOST impactful fix because it affects every single quiz page, not just one file.

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`
