# DUAL SCOPE Grammar Breakdown Project

Interactive English grammar study system for Japanese high school students, built as standalone HTML files with inline CSS/JS.

---

## Content Authoring Rules

### The Golden Rule

**Keep original question text exactly as the PDF source.** Never invent, rephrase, or reorganize questions. The textbook is the single source of truth.

### Vocab (Words button)

Teach **non-answer** vocabulary in the sentence. Never include the answer word/phrase as a vocab entry.

```javascript
// GOOD - teaches context words, not the answer
vocab: [["picture", "絵、写真"], ["wall", "壁"]]
// answer is "on" — not listed in vocab

// BAD - leaks the answer
vocab: [["on", "～の上に（接触）"], ["wall", "壁"]]
```

### Hints (Hint button)

3 progressive thinking prompts that guide toward the grammar concept. **Never state the answer.**

```javascript
// GOOD - guides thinking
hint: [
  "壁に絵が「くっついている」状態を表す前置詞は？",
  "表面との接触を表す前置詞を考えよう",
  "at は地点、in は内部、on は？"
]

// BAD - reveals the answer
hint: [
  "onは接触を表す",
  "壁に接触しているのでonを使う",
  "正解はon"
]
```

### Answer Section (Answer button)

Write freely — this is hidden behind the Answer button. Include:
- `answer`: The correct answer
- `translation`: Japanese translation
- `explanation`: Why the answer is correct
- `grammar`: Grammar pattern/rule
- `choiceExplanations`: Per-choice breakdown (for multiple choice)

---

## Project Structure

```
English-Resources/
├── interactive-quiz.js          # Shared: interactive quiz module
├── interactive-quiz.css         # Shared: quiz UI styling
├── student-responses.js         # Shared: real-time student response aggregation
├── ui-sounds.js                 # Shared: SND.dev sound effects
├── teacher-reveal.js            # Shared: teacher session control
├── teacher-reveal.css           # Shared: teacher panel styling
├── firebase-config.js           # Shared: Firebase project config
├── answer-fetch.js              # Shared: answer data fetching
│
└── 高校２年/論理・表現II/Dual Scope/
    ├── Template & MD & LOG/
    │   ├── grammar-template.html    # Starter template (see note below)
    │   ├── CHANGELOG.md             # Project-wide changelog
    │   └── README.md                # This file
    │
    ├── Lesson 15｜接続詞.html
    ├── Lesson 16｜名詞・冠詞・代名詞.html
    ├── Lesson 17｜形容詞・副詞・群動詞.html
    ├── 実戦問題5｜総合問題.html
    ├── dualscope-lesson16-interactive.html   # Standalone drill (no Router)
    └── [Future lessons...]
```

### Creating a New Lesson

The `grammar-template.html` has the basic JS engine but simplified CSS. For a production-ready lesson:

1. **Copy** the latest lesson file (e.g., Lesson 16) as your starting point
2. **Clear** the `grammarData.sections` array and Overview HTML
3. **Update** the lesson-specific content:
   - `<title>` tag
   - Home view (lesson number, title, subtitle)
   - Overview reference cards
   - `grammarData` with questions from PDF
   - `categoryMap` section assignments
   - `<footer>` text
   - `data-exam-id` on `<body>`
4. **Customize** CSS color variables if needed (see Color Themes below)

---

## Architecture

Each lesson file is a standalone single-file app with three views:

### Views

| View | Purpose |
|------|---------|
| **Home** | Landing page with lesson title and CTA buttons |
| **Overview** | Grammar reference cards (conj-card grid) |
| **Question** | Interactive question cards with Vocab/Hint/Answer toggles |

### Navigation System

```javascript
// Navigation state
const NavState = {
  view: 'home',        // 'home' | 'overview' | 'question'
  category: 'basic',   // 'basic' | 'comm' | 'advanced'
  section: 0,          // Section index into grammarData.sections
  categoryMap: {
    basic: [0, 1, 2, 3, 4],    // Section indices for 基本問題
    comm: [5],                   // Section indices for FOR COMMUNICATION
    advanced: [6, 7, 8, 9]      // Section indices for 発展問題
  }
};

// Router handles URL hash (#question/basic/1), view switching, sub-nav
const Router = { navigate(), setCategory(), setSection(), render(), ... };
```

### Question Data Structure

```javascript
const grammarData = {
  sections: [
    {
      title: "[1] 基本問題 1｜語句選択 (1)～(14)",
      open: true,    // first section starts open
      questions: [
        {
          num: "(1)",
          text: "Look at the picture ( at, in, on ) the wall.",  // EXACT PDF text
          choices: "選択肢: at, in, on",          // Multiple choice (optional)
          scramble: "[ word, order, here ]",       // Word scramble (optional)
          type: "pair",                            // Interactive quiz type (optional)
          correctAnswer: "on",                     // For interactive validation (optional)
          correctText: "either",                   // For error/correction: correct replacement (optional)
                                                   // Can be array: ["Almost all", "Most of"]
          vocab: [["picture", "絵"], ...],         // Non-answer words only
          hint: ["Hint 1", "Hint 2", "Hint 3"],   // 3 progressive, no answer
          answer: "on",                            // Correct answer
          translation: "壁の絵を見て。",             // Japanese translation
          explanation: "on は表面への接触を...",     // Why correct
          grammar: "on = 接触",                    // Grammar pattern
          choiceExplanations: {                    // Per-choice (optional)
            "at": "× 場所の一点を表す...",
            "in": "× 中にという意味...",
            "on": "○ 正解。接触を表す。"
          }
        }
      ]
    }
  ]
};
```

### Question Types

| Type | `type` field | Fields Used | Example |
|------|-------------|------------|---------|
| Multiple choice (inline) | `pair` | `text` with choices in parentheses, `choices` | `( at, in, on )` |
| Multiple choice (abcd) | `choice` | `text`, `choices` with `a. b. c. d.` | FC, 発展問題 |
| Fill-in-blank | `fillin` | `text` with `(   )`, `correctAnswer` array | 空所補充 (inline inputs) |
| Word ordering | `scramble` | `text` (Japanese), `scramble` with prefix/suffix | 並べかえ |
| Error correction | `error` | `text` with `<u>` underlines, optional `correctText` | 誤り訂正 (labeled a/b/c/d) |
| Error correction (single) | `correction` | `text` with single `<u>`, `correctText` | 誤り訂正 (type the fix) |
| Composition/Translation | `compose` | `text`, `correctAnswer` (model answer) | 英作文/英文和訳 (self-eval) |
| Translation | `translate` | `text` (Japanese prompt) | 和文英訳 (non-interactive) |
| Sentence transformation | `transform` | `text`, `original`, `keyword`, `correctAnswer` | 書き換え (planned) |

---

## Color System

### Grade Colors (from project CLAUDE.md)

| Grade | Name | Primary | Dark |
|-------|------|---------|------|
| 高校1年 | Nordic rust | `#A05020` | `#8A4018` |
| 高校2年 | Nordic fjord teal | `#7A9BA8` | `#6A8B98` |
| 高校3年 | Nordic forest | `#337058` | `#2A5F4A` |

### Per-Lesson Category Colors

Each lesson defines category colors for its grammar types. Example from Lesson 16:

```css
:root {
  /* Category tab colors */
  --cat-basic: #5A8F65;
  --cat-comm: #C28A2E;
  --cat-advanced: #7E5A9E;

  /* Grammar type colors (for Overview cards) */
  --prep: #3D8BCA;
  --noun: #5A9A6E;
  --article: #E8725C;
  --pronoun: #9B7FCF;
}
```

---

## Responsive Breakpoints

| Breakpoint | Target | Content Width |
|------------|--------|---------------|
| Base | Mobile | 100% |
| 768px+ | Tablet | max-width: 1000px |
| 1200px+ | iPad Pro / Small laptops | min(1150px, 92%) |
| 1440px+ | MacBook Air/Pro 14" | min(1350px, 94%) |
| 1728px+ | MacBook Pro 16" | min(1600px, 94%) |
| 2000px+ | 4K/Ultra-wide | 1800px |

### Dual View Grid Ratios

- **1200px+**: 1.1fr / 1fr (52% / 48%)
- **1440px+**: 1.15fr / 1fr (53.5% / 46.5%)
- **1728px+**: 1.2fr / 1fr (55% / 45%)
- **2000px+**: 1.25fr / 1fr (56% / 44%)

---

## Interactive Features

### Toggle Buttons (Question View)

| Button | Color | Content | Visibility |
|--------|-------|---------|------------|
| **Words** | Purple | Vocabulary list | Pre-answer |
| **Hint** | Coral | 3 progressive hints | Pre-answer |
| **Answer** | Green | Answer + explanation | Post-click |

### Layout

Split (2-column) layout is the default and only mode:
- **Desktop**: Question spans full width, left column (Words/Hint) and right column (Answer) side-by-side
- **Mobile (≤800px)**: Columns stack vertically (question → left → right)

### Interactive Quiz Module

Reusable module (`interactive-quiz.js` + `interactive-quiz.css`) that adds interactive exercises to grammarData questions. Requires `type` and either `correctAnswer` or `correctText` fields.

| Quiz Type | Interaction | Key Fields |
|-----------|-------------|------------|
| `pair` | Click one of the inline word choices | `correctAnswer: "awake"` |
| `choice` | Click a/b/c/d option button | `correctAnswer: "b"` |
| `error` | Click the underlined error (a/b/c/d), optionally type fix | `correctAnswer: "b"`, optional `correctText: "two-thirds"` |
| `correction` | Type the correct form for the underlined error | `correctText: "either"` or `["Almost all", "Most of"]` |
| `fillin` | Type in each inline blank within the sentence | `correctAnswer: ["both", "and"]` (array). Use `"×"` for blanks where nothing should be filled (e.g., no article). Accepts empty, `x`, `X`, `×`. |
| `compose` | Write translation, self-evaluate against model answer | `correctAnswer: "The trouble is that..."` (string) |
| `scramble` | Drag/click words into correct order | `correctAnswer: "should be done away with"` |

Features:
- Floating score tracker (bottom-left, glass morphism)
- Instant correct/wrong feedback with color-coded UI
- UI sound effects via SND.dev (`ui-sounds.js`)
- `correctText` supports string or array for multiple acceptable answers
- MutationObserver for SPA section navigation
- State restoration for previously answered questions
- Teacher session integration (see below)
- **Wrong Answer Review**: Filter to show only wrong-answered cards, review nav panel with per-section buttons
- **Streak Counter**: Fire emoji + count, pulse animation at milestones (3, 5, 10 consecutive correct)
- **Achievement Badges**: 7 unlockable badges (first-blood, streak-3/5/10, perfect-section, lesson-complete, lesson-master), trophy button opens gallery panel, toast notifications on unlock
- **Per-lesson persistence**: Streak, badges, section scores saved to localStorage (`iq-progress-{examId}`)
- **Reset Progress**: Button in badge panel to clear all saved progress
- **Spaced Repetition**: Leitner 5-box system (`spaced-review.js`) for long-term retention
- **PWA + Offline**: Service Worker with update notification banner

### Teacher Session Integration

During teacher sessions (授業モード), the interactive quiz adapts:
- Check buttons are hidden — students can select but not see results
- When teacher reveals a question, feedback auto-appears for pre-selected answers
- On session end, Check buttons reappear for unanswered questions
- Communication via CustomEvents: `tr:session-start`, `tr:session-end`, `tr:question-revealed`

### Other Features

- Dark mode toggle (persisted to localStorage)
- Search across questions, grammar, vocabulary
- Progress bar (answers revealed / total)
- Card reveal animation (IntersectionObserver + GSAP)
- Auto-hide navigation on scroll (GSAP y-position)
- Hash-based routing (#question/basic/1)
- Overview card tilt effect on hover (gsap.quickTo)

---

## Animation System (GSAP-First)

All animation uses GSAP 3.12.5 + ScrollTrigger. No CSS transitions, @keyframes, or other animation libraries.

### GSAP CDN (loaded per file)
- `gsap.min.js` v3.12.5 (cdnjs)
- `ScrollTrigger.min.js` v3.12.5 (cdnjs) — Group A files only

### GSAP_CONFIG Constants
Shared configuration at top of each file's script block:
- **Ease**: default (power2.out), smooth (power3.out), spring (back.out(1.7)), gentle (power1.out), nav (power2.inOut), elastic (elastic.out(1, 0.5))
- **Duration**: micro (0.1s), fast (0.25s), normal (0.5s), slow (0.8s), nav (0.3s), view (0.4s)
- **Stagger**: tight (0.03), normal (0.08), relaxed (0.15)
- **Scroll**: start 'top 85%', toggleActions 'play none none none'
- **Hover**: lift (-3px), scaleSmall (1.05), scaleMedium (1.08)

### Animation Categories

| Category | Examples | GSAP Method |
|----------|----------|-------------|
| View transitions | Home ↔ Overview ↔ Question crossfade | gsap.fromTo with onComplete |
| Scroll reveals | Section headers + card staggers | ScrollTrigger timelines |
| Hover effects | Buttons, cards, nav links | gsap.to with overwrite: true |
| Interactive | Card reveal, collapsible toggle, progress | gsap.to / gsap.fromTo |
| Micro-celebrations | Answer reveal pulse, 100% progress glow | elastic/yoyo animations |
| Continuous tracking | 3D card tilt on mousemove | gsap.quickTo |

### Accessibility
- `UV_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches`
- All animation functions check UV_REDUCED and skip if true
- CSS reduced to `scroll-behavior: auto` only in prefers-reduced-motion
- Touch guard: hover animations skip on touch-only devices

## Performance Notes

- All GSAP animations use GPU-accelerated properties: transform (x, y, scale, rotation) and opacity
- Hover animations use `overwrite: true` to prevent queue buildup
- ScrollTrigger one-shot (play none none none) — no re-triggering
- ScrollTrigger instances are ID-tagged (`overview-${si}`) and killed by prefix before recreation to prevent accumulation
- Card tilt and nav auto-hide mousemove handlers are RAF-gated (no layout thrashing)
- Hover effects use document-level event delegation (capture phase) — single init, works for all dynamic elements
- Dark mode qcards use `contain: layout style` instead of `backdrop-filter` (avoids compositing layer explosion)
- All external scripts (Firebase, interactive-quiz, etc.) use `defer` — GSAP CDN scripts remain synchronous
- Target machine: MacBook Pro 16" (i9, Radeon 5500M, 32GB)
- GPU rasterization OFF (user preference)

---

## Firebase Integration

Each lesson includes teacher-reveal functionality:
- Firebase Auth (Google sign-in)
- Firebase Realtime Database (answer reveal state)
- Teacher control panel: reveal individual questions, sections, or all at once
- Collapsible panel (triangle tab) for maximizing class display space
- Auto-hiding Teacher Login button (appears on hover/focus only)
- CustomEvent bridge for interactive quiz integration (`tr:session-start`, `tr:session-end`, `tr:question-revealed`)
- **Live Student Responses** (`student-responses.js`): Real-time aggregated answer distribution during teacher sessions
  - Students select answers on their phones → writes to Firebase `responses/{examId}/{si-qi}/{deviceId}`
  - Teacher sees bar charts per question with color-coded correct (green) / wrong (red) bars + Q-number labels
  - `iq:answer-selected` CustomEvent bridge from interactive-quiz.js (keeps Firebase out of quiz UI code)
  - Responses cleared on session end
- Scripts loaded from `../../../firebase-config.js`, `../../../teacher-reveal.js`, `../../../interactive-quiz.js`, `../../../student-responses.js`, `../../../ui-sounds.js`
- **Load order**: `snd.js` (CDN) → `ui-sounds.js` → Firebase → `teacher-reveal.js` → `interactive-quiz.js` → `student-responses.js`

---

## Feature Roadmap

### Tier 1: High Impact, Low-Medium Effort

| Feature | Description | Status |
|---------|-------------|--------|
| Show explanation on wrong answer | Auto-expand Answer collapsible after wrong answer with 1s delay | Planned |
| Star rating per section (1-3 stars) | Visual reward: 1 star (<70%), 2 stars (70-99%), 3 stars (100%) | Planned |
| Auto-recycle missed questions | Prompt to re-test wrong questions immediately after section completion | Planned |
| Timed mode (optional) | Per-question countdown bar (15s choice, 30s fillin, 45s compose); toggle in progress panel | Planned |

### Tier 2: Medium Effort, Strong Learning Value

| Feature | Description | Status |
|---------|-------------|--------|
| Sentence transformation (`transform`) | New question type: rewrite sentence using keyword (active→passive, direct→reported) | Planned |
| Cross-lesson learning path | Visual grid on index.html showing completion/stars/review-due across all lessons | Planned |
| Interleaved review mode | Spaced review pulls due items across ALL exams, shuffled for better retention | Planned |

### Tier 3: Future Consideration

| Feature | Description | Status |
|---------|-------------|--------|
| FSRS algorithm | Replace Leitner boxes with FSRS (ts-fsrs). Higher accuracy but adds dependency | Future |
| Team competition mode | Group-based classroom competition. Needs Firebase schema changes | Future |
| Dictation type | Audio playback + type what you hear. Needs audio files per question | Future |
| Modular SDK migration | Firebase compat → modular. High risk, no functional benefit yet | Future |

---

## Changelog

See `CHANGELOG.md` for detailed version history.
