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

No active task.

---

**File:** `/Users/slimtetto/Projects/English-Resources/CO-PILOT-CEO-SUGGESTIONS.md`
