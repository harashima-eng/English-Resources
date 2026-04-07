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

---
---

# ACTIVE ZONE

> Only the current task appears here. Old tasks are cleared to prevent file bloat.

---

## CEO Sign-Off: v1 Crash Triage + v2 Phase 0-1 (2026-04-08)

### Verdict: APPROVED. Exceptional execution.

The executing session shipped 25+ file fixes across v1 and completed Phase 0 + Phase 1 of v2 in a single session. Quality is high -- every CEO crash bug was addressed, and the session found additional issues the CEO audit missed.

### v1 Triage Scorecard

| CEO Item | Result |
|----------|--------|
| BUG-1 (templates.py glow animations) | FIXED |
| BUG-2 (interactive-quiz.css 10 backdrop-filters → 2) | FIXED |
| BUG-3 (dualscope-lesson.css stacked navbars) | FIXED |
| BUG-4 (eiken cosmicWarpIn filter on page-wrap) | FIXED |
| BUG-5 (eiken cosmicRise filter:blur + transform) | FIXED |
| BUG-6 (gsap.from → fromTo, CEO found 10 locations) | FIXED — found **19** locations across 7 files |
| BUG-7 (sw.js CSP / connect-src) | FIXED (CSP headers deployed) |
| MISSING-1 (student-responses.js MutationObserver timeout) | FIXED |
| MISSING-2 (teacher-reveal.css compound backdrop-filter) | FIXED (5 → 1) |
| MISSING-3 (passive scroll listener) | FIXED |
| MISSING-4 (CLAUDE.md backdrop-filter docs) | FIXED |

**Bonus fixes the CEO missed:**
- Database rules overwritten by eiken-correction subset — broke ALL Firebase reads/writes (40 days broken!)
- Bug dashboard double Firebase init + debounced rebuild cascade
- Error reporter per-session cap (10 max)
- `.info/connected` timer cleanup on phone lock/unlock
- Tokyo Rika CSS extracted to shared file (240KB → 196KB, 232KB → 196KB)
- Chuo 2022 missing prefers-reduced-motion

### v2 Migration Scorecard

| CEO Item | Result |
|----------|--------|
| BUG-1 (build --webpack for Serwist) | FIXED |
| BUG-2 (tw-animate-css GSAP-First violation) | PENDING — check if shadcn needs it |
| BUG-3 (Zustand ^5.0.5 persist bug) | FIXED — upgraded to 5.0.12 |
| BUG-4 (deploymentEnabled: false) | FIXED |
| BUG-5 (v1 crash bugs in public/ copies) | PENDING |
| MISSING-1 (CSP headers in vercel.json) | PENDING |
| MISSING-3 (Zustand middleware order) | PENDING |

### v2 Production: https://english-resources-v2.vercel.app
Phase 0 (scaffold) + Phase 1 (25 static files, folder nav) complete and deployed.

---

### Remaining Items for Next Session (6 items, ~1 hour)

**Priority order:**

1. **BUG-5 (HIGH): Re-copy v1 triage fixes to v2 `public/` files**
   - v2's `public/interactive-quiz.css`, `public/teacher-reveal.js`, etc. are pre-triage copies
   - Students on v2 will crash on the same bugs until these are updated
   - Simplest: re-copy all shared JS/CSS from v1 after triage to v2's public/

2. **MISSING-1 (HIGH): Add CSP headers to v2 `vercel.json`**
   - Currently wide open — no CSP at all
   - Use the CSP from the v2 migration review (includes fonts.gstatic.com in connect-src)
   - Test that Google Fonts, Firebase, GSAP CDN all still work after adding CSP

3. **BUG-2 (MEDIUM): Check if shadcn needs `tw-animate-css`**
   - `@import 'tw-animate-css'` in globals.css line 2 violates GSAP-First
   - Run `npx shadcn@latest diff` or check if any shadcn components use `animate-*` classes
   - If shadcn needs it: keep it but document the exemption in CLAUDE.md
   - If shadcn doesn't need it: remove package + import

4. **MISSING-3 (MEDIUM): Verify Zustand middleware order**
   - Correct order: `devtools(persist(immer(...)))` — outermost to innermost
   - Check `lib/stores/quiz-store.ts` when it's created in Phase 3
   - Not urgent until Phase 3 (quiz engine) begins

5. **IMP-3 (LOW): Add `@next/bundle-analyzer`**
   - eiken-correction has it, v2 doesn't
   - Useful for Phase 3 when building the quiz component tree
   - `npm install -D @next/bundle-analyzer@^16.2.1`

6. **IMP-2 (LOW): Consider `display: 'swap'` for Noto Sans JP**
   - Prevents invisible Japanese text on slow connections
   - In `layout.tsx`: `Noto_Sans_JP({ subsets: ['latin'], variable: '--font-noto', display: 'swap' })`

---

### Lessons Learned (add to v2 CLAUDE.md if not already there)

| Lesson | Source |
|--------|--------|
| Database rules can silently get overwritten by other project deploys | v1 triage — 40 days broken |
| Always check `connect-src` AND `font-src` for Google Fonts in CSP | v1 sw.js 116 errors |
| `gsap.from({opacity:0})` was in **19** locations, not the 2 the original plan found | Pattern spreads faster than expected |
| Serwist production build requires `--webpack` flag with Next.js 16 | v2 CEO BUG-1 |
| Zustand persist middleware had a bug in v5.0.5-5.0.9 | v2 CEO BUG-3 |

---

## Previous: v2 Migration Plan Review (2026-04-08)

**Plan reviewed:** `/Users/slimtetto/Projects/English-Resources-v2/MIGRATION-PLAN.md`
**Current state:** Phase 0 complete, Phase 1 partially done (25/28 HTML files copied, route pages built)
**Methodology:** Web search for dependency compatibility + code audit of v2 scaffold + cross-reference with eiken-correction

---

### BUGS (will break in production)

#### BUG-1: Build script missing `--webpack` flag -- Serwist won't generate service worker

**File:** `package.json` scripts

Current: `"build": "next build"`
Required: `"build": "next build --webpack"`

Serwist does not support Turbopack for production builds. Without `--webpack`, `next build` uses Turbopack (Next.js 16 default), and the service worker is never generated. The dev script correctly uses `--turbo` (Serwist isn't needed in dev), but production build MUST use webpack.

Source: [Serwist Turbopack docs](https://serwist.pages.dev/docs/next/turbo), [Turbopack build feedback](https://github.com/vercel/next.js/discussions/77721)

#### BUG-2: `tw-animate-css` violates GSAP-First standard

**Files:** `package.json` + `app/globals.css` line 2

`tw-animate-css: ^1.4.0` is installed AND imported (`@import 'tw-animate-css'`). This provides Tailwind `animate-*` classes. The project's own CLAUDE.md line 78 says: **"Prohibited: Tailwind `animate-*` classes"**.

**Fix:** Remove `tw-animate-css` from package.json. Remove `@import 'tw-animate-css'` from globals.css. If shadcn components need animation, they should use GSAP via `useGSAP` or be exempted as "shadcn internal CSS" per the standard.

**Note:** shadcn v4 may have been installed with `tw-animate-css` as a peer dependency. Check if removing it breaks any shadcn components -- if so, the shadcn exemption applies and keep it, but add a comment explaining why.

#### BUG-3: `zustand: ^5.0.5` has a persist middleware bug -- upgrade to `^5.0.10`

**File:** `package.json`

A critical bug in Zustand v5.0.9 and earlier causes state inconsistencies with the persist middleware. Fixed in v5.0.10 (January 2026). Since Zustand persist is the FOUNDATION of quiz state (score, answeredKeys, badges, streaks), this bug would cause random state loss.

**Fix:** `npm install zustand@^5.0.10`

Source: [Zustand persist docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist), [v5 migration](https://github.com/pmndrs/zustand/blob/main/docs/migrations/migrating-to-v5.md)

#### BUG-4: `vercel.json` disables auto-deployment

**File:** `vercel.json` line 4-5

`"deploymentEnabled": false` means pushes to GitHub won't trigger Vercel builds. This contradicts Phase 7 requirement: "Push to main triggers full deploy pipeline."

**Fix:** Remove the `"git": { "deploymentEnabled": false }` block, or change to `true`. If this was intentional during scaffold (to prevent deploying incomplete work), add a TODO to re-enable before Phase 7.

---

### BUGS (will crash on user machines)

#### BUG-5: v1 crash bugs are copied verbatim into v2's `public/`

**Files:** `public/interactive-quiz.css` (65KB), `public/interactive-quiz.js` (157KB), `public/teacher-reveal.js`, `public/teacher-reveal.css`, etc.

These are exact copies of v1 files -- they still have:
- 10 stacked `backdrop-filter` in interactive-quiz.css
- `gsap.from({opacity:0})` without killTweensOf in teacher-reveal.js
- Memory leaks in leaderboard.js and student-responses.js
- No `.catch()` on service worker fetches

Phase 1 students using the standalone HTML files in `public/content/` will experience the same crashes as v1.

**Fix:** Apply the 3 emergency triage fixes from the v1 CEO suggestions to the v2 public/ copies too:
1. `public/interactive-quiz.css` -- strip 8 of 10 `backdrop-filter` instances
2. `public/interactive-quiz.js` -- no sw.js issue here (Serwist handles it), but fix the other JS bugs
3. Or better: after v1 triage, just re-copy the fixed files to v2's public/

---

### MISSING

#### MISSING-1: No CSP headers in `vercel.json`

v1's CSP caused 116 service worker errors. v2 has NO CSP at all -- wide open for XSS.

**Fix:** Add CSP to vercel.json headers. Include `fonts.gstatic.com` in BOTH `font-src` AND `connect-src` from day one (v1 lesson learned). For Next.js 16, consider nonce-based CSP via middleware for inline scripts, but be aware this disables static optimization.

Recommended starting CSP (add to vercel.json headers array):
```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.firebaseio.com https://*.googleapis.com https://apis.google.com https://www.gstatic.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://fonts.gstatic.com https://fonts.googleapis.com; frame-src https://*.firebaseapp.com https://accounts.google.com; img-src 'self' data: blob:;"
}
```

Source: [Next.js CSP guide](https://nextjs.org/docs/pages/guides/content-security-policy), [Vercel security headers](https://vercel.com/docs/headers/security-headers)

#### MISSING-2: No middleware.ts for auth -- CVE-2025-29927 awareness

The migration plan mentions teacher Google Sign-In but has no Next.js middleware for route protection. When middleware IS added (Phase 4), be aware of [CVE-2025-29927](https://www.authgear.com/post/nextjs-security-best-practices) -- a CVSS 9.1 vulnerability where attackers bypass middleware by sending an `x-middleware-subrequest` header. Ensure Next.js 16.1.6 includes the fix (it should, as the CVE was patched in 15.x).

#### MISSING-3: Zustand middleware order matters

The migration plan shows `persist(immer(...))`. The correct middleware order for Zustand v5 is:
```typescript
create()(devtools(persist(immer((set) => ({...})))))
```
Outermost → innermost: `devtools` → `persist` → `immer`. If reversed, persist serialization will capture immer drafts instead of finalized state.

Source: [Zustand middleware guide](https://medium.com/@skyshots/taking-zustand-further-persist-immer-and-devtools-explained-ab4493083ca1)

#### MISSING-4: GSAP 3.14 SplitText breaking change

Not currently used, but Phase 6 (visual polish) might add text animations. GSAP 3.14 has a known issue where SplitText causes text elements to go missing when used with `useGSAP` in React. If SplitText is ever added, use 3.13 or verify the fix.

Source: [GSAP issue #636](https://github.com/greensock/GSAP/issues/636)

#### MISSING-5: Firebase compat deprecation timeline

The standalone HTML files in `public/` use Firebase compat SDK (`firebase/compat/`). Firebase has stated compat will be **removed in a future major version**. While v12 still supports compat, this is a ticking clock. The migration plan correctly uses modular Firebase for React components, but the public/ files will need eventual migration or removal (Phase 8).

Source: [Firebase compat deprecation RFC](https://github.com/firebase/firebase-js-sdk/discussions/7611)

---

### IMPROVEMENTS

#### IMP-1: Add `HSTS` preload to vercel.json -- DONE (already present, good)

The vercel.json already has `Strict-Transport-Security` with preload. Good.

#### IMP-2: Consider `next/font` `display: 'swap'` for Noto Sans JP

`layout.tsx` loads Noto Sans JP with default display. For a Japanese education site, explicit `display: 'swap'` ensures text is immediately visible with fallback font while CJK glyphs load. This prevents invisible Japanese text on slow connections.

#### IMP-3: Add `@next/bundle-analyzer` like eiken-correction

eiken-correction has `@next/bundle-analyzer: ^16.2.1`. v2 doesn't. Add it now so Phase 3 (quiz engine, the biggest component tree) can be monitored for bundle size regressions.

---

### Priority Table

| # | Type | Severity | Fix effort |
|---|------|----------|-----------|
| BUG-1 | Build | CRITICAL (no SW in prod) | 1 min (add `--webpack`) |
| BUG-2 | Standard violation | HIGH | 5 min (remove package + import) |
| BUG-3 | State corruption | HIGH | 1 min (npm install) |
| BUG-4 | Deploy broken | MEDIUM | 1 min (change flag) |
| BUG-5 | Crash in public/ files | HIGH | 30 min (re-copy after v1 triage) |
| MISSING-1 | Security | HIGH | 10 min (add CSP header) |
| MISSING-2 | Security awareness | LOW | 0 min (just know about it) |
| MISSING-3 | State corruption | MEDIUM | 2 min (check middleware order) |
| MISSING-4 | Future awareness | LOW | 0 min (just know about it) |
| MISSING-5 | Deprecation | LOW | 0 min (Phase 8 handles it) |

**Summary: 5 BUGS, 5 MISSING, 3 IMPROVEMENTS**
**Estimated fix time: ~50 min (mostly BUG-5 re-copy)**

---

### What the plan got RIGHT

- Auth proxy in `next.config.ts` from day one (eiken-correction lesson learned)
- `@serwist/turbopack` (not plain Serwist)
- Zustand + immer over useReducer + Context
- `gsap.fromTo()` enforced in CLAUDE.md
- 25 static files already copied to public/content/
- Firebase modular API for React components
- Same Firebase project (no data migration needed)
- AGENTS.md warning about Next.js 16 API differences

---

## Previous: CEO Strategic Recommendation (2026-04-07)

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
