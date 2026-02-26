# English Resources — Changelog

Root-level shared modules and infrastructure changes. Content-area changes are tracked in their own changelogs:
- Dual Scope: `高校２年/論理・表現II/Dual Scope/Template & MD & LOG/CHANGELOG.md`
- Eiken Pre-1: `英検/準１級/.upgrade-log.md`

---

## 2026-02-26 — PWA, Accessibility, CI/CD & SEO Improvements

### sw.js
- Fixed `cache.addAll()` failure on Firebase Hosting: dynamic `BASE` from `self.location.pathname`
- Added `offline.html` to pre-cached assets
- Offline fallback: HTML requests now fall back to `offline.html` when no cache match
- Bumped cache to `eng-res-v4`

### offline.html (NEW)
- Friendly offline fallback page matching 404.html design (Japanese messaging, dark mode, home link)

### manifest.json
- Added `screenshots` field (wide + narrow) for richer install prompts on Chromebooks
- Added `shortcuts` for quick access to 高校2年 and 英検 from home screen

### firebase-config.js
- Added `beforeinstallprompt` handler with install banner (dismiss per session)

### interactive-quiz.js
- Added `aria-pressed` to pair and choice buttons (toggles on selection)
- Retry summary dialog: added `role="dialog"`, `aria-modal="true"`, focus trap, Escape key, auto-focus
- Reset confirmation dialog: added `role="dialog"`, `aria-modal="true"`, focus trap, Escape key, focus restoration

### screenshot-wide.png / screenshot-narrow.png (NEW)
- PWA screenshots for manifest (1280x720 wide, 390x844 narrow)

### interactive-quiz.css
- Added `.iq-install-banner` and `.iq-install-dismiss` styles

### spaced-review.js
- Review modal: added `role="dialog"`, `aria-modal="true"`, focus trap, focus restoration on close

### leaderboard.js
- Nickname dialog: added `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close

### firebase.json
- Added `rewrites` rule: `/favicon.ico` -> `/favicon.svg` (silences browser 404)

### Generator (english-resources-generate.py)
- Added JSON-LD `BreadcrumbList` structured data to all generated index pages

### Infrastructure
- Added root CHANGELOG.md (this file)
- Added GitHub Actions workflow: Lighthouse CI + broken link checker (`.github/workflows/quality.yml`)
- Added session notes for Claude (`~/.claude/session-notes/english-resources.md`)
- Added log rotation to autosync script (keeps last 1000 lines when log exceeds 5000)
- Expanded troubleshooting section in SYSTEM-README.md

---

## 2026-02-26 — Stability Fixes + Firebase Hardening

### database.rules.json
- Added `leaderboard/` and `errors/` node rules
- Teacher-only write validation on all nodes

### firebase.json
- Added Content Security Policy header (script-src, style-src, connect-src, font-src, img-src)
- Cache headers: HTML 60s, JS/CSS 300s, SVG/PNG 1yr immutable, sitemap 1day

### leaderboard.js
- Added `.catch()` to all Firebase writes
- Nickname HTML character stripping (XSS prevention)

### student-responses.js
- Added `.catch()` to Firebase writes
- `visibilitychange` handler for Firebase reconnection
- Session lifecycle: clears `responses` on `tr:session-end`

### teacher-reveal.js
- Session start/stop debounce guard
- Client-side error monitoring -> Firebase RTDB `errors/` node
- Teacher data cleanup button
- Presence count display in teacher panel

### sw.js
- Service Worker update notification banner (posts `SW_UPDATED` message to clients)

### spaced-review.js
- localStorage pruning: spaced-review data expires after 90 days, progress after 60 days

---

## 2026-02-25 — Teacher Sound + Fill-in Fix

### teacher-reveal.js
- Q buttons now play UI sounds on click (reveal -> TOGGLE_ON, un-reveal -> TAP)

### interactive-quiz.js
- Fill-in questions with `x` answers now accept empty blanks
- Check popup appears on input `focus` (not just `input`)
- Session event payload sends `x` instead of empty string

### interactive-quiz.css
- Category badge accessibility: `role="img"` + `aria-label`
- Mobile nav follows auto-hide behavior with top nav

---

## 2026-02-24 — Performance Optimization

### interactive-quiz.css
- Removed dark mode `.qcard` `backdrop-filter: blur(12px)` (GPU compositing layer explosion with 7+ cards)
- Added `contain: layout style` for layout containment

### Shared JS (applied via lesson files)
- Card tilt: RAF-throttled `mousemove`, cached `getBoundingClientRect()` on `mouseenter`
- Nav show/hide: RAF-gated document mousemove, `{ passive: true }` scroll hint
- ScrollTrigger: ID-tagged triggers with prefix-based cleanup (prevents accumulation)
- Event delegation: replaced per-element listeners with document-level capture-phase delegation
- Deferred all 10 external scripts (preserves order, unblocks parser)

---

## 2026-02-24 — GSAP-First Animation Migration

### interactive-quiz.css
- Removed all CSS `@keyframes`, `animation`, `transition`, and hover transform/shadow rules
- Simplified `prefers-reduced-motion` to `scroll-behavior: auto` only

### Shared JS (applied via lesson files)
- Full GSAP 3.12.5 migration: entrance timelines, card tilt (`gsap.quickTo`), scroll reveals, nav show/hide, collapsible toggle, progress bar, hover effects
- New GSAP enhancements: smooth view transitions, ScrollTrigger reveals, answer celebration, theme toggle spin, search focus animation

---

## 2026-02-21 — Live Student Responses + Gamification

### student-responses.js (NEW)
- Real-time Firebase-backed response aggregation
- Student side: persistent device ID, writes to `responses/{examId}/{si-qi}/{deviceId}`
- Teacher side: MutationObserver injects response display below Q button grid
- Bar charts with color-coded fills (green correct / red wrong)

### interactive-quiz.js
- Wrong answer review mode: `toggleReviewMode()`, review nav panel with per-section wrong counts
- `answeredKeys` changed from boolean to `"correct"/"wrong"` strings (backward-compatible)
- Gamification: streak counter, 7 achievement badges, trophy gallery panel, toast notifications
- `iq:answer-selected` CustomEvent dispatched for student response tracking

### interactive-quiz.css
- Review mode styles, student response bar charts, gamification (streak, trophy, badge panel, toast)

### database.rules.json
- Added `responses` node with anonymous student write, teacher-only read, validation

---

## 2026-02-21 — Quiz Types: Fill-in, Compose, Scramble Frame, Correction

### interactive-quiz.js
- New `fillin` type: inline blank inputs replacing `( )` patterns, per-input green/red feedback
- New `compose` type: free-form textarea with self-evaluation (Got it right / Got it wrong)
- New `correction` type: error word highlighted, student types replacement
- Scramble frame: surrounding text (prefix/suffix) displayed around word chips
- Labeled scramble format: `[ a. home  b. sooner  c. arrived ]` auto-detected
- Multiple acceptable answers: `correctText` accepts string or array

### interactive-quiz.css
- Styles for fillin inputs, compose textarea/reveal/self-eval, correction highlight/input
- Equal-width choice buttons (`flex: 1 1 0`), full-width check button

---

## 2026-02-21 — UI Sounds + Interactive Quiz Module

### ui-sounds.js (NEW)
- SND.dev library wrapper (SND01 "sine" kit by Dentsu)
- Public API: `UISound.play('click' | 'correct' | 'wrong' | 'reveal')`
- Event delegation for toggle buttons, nav links, theme toggle

### interactive-quiz.js (NEW)
- Reusable IIFE module: transforms `grammarData` questions into interactive exercises
- 4 initial types: `pair`, `choice`, `error`, `scramble`
- Floating score tracker with progress bar
- MutationObserver for SPA re-renders, state restoration on navigation

### interactive-quiz.css (NEW)
- Nordic Glass theme for quiz UI (choices, chips, feedback, score tracker)

### teacher-reveal.js
- CustomEvent bridge with interactive-quiz.js (`tr:session-start`, `tr:session-end`, `tr:question-revealed`)
- Collapsible panel with floating triangle tab
- Auto-hiding login button

### teacher-reveal.css
- Collapse button, collapsed tab, auto-hide login styles

---

## 2026-02 — Firebase Integration

### firebase-config.js (NEW)
- Firebase project configuration for `english-resources-reveal`

### teacher-reveal.js (NEW)
- Firebase Auth (Google sign-in, teacher-only)
- Firebase RTDB for answer reveal state

### teacher-reveal.css (NEW)
- Teacher control panel styling

### answer-fetch.js (NEW)
- Answer data fetching utilities

### sw.js (NEW)
- Service Worker for PWA: cache-first for static assets, network-first for HTML

### manifest.json
- PWA manifest (name, icons, categories, theme color)
