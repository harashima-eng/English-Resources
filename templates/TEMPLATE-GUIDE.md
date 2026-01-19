# Grammar Lesson Template Guide

This template creates interactive grammar practice pages with collapsible answers, search, dark mode, and responsive design.

## Quick Start

1. Copy `grammar-lesson-template.html` to your lesson folder
2. Rename it (e.g., `Lesson 16｜仮定法.html`)
3. Search for `{{` to find all placeholders
4. Replace placeholders with your content
5. Add your questions to `grammarData`

## Placeholders to Replace

| Placeholder | Example | Where |
|-------------|---------|-------|
| `{{LESSON_NUMBER}}` | `16` | Title, intro, footer |
| `{{TOPIC_JP}}` | `仮定法` | Title, intro |
| `{{TOPIC_EN}}` | `Subjunctive Mood` | Title |
| `{{SUBTITLE}}` | `Learn to express wishes and hypothetical situations` | Intro |
| `{{TOTAL_QUESTIONS}}` | `25` | Progress text |

## Question Data Structure

All questions go in the `grammarData.sections` array:

```javascript
const grammarData = {
  sections: [
    {
      title: "[1] Section Title",
      open: true,  // true = expanded by default
      questions: [ /* questions here */ ]
    }
  ]
};
```

### Question Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `num` | Yes | string | Question number: `"(1)"`, `"(2)"` |
| `text` | Yes | string | Question text (supports `<br>` for line breaks) |
| `choices` | No | string | Multiple choice options |
| `scramble` | No | string | Word scramble with `[ words, to, arrange ]` |
| `vocab` | No | array | Vocabulary: `[["word", "meaning"], ...]` |
| `hint` | No | array | Hints: `["hint 1", "hint 2"]` |
| `answer` | Yes | string | The correct answer |
| `translation` | No | string | Japanese translation |
| `explanation` | No | string | Detailed explanation |
| `grammar` | No | string | Grammar pattern reference |
| `choiceExplanations` | No | object | Why each choice is right/wrong |

## Question Type Examples

### 1. Multiple Choice

```javascript
{
  num: "(1)",
  text: "She (   ) to school every day.",
  choices: "a. go  b. goes  c. going  d. went",
  vocab: [["go to school", "学校に行く"]],
  hint: ["Subject is 'She' (3rd person singular)", "Present tense routine"],
  answer: "b. goes",
  translation: "彼女は毎日学校に行く",
  grammar: "3rd person singular present: adds -s/-es",
  choiceExplanations: {
    "a. go": "× Base form, needs -s for 3rd person",
    "b. goes": "○ Correct 3rd person singular form",
    "c. going": "× Present participle, needs auxiliary",
    "d. went": "× Past tense, but 'every day' = present"
  }
}
```

### 2. Word Scramble

```javascript
{
  num: "(2)",
  text: "彼女が来るまで待ちましょう",
  scramble: "Let's wait [ she, until, comes ].",
  vocab: [["wait", "待つ"], ["until", "～まで"]],
  hint: ["'until' introduces the time clause", "Time clause uses present tense"],
  answer: "until she comes",
  grammar: "until + S + V (present) = ～するまで"
}
```

### 3. Fill-in-the-Blank (Multiple Blanks)

```javascript
{
  num: "(3)",
  text: "彼は英語も日本語も話せる<br>He can speak (   ) English (   ) Japanese.",
  vocab: [["both A and B", "AもBも"]],
  hint: ["Two things connected equally", "Use correlative conjunction"],
  answer: "both, and",
  grammar: "both A and B = AもBも"
}
```

### 4. Translation/Analysis

```javascript
{
  num: "(4)",
  text: "If I were you, I would accept the offer.",
  vocab: [["accept", "受け入れる"], ["offer", "申し出"]],
  translation: "もし私があなたなら、その申し出を受け入れるだろう",
  explanation: "仮定法過去：現在の事実に反する仮定を表す",
  grammar: "If S + were/V-ed, S + would + V",
  answer: "(Translation question)"
}
```

### 5. Error Correction

```javascript
{
  num: "(5)",
  text: "He <u>a. suggested</u> that she <u>b. goes</u> to the <u>c. doctor</u> <u>d. immediately</u>.",
  vocab: [["suggest", "提案する"]],
  hint: ["'suggest' requires subjunctive", "Subjunctive uses base form"],
  answer: "b. goes → go",
  grammar: "suggest that S + (should) + base verb"
}
```

## Customizing Colors

Edit CSS variables in `:root` to change the color scheme:

```css
:root {
  --primary: #e8725c;      /* Main accent (coral) */
  --secondary: #3d8bca;    /* Blue */
  --tertiary: #9b7fcf;     /* Purple */
  --quaternary: #5a9a6e;   /* Green */
}
```

**Color usage:**
- `--primary` → Hints, accent color
- `--secondary` → Scramble boxes, grammar references
- `--tertiary` → Choices, vocabulary
- `--quaternary` → Answer boxes

## Features Included

- **Dark Mode** - Toggle via sun/moon button
- **Single/Split View** - Toggle question layout
- **Search** - Filter questions by keyword
- **Progress Bar** - Tracks revealed answers
- **Collapsible Sections** - Organize by topic
- **Responsive Design** - Works on mobile

## Checklist for New Lesson

- [ ] Copy and rename template
- [ ] Update `<title>` tag
- [ ] Update intro section (label, title, subtitle)
- [ ] Update footer text
- [ ] Add all sections to `grammarData.sections`
- [ ] Add all questions with complete data
- [ ] Update `{{TOTAL_QUESTIONS}}` count
- [ ] Test in browser
- [ ] Test dark mode
- [ ] Test search
- [ ] Test on mobile
