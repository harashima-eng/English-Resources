# Eiken Pre-1 Speaking — Content Rules

## Design Template
Template: `.templates/hollywood-cosmic.html` (Hollywood Cosmic — warm charcoal + cosmic accents)

## File Naming
`eiken_pre1_partN_topic1_topic2_topic3.html`

## Content Structure

Each file is a standalone single-file HTML app (inline `<style>` + `<script>`).

### Required Sections
1. **Cinema Header** — Title, subtitle, progress bar
2. **Chapter Select** — Links to all sections in the file
3. **The Winning Formula** — 4-step speaking structure (same across all parts)
4. **Filler Phrases** — Time-buying phrases with JP translations (same across all parts)
5. **Categories** — Topic groups containing question cards

### Question Card Structure
Each question card (`<div class="q-card">`) contains:
- **Question text** in the header
- **Difficulty badge** — `basic`, `intermediate`, or `advanced`
- **Hint panel** — 3 progressive thinking prompts (Yes side, No side, comparison)
- **Key vocab chips** — Non-answer vocabulary only (never include the answer word)
- **Yes answer** — Model answer + Japanese translation + Director's Notes
- **No answer** — Model answer + Japanese translation + Director's Notes

### Model Answer Quality
- 5-7 sentences minimum
- Use sophisticated vocabulary appropriate for Pre-1 level
- Follow the 4-step formula (Opinion, Reason 1, Reason 2, Conclusion)
- Include concrete examples and evidence
- Both Yes and No answers must be equally strong

### Hint Rules
- 3 progressive prompts that guide thinking
- Never state or reveal the answer
- Frame as "Yes side" and "No side" with a comparison point

### Director's Notes
- Highlight 3-5 key phrases from the model answer
- Each phrase gets: English phrase (in `.phrase` span) + Japanese explanation (in `.explain` span)
- Focus on vocabulary and expressions that elevate the answer to Pre-1 level

### Category Colors
Use CSS custom properties for category colors. Default mapping:
- `--cat1` (teal): Environment, Science, Health topics
- `--cat2` (amber): Work, Economy, Society topics
- `--cat3` (coral): Education, Family, Politics topics

Customize the `--cat1/2/3` values in `:root` if topics need different colors.

## JS Configuration
Each file must set these at the top of the `<script>`:
```javascript
const PART = 'pre1-partN';   // Unique key for localStorage
const TOTAL_Q = N;            // Total question count in this file
```

## Template Placeholders
When using the template, replace:
- `{{TITLE}}` — Main heading (e.g., "Technology, Society & Economy")
- `{{SUBTITLE}}` — Part label (e.g., "Part 2")
- `{{TOTAL_Q}}` — Number of questions
- `{{PART_KEY}}` — localStorage key (e.g., "pre1-part2")
- `{{CHAPTERS}}` — Chapter select links
- `{{CATEGORIES}}` — Category sections with question cards
