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

## CEO Strategic Recommendation (2026-04-07)

### The Verdict: Stop patching v1. Emergency triage + pivot to v2.

**v1 is structurally broken.** The crash audit found 25+ issues across 20+ files in a codebase of 10,000+ lines of untyped vanilla JS with no tests, no component reuse, and CSS animation patterns that are fundamentally incompatible with this machine's GPU config. The executing session's fix plan covers 60% of crash surface. My review found 40% more. Even if we fix everything, the architecture guarantees new bugs will appear -- every lesson file duplicates hundreds of lines of inline JS, any change to the quiz engine requires editing 10+ files, and there's no way to test regressions.

**v2 migration plan already exists** at `/Users/slimtetto/Projects/English-Resources-v2/MIGRATION-PLAN.md`. It's well-designed (CEO-reviewed 2026-03-29, all 11 items applied). It eliminates every root cause: React components replace duplicated inline JS, Zustand replaces fragile localStorage, @serwist/turbopack replaces the broken sw.js, TypeScript catches data bugs, Vitest prevents regressions, and GSAP-First with `useGSAP` hooks prevents the `gsap.from({opacity:0})` pattern by design.

---

### Two-Track Plan

#### Track 1: Emergency Triage on v1 (1 session, ~45 min)

Fix ONLY the 3 items that make the site unusable RIGHT NOW. Don't touch anything else -- every v1 edit is throwaway work.

**FIX 1 (do first): `sw.js` -- 116 console errors blocking all pages**

3 changes:
```js
// Line 7: bump cache version to force old SW eviction
var CACHE_NAME = 'eng-res-v5';

// After line 75: skip cross-origin requests
if (url.origin !== self.location.origin) return;

// Line 83: add .catch() to static asset fetch
return fetch(event.request).then(function(response) {
  if (response.ok) {
    var clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) {
      cache.put(event.request, clone);
    });
  }
  return response;
}).catch(function() {
  return new Response('', { status: 408 });
});
```

**FIX 2: `interactive-quiz.css` -- 10 stacked `backdrop-filter` crashing every quiz page**

Remove `backdrop-filter` + `-webkit-backdrop-filter` from 8 of 10 elements. Keep only on `.iq-progress-panel` (line 395) and `.iq-progress-tab` (line 325). For each removed element, bump background opacity to 0.95-0.97. For overlays, use `rgba(0,0,0,0.55)` solid. Update both light and dark variants.

Elements to strip (remove both `backdrop-filter` and `-webkit-backdrop-filter` lines):
- `.iq-review-nav` (line 1038)
- `.iq-check-popup` (line 1491)
- `.iq-confirm-overlay` (line 1665)
- `.sr-modal-overlay` (line 2022)
- `.lb-panel` (line 2319)
- `.lb-overlay` (line 2440)
- `.iq-focus-arrow` (line 2678)
- `.iq-focus-indicator` (line 2714)

**FIX 3: `templates.py` -- 3x blur(80px) + infinite animation crashing every index page (dark mode)**

Edit `/usr/local/bin/english_resources/templates.py` MAIN_STYLE:
- Lines 70-72: remove `;animation:glowPulseN ...` from each selector
- Lines 74-76: delete the 3 `@keyframes glowPulse1/2/3` blocks
- Run generator to regenerate `styles.css`

**That's it for v1.** Don't fix the eiken animations, don't fix the gsap.from patterns, don't fix the memory leaks. Those pages still work (they're slow but not crashing). The 3 fixes above stop the hard crashes. Everything else gets fixed properly in v2.

---

#### Track 2: Begin v2 Migration (start immediately after triage)

**Migration plan:** `/Users/slimtetto/Projects/English-Resources-v2/MIGRATION-PLAN.md`

**Phase 0 (scaffold)** is the starting point. The plan is CEO-approved and ready to execute.

**What v2 eliminates permanently:**

| v1 Problem | v2 Solution |
|-----------|-------------|
| 10 stacked `backdrop-filter` in interactive-quiz.css | Tailwind + solid bg for overlays, max 2 glass elements per component |
| 3x `filter:blur(80px)` + infinite CSS animation | Static GSAP-set blurs, no CSS @keyframes anywhere |
| `gsap.from({opacity:0})` in 10 locations across 6 files | `useGSAP` hook enforces `gsap.fromTo()` pattern, TypeScript catches it |
| Duplicated inline JS in every lesson HTML | React components, one source of truth |
| sw.js intercepting cross-origin fonts | @serwist/turbopack with proper routing, CSP in vercel.json |
| 157KB interactive-quiz.js monolith | ~30 components, code-split by route |
| No tests, no types | Vitest + TypeScript strict mode |
| Firebase listeners never cleaned up | `use-firebase-value.ts` hook with auto-cleanup on unmount |
| MutationObserver on document.body | React context replaces DOM observation |
| Bug dashboard freezing on Chart.js rebuild | Keep as standalone HTML in `public/dashboard/` (not worth porting) |

**Session order for v2:**
1. Phase 0: Scaffold + infra + landing page (1 session)
2. Phase 1: Copy 22 static HTML files to `public/`, build navigation pages (1 session)
3. Phase 2: Extract grammarData to TypeScript, verify with diff script (1 session)
4. Phase 3: Quiz engine React components + Zustand (2-3 sessions -- the big one)
5. Phase 4-8: Teacher reveal, spaced review, CSS migration, PWA, go live

**Total: 10-13 sessions.** Students use the triage'd v1 until Phase 1 is live (2 sessions from now), then v2 serves static content pages immediately while quiz components are built in parallel.

---

### Lessons for v2 (from this crash audit)

Add to v2 CLAUDE.md:

| Rule | Why (from v1 crash audit) |
|------|--------------------------|
| Max 2 `backdrop-filter` per page | v1 had 10 in one CSS file, crashed every quiz page |
| Never `filter:blur()` in CSS @keyframes | v1 had 3x blur(80px) + infinite animation = WebProcess crash |
| Never `filter` on page wrapper elements | v1 `cosmicWarpIn` put filter on `.page-wrap`, invalidated all child layers |
| Always `gsap.fromTo()`, never `gsap.from({opacity:0})` | v1 had 10 locations where elements got stuck invisible |
| Service worker: skip cross-origin, always `.catch()` | v1 sw.js caused 116 unhandled errors per page load |
| Firebase listeners: store ref, cleanup on unmount/logout | v1 leaked listeners on every teacher login/logout cycle |
| MutationObserver: always add timeout for disconnect | v1 observed document.body forever if teacher never logged in |

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`
