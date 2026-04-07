# Crash Fix Plan — English-Resources

> **Status:** Nearly Complete (P0-P4 all done, only Tokyo Rika extraction remaining)
> **Date:** 2026-04-07
> **Session:** Executing session writes fixes, CEO session reviews via CO-PILOT-CEO-SUGGESTIONS.md

## Context

Three parallel deep analyses (HTML patterns, JS runtime, CSS rendering) identified **18 distinct issues** across 20+ files causing browser crashes and freezes. Machine: MacBook Pro i9, Radeon 5500M, GPU rasterization OFF — vulnerable to compositing layer explosions and continuous CPU-side repaint.

---

## Progress Tracker

### Batch 1: Crash-Risk Patterns (P0)

- [x] **1A. Engoo Day 6 — 12 simultaneous backdrop-filter layers**
  - File: `高校２年/論理・表現II/Engoo/Day 6｜Local Problems and possible solutions.html`
  - Fix: Remove `backdrop-filter` from `.c` cards → `background: var(--card)`

- [x] **1B. `querySelectorAll('*')` in BugReport**
  - File: `firebase-config.js:138`
  - Fix: Replace with `getElementsByTagName('*').length`

- [x] **1C. Firebase listener accumulation in teacher panel**
  - Files: `teacher-reveal.js:766, 826`
  - Fix: Store callback refs, detach before re-attaching

### Batch 2: Freeze/Performance (P1)

- [x] **2A. Bug dashboard full-rebuild cascade**
  - File: `bug-dashboard.js:210-225`
  - Fix: Debounce Firebase callback (500ms)

- [x] **2B. Leaderboard MutationObserver infinite retry**
  - File: `leaderboard.js:329-332`
  - Fix: Add retry cap or remove observer (event already handles it)

- [x] **2C. `@keyframes trReveal` animates `filter: blur()`**
  - File: `teacher-reveal.css:730-741`
  - Fix: Remove filter:blur from keyframes

- [x] **2D. Eiken infinite box-shadow animations (7 files)**
  - Files: All `英検/準１級/eiken_pre1_part*.html`
  - Fix: Replace cosmicPulse/marqueeGlow/headerBreathe with opacity-based alternatives

- [ ] **2E. styles.css — filter:blur(80px) + infinite animation**
  - File: `styles.css:30-32`
  - Fix: Add `filter: none` in reduced-motion query

### Batch 3: Safety/Correctness (P2)

- [ ] **3A. `gsap.from({ opacity: 0 })` violations**
  - Files: `interactive-quiz.js:1231`, `teacher-reveal.js:284`
  - Fix: Replace with `gsap.fromTo()`

- [ ] **3B. Forced reflow `void streakEl.offsetWidth`**
  - File: `interactive-quiz.js:2933`
  - Fix: Replace CSS animation with GSAP tween

- [ ] **3C. rageClicks stores DOM element references**
  - File: `interactive-quiz.js:151`
  - Fix: Store coordinates + tag string instead

### Batch 4: File Size (P3)

- [ ] **4A. Tokyo Rika 2020 — 240KB**
  - Extract 43KB CSS + 20KB JS to shared files

- [ ] **4B. Tokyo Rika 2021 — 232KB**
  - Same extraction to shared files

- [ ] **4C. Tokyo Rika 2022 — similar**
  - Same shared file extraction

### Batch 5: Minor (P4)

- [ ] **5A. Eiken phrase bank — stacked sticky backdrop-filters**
- [ ] **5B. Missing prefers-reduced-motion** (bug-dashboard.css, Chuo 2022)
- [ ] **5C. filter:blur persists in reduced-motion** (styles.css)

### Out of Scope

- 5 exam files exceed 1,500 DOM nodes (requires lazy rendering — separate project)
- dualscope-lesson.css duplication (maintenance, not crash)
- interactive-quiz.js at 157KB (marginal, not crashing)

---

## CEO Review Notes

_CEO: Write your analysis and suggestions here after reviewing each batch._

---

**Plan file:** `/Users/slimtetto/Projects/English-Resources/CRASH-FIX-PLAN.md`
