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

---
---

# ACTIVE ZONE

> Only the current task appears here. Old tasks are cleared to prevent file bloat.

---

## CEO REVIEW: Next.js Hybrid Migration Plan (2026-03-29)

**Plan reviewed:** English-Resources v2 — Next.js 16 hybrid migration (Phases 0-8, 10-13 sessions)

Web research completed: Next.js 16 migration guides, Serwist/Turbopack compatibility, GSAP + React 19 useGSAP patterns, localStorage domain migration strategies, state management (useReducer vs Zustand).

---

### BUGS (3) — Will break if not fixed

#### BUG 1: Serwist requires Webpack — plan doesn't mention this

The plan copies Serwist from eiken-correction but Next.js 16 uses Turbopack by default. **Serwist does NOT work with Turbopack** ([confirmed by Serwist docs](https://serwist.pages.dev/docs/next/getting-started) and [LogRocket 2026 guide](https://blog.logrocket.com/nextjs-16-pwa-offline-support/)).

Eiken-correction uses `@serwist/turbopack` (a Turbopack-compatible wrapper), NOT plain `@serwist/next`. The plan's Phase 7 says "Copy Serwist setup from eiken-correction" but doesn't specify which package.

**Fix:** In `package.json` (Phase 0):
```json
{
  "devDependencies": {
    "@serwist/turbopack": "^9.5.6",
    "@serwist/next": "^9.5.6"
  },
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build"
  }
}
```

Use `@serwist/turbopack` (same as eiken-correction), NOT plain Serwist. The eiken-correction `package.json` does NOT use `--webpack` for builds — it works with Turbopack via the `@serwist/turbopack` package.

#### BUG 2: HTML file count is wrong — 28 files, not "19 of 26"

Verified by scanning the repo. Actual count of non-index, non-dashboard HTML files: **28**.

| Category | Files | Count |
|----------|-------|-------|
| Eiken Pre-1 | part1-5, part7, speaking, universal phrases | 8 |
| Dual Scope | L15, L16, L17, practice5, interactive, template | 6 |
| Engoo | Day 6-9 | 4 |
| University exams | TUS (3), Chuo, Hosei, Aoyama, Kogakuin, TMU | 8 |
| Infrastructure | 404.html, offline.html | 2 |

**Fix:** Update Phase 1 to list all 28 files. The "19 standalone + 5 Dual Scope to convert" framing needs correction. Actual split should be: **22 standalone in `public/`** (8 Eiken + 4 Engoo + 8 exams + 2 infra) + **6 Dual Scope to convert to React** (Phase 3/8).

#### BUG 3: localStorage data is domain-scoped — domain change loses all student progress

The plan switches from `harashima-eng.github.io` to a Vercel domain (`*.vercel.app` or custom). **localStorage is per-origin** — all student progress, badges, streaks, dark mode preferences, and spaced review state will be lost.

This affects every student currently using the app. The plan's risk table mentions this but the mitigation ("one-time migration page") is vague.

**Fix:** Add a concrete migration step to Phase 8:

1. **Option A (recommended): Custom domain** — Point `harashima-eng.github.io` CNAME to Vercel. Same domain = same localStorage. Zero data loss.
2. **Option B: Migration page** — If domain must change, deploy a migration page on the OLD domain that reads localStorage and sends it via `postMessage` to a popup on the NEW domain. Pattern: [Auroratide's localStorage migration guide](https://auroratide.com/posts/migrating-localstorage-to-new-domain/).
3. **Option C: Firebase migration** — Before go-live, add a one-time script that uploads localStorage progress to Firebase (keyed by deviceId). New domain reads from Firebase on first visit, writes to localStorage.

Option A is strongly recommended — it eliminates the problem entirely.

---

### MISSING (4) — Plan gaps that need filling

#### MISSING 1: No env var strategy for Firebase keys

Current `firebase-config.js` has **hardcoded API keys** (verified: `AIzaSyD-U-cS30gdz1D-p4KqoYRni9nQdnJZ_L0`). The plan says Phase 0 creates `lib/firebase.ts` with "env vars not hardcoded keys" but doesn't specify:
- Which env vars (`NEXT_PUBLIC_FIREBASE_*`)
- Where they're set (Vercel dashboard? `.env.local`?)
- Whether to use `NEXT_PUBLIC_` prefix (required for client-side access in Next.js)

**Add to Phase 0:**
```
.env.local (gitignored):
  NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD-...
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=english-resources-reveal.firebaseapp.com
  NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://english-resources-reveal-default-rtdb.firebaseio.com
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=english-resources-reveal

Vercel dashboard: same vars for production/preview
```

Note: Firebase API keys are not truly secret (they're restricted by security rules + auth domain), but moving to env vars is still best practice for environment separation.

#### MISSING 2: useReducer for quiz state — consider Zustand instead

The plan uses `useReducer` for QuizProvider (Phase 3). The quiz state is **complex**: score, answeredKeys (map), mode (enum), focus index, retry queue, badges, streaks, spaced review integration. This state is accessed by 20+ components across the tree.

Web research (2026 consensus): For complex cross-component state in Next.js, **Zustand is preferred** over useReducer + Context. Reasons:
- No Context re-render cascade (Zustand uses external store with selectors)
- Simpler API than dispatch/action patterns
- SSR-friendly out of the box
- Immer middleware for immutable updates
- Already proven in quiz apps specifically

**Suggestion:** Replace `QuizProvider.tsx` with a Zustand store:
```typescript
// lib/stores/quiz-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface QuizState {
  score: number
  answeredKeys: Record<string, 'correct' | 'wrong'>
  mode: 'normal' | 'focus' | 'retry' | 'review'
  focusIndex: number
  streak: number
  badges: string[]
  // actions
  answerQuestion: (key: string, correct: boolean) => void
  setMode: (mode: QuizState['mode']) => void
  resetProgress: () => void
}

export const useQuizStore = create<QuizState>()(
  persist(
    immer((set) => ({
      score: 0,
      answeredKeys: {},
      mode: 'normal',
      focusIndex: 0,
      streak: 0,
      badges: [],
      answerQuestion: (key, correct) => set((state) => {
        state.answeredKeys[key] = correct ? 'correct' : 'wrong'
        state.score += correct ? 1 : 0
        state.streak = correct ? state.streak + 1 : 0
      }),
      setMode: (mode) => set({ mode }),
      resetProgress: () => set({ score: 0, answeredKeys: {}, streak: 0 }),
    })),
    { name: 'iq-progress' } // localStorage key
  )
)
```

This eliminates QuizProvider.tsx entirely, removes the Context re-render problem, and the `persist` middleware handles localStorage save/load automatically (replacing the `use-quiz-progress.ts` hook).

Add `zustand` to Phase 0's `package.json`.

#### MISSING 3: No test strategy for grammarData extraction (Phase 2)

The plan mentions "Unit test validates: every question has required fields" but doesn't specify **how to validate the extraction itself** — ensuring the TypeScript data files match the original HTML `grammarData` objects byte-for-byte.

**Add to Phase 2:**
```
Extraction verification script (data/verify-extraction.ts):
1. For each lesson, load the original HTML file
2. Extract the grammarData object via regex or AST parsing
3. Compare against the TypeScript export (JSON.stringify both, diff)
4. Report any differences in question count, text content, or field values
```

This is critical because the Dual Scope golden rule (content accuracy) means the extracted data must be identical to the originals.

#### MISSING 4: Phase ordering issue — CSS migration (Phase 6) after components (Phase 3-5)

The plan builds React components in Phases 3-5, then migrates CSS in Phase 6. But components need styling from day one. What styles do they use during Phases 3-5?

**Clarify:** Add to Phase 3 preamble:
- Import `interactive-quiz.css` as a CSS module initially (quick-and-dirty)
- Phase 6 then converts to Tailwind utilities
- This avoids building unstyled components for 3 sessions

---

### IMPROVEMENTS (4) — Sorted by priority

#### IMPROVEMENT 1 (High): Add `vercel.json` Firebase auth proxy from day one

The plan mentions Firebase auth proxy in Phase 0's `next.config.ts` but doesn't detail it. Eiken-correction's CLAUDE.md has a "Past Mistakes" entry: *"Firebase Auth on custom domains requires proxy rewrite for `/__/auth/*`"*.

**Add to Phase 0 `vercel.json`:**
```json
{
  "rewrites": [
    {
      "source": "/__/auth/:path*",
      "destination": "https://english-resources-reveal.firebaseapp.com/__/auth/:path*"
    }
  ]
}
```

Without this, teacher Google Sign-In will fail on the Vercel domain. Learned the hard way in eiken-correction — don't repeat.

#### IMPROVEMENT 2 (High): `window.IQ` bridge for standalone HTML ↔ React coexistence

During migration (Phases 1-7), standalone HTML files in `public/` still use the old `interactive-quiz.js` which attaches to `window.IQ`. If any page needs to communicate between old and new systems (e.g., teacher reveal spanning both), a bridge is needed.

**Add to Phase 1:**
```typescript
// lib/legacy-bridge.ts
// Exposes React quiz state to window.IQ for standalone HTML files
// that still use the old teacher-reveal.js
export function installLegacyBridge(store: ReturnType<typeof useQuizStore>) {
  window.IQ = window.IQ || {}
  window.IQ.getState = () => store.getState()
  window.IQ.subscribe = store.subscribe
}
```

This can be removed in Phase 8 when all Dual Scope files are React.

#### IMPROVEMENT 3 (Medium): Phase 3 decomposition is under-specified for the biggest risk

Phase 3 (quiz engine) is 2-3 sessions and the plan's risk table flags "scope creep during quiz migration" as High probability. But the implementation sequence (Sessions A/B/C) doesn't specify **what to test between sessions** beyond broad descriptions.

**Add concrete acceptance criteria per session:**
- Session A exit: Lesson 15 renders all 10 sections in 3 categories. Navigation tabs switch. Panels open/close with GSAP. **No interactivity yet.** Screenshot comparison with v1.
- Session B exit: Answer 5 choice + 5 pair + 5 fillin questions. Score increments. Progress bar updates. localStorage persists on reload. Feedback popup appears with GSAP.
- Session C exit: All 7 question types pass manual test matrix (one question per type). Focus mode swipe works on mobile Safari. Retry mode shows only wrong answers. End-of-quiz summary matches v1 scores.

#### IMPROVEMENT 4 (Low): Drop the template HTML file from migration

The plan includes `grammar-template.html` in the Dual Scope files to move to `public/`. This is a **developer template**, not student-facing content. It should stay in the repo as documentation (e.g., `docs/grammar-template.html`) or be converted to a Storybook story, not served in `public/`.

---

### Priority Table

| Priority | Item | Phase | Effort | Notes |
|----------|------|-------|--------|-------|
| **BUG** | Serwist needs `@serwist/turbopack`, not plain Serwist | 0 | 5 min | Wrong package = broken PWA |
| **BUG** | HTML count wrong (28 not 19) | 1 | 15 min | Update file list + routing |
| **BUG** | localStorage lost on domain change | 8 | 30 min | Use custom domain (Option A) or migration page |
| **MISSING** | Firebase env vars strategy | 0 | 10 min | `NEXT_PUBLIC_FIREBASE_*` in `.env.local` + Vercel |
| **MISSING** | Zustand instead of useReducer | 0, 3 | 20 min | Add dep in Phase 0, use in Phase 3 |
| **MISSING** | grammarData extraction verification | 2 | 30 min | Script to diff TS exports vs HTML originals |
| **MISSING** | CSS during Phases 3-5 | 3 | 10 min | Import old CSS as module initially |
| **IMPROVE** | Firebase auth proxy in vercel.json | 0 | 5 min | Learned from eiken-correction |
| **IMPROVE** | window.IQ legacy bridge | 1 | 15 min | Only needed during hybrid phase |
| **IMPROVE** | Phase 3 acceptance criteria | 3 | 10 min | Concrete exit tests per session |
| **IMPROVE** | Drop template HTML from public/ | 1 | 2 min | Dev file, not content |

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`
