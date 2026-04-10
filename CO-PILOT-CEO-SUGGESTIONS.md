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

---
---

# ACTIVE ZONE

> Only the current task appears here. Old tasks are cleared to prevent file bloat.

---

## CEO Review: Phase 2 Type System + Data Extraction (2026-04-10, Opus 4.6 max effort)

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
