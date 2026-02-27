# DUAL SCOPE Grammar Breakdown - Changelog

## 2026-02-27 — Dual Scope Upgrade: Keyboard, Sounds, Focus Mode, Print

### Keyboard Shortcuts (interactive-quiz.js)
- J/K: navigate between questions (GSAP proxy scroll)
- H/W/A: toggle Hint/Words/Answer on nearest card
- P: toggle progress panel, F: toggle focus mode
- Escape priority chain: badge panel > focus mode > review nav > progress > popup > collapsible
- 1-9: select scramble pool chips, Backspace: undo last scramble chip
- `a` key collision: selects choice when unlocked zone exists, toggles answer otherwise
- Keyboard hint badges (`<span class="iq-kbd-hint">`) injected in toggle buttons
- Toggle button in top-nav-right (keyboard icon), hidden on touch devices
- Preference stored in localStorage('iq-kbd-hints')

### Enhanced Sound Design (ui-sounds.js)
- New sound mappings: select, toggleOff, button, notify, disabled, transUp, transDown
- Choice selection now plays SELECT (was TAP)
- Toggle close plays TOGGLE_OFF, check popup plays BUTTON
- Badge unlock plays CELEBRATION + NOTIFICATION double-play
- Nav clicks play TRANSITION_UP, locked zone clicks play DISABLED
- Mute toggle button in top-nav-right, persisted in localStorage
- Public API: UISound.muted, UISound.toggleMute()

### Focus Mode (interactive-quiz.js + interactive-quiz.css)
- Single-question view with prev/next navigation
- Toggle via F key or crosshair button in top-nav-right
- GSAP slide transitions between questions (opacity + x + scale)
- Navigation overlay: fixed arrows (left/right), position indicator pill (bottom center)
- Mobile swipe support (horizontal threshold 50px)
- Integrates with retry/review modes (rebuilds card list on mode change)
- localStorage persistence per exam
- Escape exits focus mode

### Print-Friendly Stylesheet (dualscope-lesson.css)
- @media print section hides interactive UI, resets colors
- Clean single-column card layout with borders, page-break-inside: avoid
- body.print-answers class shows answer sections
- Print button on Home view (all 4 lessons) with answers dialog
- 2-column layout for overview/conjugation grids

### Files Changed
- interactive-quiz.js: +350 lines (keyboard, sounds, focus mode)
- interactive-quiz.css: +150 lines (kbd hints, focus overlay, nav toggles)
- ui-sounds.js: rewritten with expanded sound map + mute toggle
- dualscope-lesson.css: +55 lines (@media print)
- Lesson 15, 16, 17, 実戦問題5: kbd hint spans + print button + printLesson()
- grammar-template.html: kbd hint spans + printLesson()

---

## 2026-02-26 — Stability Fixes + Feature Roadmap

### Infrastructure (Batch 1-4, implemented)
- Firebase Hosting cleanup script (.scripts/hosting-cleanup.js)
- Fixed database.rules.json: added leaderboard/ + errors/ rules
- Added .catch() to all Firebase writes (leaderboard.js, student-responses.js)
- visibilitychange handler for Firebase reconnection
- Service Worker update notification banner
- Session start/stop debounce guard
- Client-side error monitoring → Firebase RTDB
- Leaderboard nickname HTML character stripping
- localStorage pruning (spaced-review 90d, progress 60d)
- Replaced innerHTML with DOM methods (2 instances)
- Content Security Policy header in firebase.json
- Teacher data cleanup button
- Presence count display in teacher panel

### Feature Roadmap Defined
- Tier 1: Show explanation on wrong answer, star ratings, auto-recycle, timed mode
- Tier 2: Sentence transformation type, cross-lesson learning path, interleaved review
- Tier 3 (future): FSRS, team mode, dictation, modular SDK

---

## 2026-02-25 - View Mode Simplification, Teacher Sound & Fill-in Fix

### Removed Single/Split View Toggle
- Removed the `Single` / `Split` view toggle from all 4 lesson files (Lessons 15, 16, 17, 実戦問題5)
- Split (2-column grid) layout is now the only mode — no `data-view` attribute, no `setView()`, no localStorage viewMode
- Per-question toggle buttons (Words, Hint, Answer) preserved with full GSAP animation
- On mobile (≤800px), columns stack vertically automatically
- Removed dead CSS: `.view-toggle-nav`, `.view-btn-nav`, `.mobile-nav-toggle`

### Teacher Control: Q Button Sound
- `teacher-reveal.js`: Q buttons now play UI sounds on click
- Reveal → `UISound.play('reveal')` → TOGGLE_ON sound
- Un-reveal → `UISound.play('click')` → TAP sound
- Uses existing `window.UISound` public API from `ui-sounds.js`

### Fill-in Quiz: Empty/× Answer Support
- `interactive-quiz.js`: Fill-in questions with `×` answers now accept empty blanks
- `allBlanksFilled()` allows empty inputs when `correctAnswer[i]` is `×`
- `performCheck()` normalizes `""`, `"x"`, `"X"`, `"×"` as equivalent for × answers
- Check popup now appears on input `focus` (not just `input`), enabling empty-blank submission
- Session event payload sends `×` instead of empty string for × answers

### Accessibility & Mobile Nav
- Category badge (`#categoryIcon`): Added `role="img"` and `aria-label` attributes
- `categoryInfo` object: Added `iconLabel` property for each category
- Mobile nav (`.mobile-nav`): Now follows auto-hide behavior with top nav (slides down on y: '100%' / up on y: 0)

### Files Modified
| File | Changes |
|------|---------|
| `Lesson 15｜接続詞.html` | View toggle removal, split layout default, toggle btn restoration, a11y, mobile nav sync |
| `Lesson 16｜名詞・冠詞・代名詞.html` | Same as above |
| `Lesson 17｜形容詞・副詞・群動詞.html` | Same as above |
| `実戦問題5｜総合問題.html` | Same as above |
| `teacher-reveal.js` | Added UISound.play() calls in Q button onclick |
| `interactive-quiz.js` | × answer normalization in allBlanksFilled, performCheck, tryShowFillinPopup; added focus listener |

---

## 2026-02-24 - Performance Optimization (Group A files)

### 6 Performance Fixes Applied to Lessons 15, 16, 17, 実戦問題5

**Fix 1 - Card tilt RAF throttle (CRITICAL):**
- `initTypeCardTilt()`: Cache `getBoundingClientRect()` on `mouseenter` instead of calling it on every `mousemove` (~60/sec)
- RAF-gate mousemove handler to align with browser paint frames
- Eliminates layout thrashing (forced synchronous reflow)

**Fix 2 - Nav mousemove RAF throttle (CRITICAL):**
- `initAutoHideNav()`: RAF-gate the document-level mousemove listener
- Added `{ passive: true }` hint for scroll performance
- Guard redundant show/hide calls when nav is already in target state

**Fix 3 - ScrollTrigger cleanup (CRITICAL):**
- `initOverviewScrollReveals()`: ID-tag all triggers (`overview-${si}`) and kill by prefix before recreation
- Prevents ScrollTrigger accumulation across view transitions (previously: 5 visits = 5x scroll listeners)

**Fix 4 - Remove qcard backdrop-filter (SIGNIFICANT):**
- Dark mode `.qcard` no longer uses `backdrop-filter: blur(12px)`
- With 7+ cards visible, each created a separate GPU compositing layer (machine has GPU rasterization OFF)
- Added `contain: layout style` for layout containment

**Fix 5 - Event delegation for hovers (SIGNIFICANT):**
- Replaced per-element `querySelectorAll` + individual listeners with document-level capture-phase delegation
- `hoverRules` array with `findRule()` lookup — runs once, works for all dynamic elements
- Added `el.matches` guard for text node safety in capture-phase events

**Fix 6 - Defer external scripts (MODERATE):**
- Added `defer` to all 10 external scripts (snd.js, Firebase, teacher-reveal, interactive-quiz, etc.)
- Preserves execution order while unblocking HTML parser
- GSAP CDN scripts intentionally NOT deferred (inline script depends on them synchronously)

---

## 2026-02-24 - GSAP-First Animation Migration

### Animation Engine Migration: CSS → GSAP
All 5 content files migrated from CSS transitions/@keyframes/requestAnimationFrame to GSAP 3.12.5 per project GSAP-First Standard.

**Group A files** (Lessons 15, 16, 17, 実戦問題5):
- Added GSAP + ScrollTrigger CDN (cdnjs v3.12.5)
- Added `GSAP_CONFIG` constants (ease, duration, stagger, scroll, hover) and `UV_REDUCED` accessibility flag
- Removed all CSS `@keyframes` (fadeIn, fadeInUp, slideIn, slideInSmooth), `animation` declarations, `transition` declarations, and `:hover` transform/shadow rules
- Simplified `prefers-reduced-motion` to `scroll-behavior: auto` only

**Migrated animations (B1-B8):**
- B1: Home entrance → GSAP timeline with staggered label/title/subtitle/CTA
- B2: Overview card stagger → `gsap.from` with stagger
- B3: 3D card tilt → `gsap.quickTo()` replacing manual requestAnimationFrame
- B4: Card reveal on scroll → IntersectionObserver + `gsap.to` (replacing CSS class toggle)
- B5: Nav show/hide → `gsap.to` for y-position and opacity
- B6: Collapsible toggle → `gsap.fromTo` for open/close
- B7: Progress bar → GSAP width animation
- B8: All hover effects → `initHoverAnimations()` with `overwrite: true` and touch guard

**New GSAP enhancements (C1-C11):**
- C1: Smooth view transitions (Home ↔ Overview ↔ Question) with crossfade + y-shift
- C2: Overview section ScrollTrigger reveals (header slide + card stagger per section)
- C4: Collapsible child element stagger on open
- C5: Answer reveal micro-celebration (elastic scale pulse)
- C6: Progress bar glow on 100% completion
- C7: Theme toggle icon spin (rotation 180° + scale)
- C8: Search input focus animation (scale + enhanced shadow)
- C9: Question header badge entrance (spring scale)
- C10: Sub-nav section number stagger (scale-in with back.out easing)
- C11: Mobile nav active indicator (elastic scale bounce)

**Group B file** (dualscope-lesson16-interactive.html):
- Added GSAP CDN (no ScrollTrigger needed)
- Removed 8 of 9 CSS transitions (kept `grid-template-rows` — GSAP cannot interpolate grid values)
- Removed all hover CSS rules
- `toggleCard()` → GSAP chevron rotation, opacity-based reveal, blank word color animation
- `togglePracticed()` → GSAP elastic celebration pulse
- `renderSentences()` → Card entrance stagger
- `changeMode()` → Fade-out/re-render/fade-in animation
- `initInteractiveHovers()` → Hover animations for all interactive elements

### Bug Fix: Overview Cards Invisible
- **Root cause**: `initOverviewEntrance()` and `initOverviewScrollReveals()` both used `gsap.from(card, { opacity: 0 })` on the same cards. ScrollTrigger's `from()` pre-sets elements to opacity 0, overriding the entrance animation.
- **Fix**: Removed `initOverviewEntrance()` entirely; simplified ScrollTrigger timeline to card-level stagger only (no per-child animations)

### Files Modified
| File | Changes |
|------|---------|
| `Lesson 15｜接続詞.html` | Full GSAP migration (pilot file) + ScrollTrigger bug fix |
| `Lesson 16｜名詞・冠詞・代名詞.html` | Full GSAP migration (copied from pilot) + ScrollTrigger bug fix |
| `Lesson 17｜形容詞・副詞・群動詞.html` | Full GSAP migration (copied from pilot) + ScrollTrigger bug fix |
| `実戦問題5｜総合問題.html` | Full GSAP migration (copied from pilot) + ScrollTrigger bug fix |
| `dualscope-lesson16-interactive.html` | GSAP migration with interactive drill-specific animations |

### Key Decisions
| Decision | Rationale |
|----------|-----------|
| CDN per file, no shared JS | Files are standalone single-file apps |
| gsap.quickTo() for 3D tilt | Purpose-built for continuous mouse tracking |
| Keep grid-template-rows CSS transition | GSAP cannot animate CSS grid values |
| overwrite: true on all hovers | Prevents animation queue buildup on rapid mouse movement |
| Touch guard on hover setup | No hover events on touch-only devices |
| View transitions 0.4s max | Must feel responsive for a learning app |
| ScrollTrigger one-shot | play none none none — content stays visible after appearing |

---

## 2026-02-21 - Wrong Answer Review, Live Student Responses & Gamification

### New Feature: Wrong Answer Review
- `answeredKeys` changed from `true` to `"correct"/"wrong"` strings (both truthy — backward-compatible with all existing `if (answeredKeys[key])` checks)
- Review button (✖) in score tracker, hidden until first wrong answer
- `toggleReviewMode()` filters to show only wrong-answered cards
- Review nav panel (`.iq-review-nav`) with per-section buttons + wrong count badges
- `restoreAnsweredState` updated for correct green/red feedback colors + `iq-wrong` class
- CSS: `.iq-review-btn`, `.iq-review-nav`, `.iq-review-sec-btn`, `.iq-review-label` with dark mode + responsive

### New Feature: Live Student Responses
- **Created `student-responses.js`** (~200 lines) — Firebase-backed real-time response aggregation
- **Student side**: Persistent device ID (localStorage), writes to `responses/{examId}/{si-qi}/{deviceId}` on `iq:answer-selected`
- **Teacher side**: MutationObserver detects `.tr-panel`, injects response display areas below each section's Q button grid
- `iq:answer-selected` CustomEvent dispatched from interactive-quiz.js (3 sites: pair, choice, error handlers; gated by `iqSessionActive`)
- Bar charts with color-coded fills: green (correct) / red (wrong) + Q-number labels
- Session lifecycle: clears `responses` and detaches listeners on `tr:session-end`
- `database.rules.json` updated: `responses` node with anonymous student write, teacher-only read, validation
- CSS: `.sr-section-responses`, `.sr-bar`, `.sr-fill-track`, `.sr-fill`, `.sr-label`, `.sr-count`, `.sr-total`, `.sr-question-display`, `.sr-question-label` + dark mode

### New Feature: Streak Counter + Achievement Badges
- **Gamification state**: `streak`, `bestStreak`, `badges[]`, `sectionScores{}` with localStorage persistence (`iq-progress-{examId}`)
- **7 badges**: first-blood (first correct), streak-3/5/10 (consecutive correct), perfect-section (100% on section), lesson-complete (all answered), lesson-master (all correct)
- `addScore(isCorrect, si)` — updated signature with `si` parameter, all 8 call sites updated
- **Streak display**: Fire emoji + count (`.iq-streak`), pulse animation at milestones 3/5/10
- **Trophy button**: Opens badge gallery panel (`.iq-badge-panel`, 2-column grid, earned = gold bg, locked = gray + lock icon)
- **Toast notification**: Slide-up from bottom (`.iq-toast`), auto-dismiss after 3s
- **Reset Progress button**: In badge panel, clears all badges/scores/streak from localStorage
- Toast contrast fix: explicit `color` in light mode (`#5d4037`) and dark mode (`#ffe0b2`)
- CSS: `.iq-streak`, `.iq-streak-pulse`, `.iq-trophy-btn`, `.iq-badge-panel`, `.iq-badge-card`, `.iq-badge-grid`, `.iq-toast`, `.iq-badge-reset` + dark mode + mobile + reduced motion

### Files Added/Modified
| File | Changes |
|------|---------|
| `interactive-quiz.js` | Wrong answer review (answeredKeys, toggleReviewMode, filterVisibleCards, showReviewNav); iq:answer-selected dispatch (3 sites); gamification (BADGES, streak, loadProgress/saveProgress, checkAchievements, badge panel, toast, reset) |
| `interactive-quiz.css` | Review mode styles; student response styles; gamification styles (streak, trophy, badge panel, toast, reset) + dark mode + mobile + reduced motion |
| `student-responses.js` | New file — real-time student response aggregation module |
| `database.rules.json` | Added `responses` node with validation rules |
| `Lesson 15｜接続詞.html` | Added student-responses.js script tag |
| `Lesson 16｜名詞・冠詞・代名詞.html` | Added student-responses.js script tag |
| `Lesson 17｜形容詞・副詞・群動詞.html` | Added student-responses.js script tag |
| `実戦問題5｜総合問題.html` | Added student-responses.js script tag |

---

## 2026-02-21 - Interactive Quiz Expansion to All Files

### Quiz Expansion: Lesson 16
- **50 questions** across 10 sections now interactive
- Added 4 script/CSS tags (interactive-quiz.css, snd.js, ui-sounds.js, interactive-quiz.js)
- Section [1] 語句選択: 6 `choice` (3-option → letter format) + 8 `pair` (2-option inline)
- Section [2] 冠詞: 6 `fillin` (article insertion, zero article = ×)
- Section [3] 代名詞: 7 `choice` (3-option → letter format)
- Section [4] 穴埋め: 5 `fillin` (multi-blank phrase completion)
- Section [5] 並べかえ: 3 `scramble`
- Section [6] FC: 3 `choice` (a/b/c/d)
- Section [発展1] 語句選択: 5 `choice` (a/b/c/d)
- Section [発展2] 並べかえ: 3 `scramble`
- Section [発展3] 誤り訂正: 2 `error` (with `correctText`)
- Section [発展4] 英作文: 2 `compose`

### Quiz Expansion: Lesson 17
- Section [4] 和訳: 5 questions now `compose` type (English→Japanese self-eval)
- Section [8] 英作文: 2 questions now `compose` type (Japanese→English self-eval)

### Quiz Expansion: 実戦問題5
- Section [2] 同意文完成: 4 questions now `fillin` type with correctAnswer arrays

### Technical Note: 3-Option Inline Choices
- `parsePairOptions` only handles 2 options — 3-option inline questions (e.g., `( at, in, on )`) converted to `choice` type with letter-format `choices` field (e.g., `"a. at　b. in　c. on"`)

### Files Modified
| File | Changes |
|------|---------|
| `Lesson 16｜名詞・冠詞・代名詞.html` | Added 4 script tags + type/correctAnswer on all 50 questions |
| `Lesson 17｜形容詞・副詞・群動詞.html` | Added type/correctAnswer on 7 questions (sections [4], [8]) |
| `実戦問題5｜総合問題.html` | Added type/correctAnswer on 4 questions (section [2]) |

---

## 2026-02-21 - Fill-in, Compose, Scramble Frame & Quiz Expansion

### New Feature: Fill-in Type (`fillin`)
- **Inline blank inputs** replace `(   )` patterns directly in question text
- Regex `/[（(][\s\u3000]+[)）]/g` matches half/full-width parentheses
- Auto-sizes each input based on expected answer length
- Each input individually shows green (correct) or red (wrong)
- `correctAnswer` is an array: `["both", "and"]`
- New `buildFillinUI()` in interactive-quiz.js
- Styled with `.iq-fillin-input` (underline-only, inline-block)

### New Feature: Compose Type (`compose`)
- **Free-form English writing** with self-evaluation for 英作文 questions
- Textarea for typing, "Show Answer" reveals model answer
- Self-eval buttons: "Got it right" (green) / "Got it wrong" (red)
- Can't auto-grade since composition has multiple valid answers
- New `buildComposeUI()` in interactive-quiz.js
- Styled with `.iq-compose-input`, `.iq-compose-reveal`, `.iq-self-eval`, `.iq-eval-btn`

### New Feature: Scramble Sentence Frame
- Scramble UI now displays surrounding text (prefix/suffix) around word chips
- `"Let's talk in English [ ... ]."` shows "Let's talk in English" before and "." after the answer zone
- New `parseScrambleFrame()` helper returns `{ prefix, suffix }`
- Styled with `.iq-scramble-frame` (flexbox) and `.iq-scramble-context` (inline text)

### Enhancement: Labeled Scramble Format
- `parseScrambleWords()` now handles labeled format: `[ a. home　b. sooner　c. arrived ]`
- Splits on `/[\s\u3000]*[a-z]\.[\s\u3000]*/` — preserves multi-word items like "a few"
- Both comma-separated and labeled formats auto-detected

### Enhancement: Equal-Width Choice Buttons
- Added `flex: 1 1 0` to `.iq-choice` — all buttons in a row share equal width

### Enhancement: Full-Width Check Button
- Changed `.iq-check-btn` from `display: inline-flex` to `display: flex; width: 100%`

### Enhancement: 英文和訳 Uses Compose Type
- Section [4] (4 questions) now uses `type: "compose"` for English→Japanese translation with self-eval
- Same UX as 英作文 — textarea, show model answer, self-evaluate

### Enhancement: Larger Interactive Quiz Fonts
- All interactive element fonts increased 1-2px for better readability
- Choice buttons: 14→15px, chips: 13→14px, check/eval buttons: 13→14px, text inputs: 14→15px

### Quiz Expansion: Lesson 15 & 実戦問題5
- **Lesson 15**: 39 interactive questions across 9 sections (7 choice + 5 fillin + 3 scramble + 4 compose + 5 scramble + 3 choice + 7 choice + 3 error + 2 compose)
- **実戦問題5**: 22 interactive questions (10 choice + 6 scramble + 6 error)

### Files Added/Modified
| File | Changes |
|------|---------|
| `interactive-quiz.js` | Added `buildFillinUI`, `buildComposeUI`, `parseScrambleFrame`; updated `parseScrambleWords` for labeled format; updated `restoreAnsweredState` for array correctAnswer; updated teacher session handlers for fillin/compose awareness |
| `interactive-quiz.css` | Added `.iq-fillin-input`, `.iq-compose-input`, `.iq-compose-reveal`, `.iq-self-eval`, `.iq-eval-btn`, `.iq-scramble-frame`, `.iq-scramble-context` styles; `flex: 1 1 0` on `.iq-choice`; full-width `.iq-check-btn` |
| `Lesson 15｜接続詞.html` | Added 4 script/CSS tags; type/correctAnswer on 35 questions across 8 sections |
| `実戦問題5｜総合問題.html` | Added 4 script/CSS tags; type/correctAnswer on 22 questions across 3 sections |

---

## 2026-02-21 - UI Sounds, Error Correction Input & Correction Type

### New Feature: UI Sound Effects (SND.dev)
- **Created `ui-sounds.js`** — Wraps SND.dev library (SND01 "sine" kit by Dentsu) for professional UI sounds
- Public API: `UISound.play('click' | 'correct' | 'wrong' | 'reveal')`
- Event delegation auto-plays sounds on: `.toggle-btn`, `.top-nav-theme`, `.top-nav-link`, `.view-btn-nav`, `.sub-nav-cat`, `.sub-nav-section`, `.mobile-nav-btn`
- 9 `UISound.play()` calls in interactive-quiz.js (selection clicks, correct/wrong feedback, chip removal)
- CDN: `https://cdn.jsdelivr.net/gh/snd-lib/snd-lib@v1.2.4/dist/browser/snd.js`

### New Feature: Two-Step Error Correction (発展2)
- Error questions (`type: "error"`) now support optional `correctText` field
- When present: students select the error AND type the correct form
- Three-level feedback:
  - Both correct → "Correct!"
  - Right selection, wrong text → "You found the error! The correct form is: ..."
  - Wrong selection → "Incorrect. The error is in part b."
- Text input styled with `.iq-correction-input` (teal focus, dark mode)
- Answer shown below input as `.iq-correction-answer` when incorrect

### New Feature: Correction Type (基本問題3)
- **New `type: "correction"`** for single-underline error correction questions
- Error word highlighted with yellow `.iq-error-highlight` (turns green/red on check)
- Students type the correct replacement — no selection needed
- New `buildCorrectionUI()` function in interactive-quiz.js
- Placeholder shows error word: `too → ...`

### Enhancement: Multiple Acceptable Answers
- `correctText` field now accepts string OR array: `correctText: ["Almost all", "Most of"]`
- Helper functions `matchesCorrectText()` and `displayCorrectText()` handle both formats
- Wrong answer feedback shows all options: "Almost all / Most of"
- Backwards compatible — string correctText works unchanged

### Data Structure Update
- Added `correctText` field (string or array) for error and correction questions
- Added `type: "correction"` as new interactive quiz type
- Guard checks updated: `q.correctAnswer || q.correctText` for interactive question detection

### Files Added/Modified
| File | Changes |
|------|---------|
| `ui-sounds.js` | New file — SND.dev sound wrapper |
| `interactive-quiz.js` | Added `buildCorrectionUI`, `matchesCorrectText`, `displayCorrectText`; updated guards for `correctText`; 9 UISound.play() calls |
| `interactive-quiz.css` | Added `.iq-error-highlight` (yellow/green/red), `.iq-correction-input`, `.iq-correction-answer` styles |
| `Lesson 17｜形容詞・副詞・群動詞.html` | Added SND.dev CDN + ui-sounds.js; `correctText` on 3 error questions; `type: "correction"` + `correctText` on 5 correction questions |

---

## 2026-02-21 - Interactive Quiz Module & Teacher Panel UX

### New Feature: Interactive Quiz Module
- **Created `interactive-quiz.js`** — Reusable IIFE module that transforms grammarData questions into interactive exercises
- **Created `interactive-quiz.css`** — Nordic Glass theme styling for quiz UI (choices, chips, feedback, score tracker)
- Supports 4 interactive question types: `pair` (word selection), `choice` (a-d multiple choice), `error` (clickable underline correction), `scramble` (word reorder)
- Non-interactive types (`translate`, `compose`) gracefully skipped
- Floating score tracker (bottom-left) with progress bar
- MutationObserver on `#questionsList` for SPA re-renders
- State restoration when navigating between sections

### New Feature: Teacher Reveal + Interactive Quiz Integration
- **CustomEvent bridge** between teacher-reveal.js and interactive-quiz.js (both IIFEs with private scope)
- 3 event types: `tr:session-start`, `tr:session-end`, `tr:question-revealed` (with `{ si, qi }` detail)
- During teacher session: students can select answers but Check button is hidden, no feedback shown
- On teacher reveal: auto-triggers feedback for pre-selected answers, updates score
- On session end: Check buttons reappear for unanswered questions

### New Feature: Collapsible Teacher Control Panel
- Teacher panel can collapse to a floating triangle tab (44x44px, glass morphism)
- Click tab to expand back to full panel
- Maximizes screen space for question/answer visibility during class

### Enhancement: Auto-hiding Teacher Login Button
- Login pill button invisible by default (`opacity: 0`)
- Appears on hover (desktop) or focus (mobile) with smooth 0.3s transition

### Data Structure Update
- Added `type` field to grammarData questions (values: `pair`, `choice`, `error`, `scramble`, `translate`, `compose`)
- Added `correctAnswer` field for interactive validation
- Applied to Lesson 17: 35 interactive questions across 6 sections

### Script Load Order
- `interactive-quiz.js` must load AFTER `teacher-reveal.js` for proper MutationObserver registration

### Files Added/Modified
| File | Changes |
|------|---------|
| `interactive-quiz.js` | New file — interactive quiz module |
| `interactive-quiz.css` | New file — quiz UI styling |
| `teacher-reveal.js` | Added CustomEvent dispatches (6 locations), collapse/expand functions |
| `teacher-reveal.css` | Added collapse button, collapsed tab, auto-hide login styles |
| `Lesson 17｜形容詞・副詞・群動詞.html` | Added `type`/`correctAnswer` to 35 questions, fixed script load order |
| `Template & MD & LOG/CHANGELOG.md` | This entry |
| `Template & MD & LOG/grammar-template.html` | Updated data structure docs |
| `Template & MD & LOG/README.md` | Updated architecture & features docs |

---

## 2026-02-19 - Practice Test 5 (実戦問題5)

### New File
- **Created `実戦問題5｜総合問題.html`** — Full grammar breakdown for Practice Test 5
- 26 questions across 4 sections: 語句選択 (10q), 同意文完成 (4q), 並べかえ (6q), 誤り訂正 (6q)
- Covers mixed topics: prepositions, nouns, articles, pronouns, adverbs, adjectives, conjunctions, phrasal verbs
- Based on Lesson 15 production architecture (NavState/Router/CSS engine)

### Architecture
- **4-category system** (selection/completion/ordering/correction) instead of standard 3-category (basic/comm/advanced)
- Warm amber/earth color theme distinct from lesson teal theme
- Overview: 21 grammar reference cards organized by topic (Prepositions, Nouns, Adverbs, Conjunctions)
- All question text exact from PDF source; vocab/hints follow Golden Rule (no answer leaks)

### Files Added/Modified
| File | Changes |
|------|---------|
| `実戦問題５/実戦問題5｜総合問題.html` | New file (108KB, 2699 lines) |
| `Template & MD & LOG/CHANGELOG.md` | This entry |

---

## 2026-02-16 - Lesson 16 Content Restoration

### Content Fix (MAJOR)
- **Rewrote entire grammarData** — 38 questions (9 sections) replaced with 50 questions (10 sections) matching PDF exactly
- Restored 2 missing sections: 基本問題4 穴埋め (5q), 発展2 並べかえ (3q)
- Merged split sections: 前置詞 (5q) + 名詞 (5q) back into 基本問題1 語句選択 (14q)
- All question text now matches original PDF source
- All vocab/hints rewritten to not leak answers
- Updated categoryMap: `advanced: [6, 7, 8]` to `advanced: [6, 7, 8, 9]`

### Files Modified
| File | Changes |
|------|---------|
| `Lesson 16｜名詞・冠詞・代名詞.html` | grammarData (50 questions), categoryMap |

---

## 2026-02-16 - Lesson 17 Content Restoration

### Content Fix (MAJOR)
- Restored all 9 sections to match PDF exactly
- Section 5: Word banks restored (エリ not 彼女, "solve" not "deal with")
- Section 6 FC(1): Answer restored from d.late to c.yet with correct question structure
- Section 7: Multiple choices and text restored across 8 questions
- Section 8: Underline labels corrected
- Section 9: Subject changed from 彼 to あなた (matching PDF)
- All vocab/hints rewritten to guide thinking without revealing answers

### Files Modified
| File | Changes |
|------|---------|
| `Lesson 17｜形容詞・副詞・群動詞.html` | grammarData corrections across all 9 sections |

---

## 2026-02-16 - Documentation Update

### README.md Rewrite
- Added Content Authoring Rules (Golden Rule, vocab/hint guidelines)
- Fixed variable name: `const DATA = []` corrected to `const grammarData = { sections: [] }`
- Removed references to nonexistent `CONFIG` object
- Documented NavState/categoryMap navigation system
- Documented Router and hash-based routing
- Added question type reference table
- Updated color system to match project CLAUDE.md (Nordic palette)
- Added Firebase integration section
- Corrected "How to Create a New Lesson" workflow

### CHANGELOG.md
- Added all entries from 2026-02-16

### grammar-template.html
- Updated data structure from `const DATA = []` to `const grammarData = { sections: [] }`
- Added NavState, categoryMap, Router, and navigation system
- Added note that full CSS should be copied from latest lesson

---

## 2026-02 - Firebase Teacher Reveal Integration

### New Feature
- Added Firebase Auth (Google sign-in restricted to harashima@komagome.ed.jp)
- Added Firebase Realtime Database for answer reveal state
- Teacher "Reveal All" button appears after authentication
- Auto-deploy to Firebase Hosting via auto-sync script

### Files Added
| File | Purpose |
|------|---------|
| `firebase-config.js` | Firebase project configuration |
| `teacher-reveal.js` | Teacher authentication and reveal logic |
| `teacher-reveal.css` | Styling for teacher controls |

---

## 2026-01-26 - Maximized Responsive Layout

### Responsive Improvements

#### New `min()` Function Approach
- Replaced fixed `max-width` with `min(Xpx, Y%)` for better space utilization
- Content now fills 92-94% of viewport until hitting sensible caps

#### Updated Breakpoints
| Breakpoint | Old | New | Improvement |
|------------|-----|-----|-------------|
| 1200px+ | 1100px fixed | min(1150px, 92%) | +4-12% |
| 1440px+ | 1250px fixed | min(1350px, 94%) | +7-11% |
| 1728px+ | 1400px fixed | min(1600px, 94%) | +13% |
| 2000px+ | (none) | 1800px | New! |

#### Asymmetric Dual-View Grid
- Question side now gets more horizontal space
- 1200px+: 52% / 48%
- 1440px+: 53.5% / 46.5%
- 1728px+: 55% / 45%
- 2000px+: 56% / 44%

#### Fluid Padding
- Added `clamp()` for smooth padding scaling

---

## 2026-01-26 - Nordic Teal Theme Enhancement

### Visual Improvements
- Enhanced multi-layer shadows with soft inset glow
- Dark mode gradient background with radial gradients
- Semi-transparent cards for glassy effect
- Toggle button shadows with spring hover effect
- Internal dividers for hint/answer boxes

### CSS Variables Added
- `--border-visible`: More visible border for cards
- `--fs-qtext`, `--fs-base`: Fluid typography variables
- Enhanced `--shadow-sm`, `--shadow`, `--shadow-lg` with inset glow

### Performance
- All animations use `transform` and `opacity` only
- `@media (prefers-reduced-motion)` respected
