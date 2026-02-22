#!/usr/bin/env python3
"""
Convert Eiken Pre-1 Speaking files from old design to Hollywood Cosmic.

Usage:
    python3 convert_to_cosmic.py <input.html> [--dry-run]

Extracts question content from old-design files and wraps it in the
Hollywood Cosmic template (CSS + starfield + bento grid + JS).
"""

import re
import sys
import os
from html.parser import HTMLParser

# ═══════════════════════════════════════
# CONFIGURATION PER FILE
# ═══════════════════════════════════════
FILE_CONFIG = {
    'eiken_pre1_part2_technology_society_economy.html': {
        'title': 'Technology, Society & Economy',
        'part_label': 'Part 2',
        'part_key': 'part2',
        'categories': [
            {'id': 'sec-tech', 'label': 'Technology', 'css_class': 'cat1', 'color_var': '--cat1'},
            {'id': 'sec-soc', 'label': 'Society', 'css_class': 'cat2', 'color_var': '--cat2'},
            {'id': 'sec-econ', 'label': 'Economy', 'css_class': 'cat3', 'color_var': '--cat3'},
        ],
        'cat_colors': {
            'cat1': '#00e5cc',  # teal
            'cat2': '#ffc347',  # amber
            'cat3': '#ff5370',  # coral
        }
    },
    'eiken_pre1_part3_mixed_topics.html': {
        'title': 'Mixed Topics',
        'part_label': 'Part 3',
        'part_key': 'part3',
        'categories': [
            {'id': 'sec-cat1', 'label': 'Mixed A', 'css_class': 'cat1', 'color_var': '--cat1'},
            {'id': 'sec-cat2', 'label': 'Mixed B', 'css_class': 'cat2', 'color_var': '--cat2'},
            {'id': 'sec-cat3', 'label': 'Mixed C', 'css_class': 'cat3', 'color_var': '--cat3'},
        ],
        'cat_colors': {
            'cat1': '#00e5cc',
            'cat2': '#ffc347',
            'cat3': '#ff5370',
        }
    },
    'eiken_pre1_part4_politics_media_health.html': {
        'title': 'Politics, Media & Health',
        'part_label': 'Part 4',
        'part_key': 'part4',
        'categories': [
            {'id': 'sec-pol', 'label': 'Politics', 'css_class': 'cat1', 'color_var': '--cat1'},
            {'id': 'sec-med', 'label': 'Media', 'css_class': 'cat2', 'color_var': '--cat2'},
            {'id': 'sec-hlt', 'label': 'Health', 'css_class': 'cat3', 'color_var': '--cat3'},
        ],
        'cat_colors': {
            'cat1': '#00e5cc',
            'cat2': '#ffc347',
            'cat3': '#ff5370',
        }
    },
    'eiken_pre1_part5_family_education_global.html': {
        'title': 'Family, Education & Global',
        'part_label': 'Part 5',
        'part_key': 'part5',
        'categories': [
            {'id': 'sec-fam', 'label': 'Family', 'css_class': 'cat1', 'color_var': '--cat1'},
            {'id': 'sec-edu', 'label': 'Education', 'css_class': 'cat2', 'color_var': '--cat2'},
            {'id': 'sec-glb', 'label': 'Global', 'css_class': 'cat3', 'color_var': '--cat3'},
        ],
        'cat_colors': {
            'cat1': '#00e5cc',
            'cat2': '#ffc347',
            'cat3': '#ff5370',
        }
    },
    'eiken_pre1_part7_FINAL.html': {
        'title': 'Final Review',
        'part_label': 'Part 7 — FINAL',
        'part_key': 'part7',
        'categories': [
            {'id': 'sec-cat1', 'label': 'Review A', 'css_class': 'cat1', 'color_var': '--cat1'},
            {'id': 'sec-cat2', 'label': 'Review B', 'css_class': 'cat2', 'color_var': '--cat2'},
            {'id': 'sec-cat3', 'label': 'Review C', 'css_class': 'cat3', 'color_var': '--cat3'},
        ],
        'cat_colors': {
            'cat1': '#00e5cc',
            'cat2': '#ffc347',
            'cat3': '#ff5370',
        }
    },
}


def extract_questions_from_old(html):
    """Extract question data from old-design HTML."""
    questions = []
    categories = []

    # Find category sections
    cat_pattern = re.compile(
        r'<div\s+id="(\w+)"\s+class="category">\s*'
        r'<div\s+class="category-header">\s*<h2>(.*?)</h2>',
        re.DOTALL
    )

    # Find all categories and their question blocks
    cat_matches = list(cat_pattern.finditer(html))

    for i, cat_match in enumerate(cat_matches):
        cat_id = cat_match.group(1)
        cat_header = cat_match.group(2)

        # Clean up header text (remove emojis and extra whitespace)
        cat_name = re.sub(r'[^\w\s&,()-]', '', cat_header).strip()
        cat_name = re.sub(r'\s+', ' ', cat_name)

        # Find the end boundary (next category or end of content)
        start = cat_match.end()
        if i + 1 < len(cat_matches):
            end = cat_matches[i + 1].start()
        else:
            end = len(html)

        cat_html = html[start:end]
        cat_questions = extract_questions_from_category(cat_html)

        categories.append({
            'id': cat_id,
            'name': cat_name,
            'questions': cat_questions,
        })

    return categories


def extract_questions_from_category(cat_html):
    """Extract individual questions from a category section."""
    questions = []

    # Find question collapsibles
    q_pattern = re.compile(
        r'<div\s+class="question-collapsible">(.*?)</div>\s*</div>\s*</div>\s*</div>',
        re.DOTALL
    )

    # Alternative: find question blocks by data-question attribute
    q_block_pattern = re.compile(
        r'<div\s+class="question-block"\s+data-question="(\d+)">(.*?)(?=<div\s+class="question-block"|</div>\s*</div>\s*</div>\s*</div>)',
        re.DOTALL
    )

    # Find question headers
    q_header_pattern = re.compile(
        r'<div\s+class="question-title">\s*'
        r'(Q\d+):\s*(.*?)\s*'
        r'<span\s+class="difficulty\s+(\w+)">[^<]*</span>',
        re.DOTALL
    )

    headers = list(q_header_pattern.finditer(cat_html))

    for h_match in headers:
        q_num = h_match.group(1)
        q_text = h_match.group(2).strip()
        q_diff = h_match.group(3)

        # Find the content for this question
        start = h_match.end()

        # Extract hint content
        hint = extract_hint(cat_html[start:start+5000])

        # Extract answers
        answers = extract_answers(cat_html[start:start+10000])

        questions.append({
            'num': q_num,
            'text': q_text,
            'difficulty': q_diff,
            'hint': hint,
            'answers': answers,
        })

    return questions


def extract_hint(html_chunk):
    """Extract hint content from a question section."""
    hint_pattern = re.compile(
        r'<div\s+id="[^"]*"\s+class="answer-section\s+hint-box\s+hidden">(.*?)</div>\s*</div>',
        re.DOTALL
    )
    match = hint_pattern.search(html_chunk)
    if not match:
        return None

    hint_html = match.group(1)

    # Extract hint items
    items = re.findall(r'<li>(.*?)</li>', hint_html, re.DOTALL)

    # Extract key phrases
    key_phrases_match = re.search(r'Key phrases?:(.+?)$', hint_html, re.DOTALL | re.MULTILINE)
    key_phrases = []
    if key_phrases_match:
        kp_text = key_phrases_match.group(1)
        key_phrases = re.findall(r'"([^"]+)"', kp_text)

    return {
        'items': items,
        'key_phrases': key_phrases,
    }


def extract_answers(html_chunk):
    """Extract answer blocks (Yes/No or single) from a question section."""
    answers = []

    # Find answer sections (not hint-box)
    ans_pattern = re.compile(
        r'<div\s+id="([^"]+)"\s+class="answer-section\s+hidden">(.*?)</div>\s*</div>\s*</div>',
        re.DOTALL
    )

    for match in ans_pattern.finditer(html_chunk):
        ans_id = match.group(1)
        ans_html = match.group(2)

        # Determine if YES or NO
        label = 'Model Answer'
        if '-yes' in ans_id:
            label = 'Yes'
        elif '-no' in ans_id:
            label = 'No'

        # Extract model answer text
        en_match = re.search(r'<div\s+class="model-answer">\s*(?:<strong>[^<]*</strong>\s*<br>)?\s*"?(.*?)"?\s*</div>', ans_html, re.DOTALL)
        en_text = en_match.group(1).strip() if en_match else ''
        # Clean up HTML tags within answer
        en_text = re.sub(r'<[^>]+>', '', en_text).strip()
        en_text = en_text.strip('"')

        # Extract JP translation
        jp_match = re.search(r'<div\s+class="jp-translation">\s*(?:<strong>[^<]*</strong>\s*<br>)?\s*(.*?)\s*</div>', ans_html, re.DOTALL)
        jp_text = jp_match.group(1).strip() if jp_match else ''
        jp_text = re.sub(r'<[^>]+>', '', jp_text).strip()
        jp_text = jp_text.strip('「」')

        # Extract tips (Director's Notes)
        tips = []
        tips_pattern = re.compile(r'<li>\s*<strong>"([^"]+)"</strong>\s*-\s*(.*?)\s*</li>', re.DOTALL)
        for tip in tips_pattern.finditer(ans_html):
            tips.append({
                'phrase': tip.group(1),
                'explain': tip.group(2).strip(),
            })

        answers.append({
            'id': ans_id,
            'label': label,
            'en_text': en_text,
            'jp_text': jp_text,
            'tips': tips,
        })

    return answers


def extract_filler_phrases(html):
    """Extract filler phrases from old design."""
    fillers = []
    filler_pattern = re.compile(
        r'<div\s+class="filler-card">\s*'
        r'<strong>(.*?)</strong>\s*'
        r'<span\s+class="jp">(.*?)</span>',
        re.DOTALL
    )

    for match in filler_pattern.finditer(html):
        fillers.append({
            'en': match.group(1).strip(),
            'jp': match.group(2).strip().strip('「」'),
        })

    return fillers


def read_template_parts():
    """Read CSS and JS template from Part 1."""
    part1_path = os.path.join(os.path.dirname(__file__), '..',
                               'eiken_pre1_part1_environment_work_education.html')
    part1_path = os.path.normpath(part1_path)

    with open(part1_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract CSS (between <style> and </style>)
    css_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    css = css_match.group(1) if css_match else ''

    # Extract starfield HTML
    star_match = re.search(r'(<!-- ═+ STARFIELD ═+ -->\n<div class="starfield">.*?</div>)', content, re.DOTALL)
    starfield = star_match.group(1) if star_match else ''

    # Extract JS (between <script> and </script>), minus the PART/TOTAL_Q constants
    js_match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
    js = js_match.group(1) if js_match else ''
    # Remove PART and TOTAL_Q lines (will be replaced per file)
    js = re.sub(r"const PART = '[^']+';", "const PART = '{{PART_KEY}}';", js)
    js = re.sub(r'const TOTAL_Q = \d+;', 'const TOTAL_Q = {{TOTAL_Q}};', js)

    return css, starfield, js


def build_cosmic_html(config, categories, fillers, css, starfield, js):
    """Build complete Hollywood Cosmic HTML file."""

    total_q = sum(len(cat['questions']) for cat in categories)

    # Replace JS placeholders
    file_js = js.replace("'{{PART_KEY}}'", f"'{config['part_key']}'")
    file_js = file_js.replace('{{TOTAL_Q}}', str(total_q))

    # Customize CSS category colors
    file_css = css
    # Replace Part 1 category colors with this file's colors
    cat_colors = config.get('cat_colors', {})
    if cat_colors:
        # Add custom category CSS variables
        cat_vars = '\n'.join(f'  --{k}: {v};' for k, v in cat_colors.items())
        # Insert after --edu line
        file_css = file_css.replace(
            '  --edu: #ff5370;',
            f'  --edu: #ff5370;\n  /* File-specific category colors */\n{cat_vars}'
        )

    # Build chapter select items
    chapter_items = []
    chapter_items.append(
        '      <a class="chapter-item" onclick="navTo(\'#formula\')">\n'
        '        <span class="reel" style="border-color:var(--gold)"></span>\n'
        '        <span>The Formula</span>\n'
        '        <span class="chk">&#10003;</span>\n'
        '      </a>'
    )
    chapter_items.append(
        '      <a class="chapter-item" onclick="navTo(\'#fillers\')">\n'
        '        <span class="reel" style="border-color:var(--burnt)"></span>\n'
        '        <span>Filler Phrases</span>\n'
        '        <span class="chk">&#10003;</span>\n'
        '      </a>'
    )

    for i, cat_config in enumerate(config['categories']):
        cat = categories[i] if i < len(categories) else None
        q_count = len(cat['questions']) if cat else 0
        label = cat_config['label']
        cat_id = cat_config['id']
        color = cat_colors.get(cat_config['css_class'], 'var(--gold)')

        chapter_items.append(
            f'      <a class="chapter-item" onclick="navTo(\'#{cat_id}\')">\n'
            f'        <span class="reel" style="border-color:{color}"></span>\n'
            f'        <span>{label} ({q_count})</span>\n'
            f'        <span class="chk">&#10003;</span>\n'
            f'      </a>'
        )

    # Build filler chips
    filler_html = ''
    for f in fillers:
        filler_html += f'          <div class="filler-chip"><span class="en">{f["en"]}</span><span class="jp">{f["jp"]}</span></div>\n'

    # Build category sections with question cards
    categories_html = build_categories_html(config, categories)

    # Build cat-label CSS classes
    cat_label_css = ''
    for cat_config in config['categories']:
        cls = cat_config['css_class']
        color = cat_colors.get(cls, '#00e5cc')
        cat_label_css += f'.film-divider .cat-label.{cls} {{ color: {color}; border-color: {color}; }}\n'

    # Insert cat label styles into CSS
    file_css = file_css.replace(
        ".film-divider .cat-label.env { color: var(--env); border-color: var(--env); }\n"
        ".film-divider .cat-label.work { color: var(--work); border-color: var(--work); }\n"
        ".film-divider .cat-label.edu { color: var(--edu); border-color: var(--edu); }",
        cat_label_css.strip()
    )

    # Also update difficulty badge colors to use cat colors
    file_css = file_css.replace(
        ".q-diff.basic { color: var(--env); border-color: var(--env); }\n"
        ".q-diff.intermediate { color: var(--work); border-color: var(--work); }\n"
        ".q-diff.advanced { color: var(--edu); border-color: var(--edu); }",
        f".q-diff.basic {{ color: {cat_colors.get('cat1', '#00e5cc')}; border-color: {cat_colors.get('cat1', '#00e5cc')}; }}\n"
        f".q-diff.intermediate {{ color: {cat_colors.get('cat2', '#ffc347')}; border-color: {cat_colors.get('cat2', '#ffc347')}; }}\n"
        f".q-diff.advanced {{ color: {cat_colors.get('cat3', '#ff5370')}; border-color: {cat_colors.get('cat3', '#ff5370')}; }}"
    )

    chevron_svg = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>'

    return f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{config["part_label"]}: {config["title"]} | Eiken Pre-1 Speaking</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
<style>
{file_css}
</style>
</head>
<body>

<div class="page-wrap">

{starfield}

<!-- Top Bar -->
<div class="top-bar">
  <div class="top-bar-inner">
    <a href="index.html" class="back-link">&larr; Back</a>
    <button class="theme-toggle" onclick="toggleTheme()">
      <span class="theme-label">Matinee</span>
    </button>
  </div>
</div>

<button class="back-top" onclick="window.scrollTo({{top:0,behavior:'smooth'}})">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>
</button>

<div class="page">

  <!-- Cinema Header -->
  <header class="cinema-header">
    <div class="presents">Eiken Pre-1 Speaking Presents</div>
    <h1>{config["title"]}</h1>
    <div class="tagline">Eiken Pre-1 Speaking &mdash; {config["part_label"]}</div>
    <div class="film-progress">
      <div class="film-track"><div class="film-fill" id="progressFill"></div></div>
      <span class="film-label" id="progressLabel">0 / {total_q}</span>
    </div>
  </header>

  <!-- Bento Grid -->
  <div class="bento-grid">

  <!-- Chapter Select -->
  <nav class="chapter-select">
    <h2>Chapter Select</h2>
    <div class="chapter-list">
{chr(10).join(chapter_items)}
    </div>
  </nav>

  <!-- Winning Formula -->
  <section id="formula" class="poster-card open">
    <div class="poster-header" onclick="toggleCollapsible(this)">
      <h2>The Winning Formula (40-45 Sec)</h2>
      {chevron_svg}
    </div>
    <div class="poster-body">
      <div class="poster-body-inner">
        <p style="color:var(--cream-dim);margin-bottom:16px">
          Follow this structure for every question. Examiners expect a clear opinion, two supported reasons, and a conclusion.
        </p>
        <div class="formula-steps">
          <div class="formula-step"><span class="num">1</span><div><span class="label">Opinion</span> <span class="desc">&mdash; State your position clearly (5 sec)</span></div></div>
          <div class="formula-step"><span class="num">2</span><div><span class="label">Reason 1 + Example</span> <span class="desc">&mdash; First supporting point with concrete detail (15-20 sec)</span></div></div>
          <div class="formula-step"><span class="num">3</span><div><span class="label">Reason 2 + Example</span> <span class="desc">&mdash; Second supporting point with evidence (15-20 sec)</span></div></div>
          <div class="formula-step"><span class="num">4</span><div><span class="label">Conclusion</span> <span class="desc">&mdash; Restate your position with conviction (5 sec)</span></div></div>
        </div>
      </div>
    </div>
  </section>

  <!-- Filler Phrases -->
  <section id="fillers" class="poster-card">
    <div class="poster-header" onclick="toggleCollapsible(this)">
      <h2>Filler Phrases &mdash; Buy Time</h2>
      {chevron_svg}
    </div>
    <div class="poster-body">
      <div class="poster-body-inner">
        <p style="color:var(--cream-dim);margin-bottom:14px">Silence is penalized. Use these phrases naturally to buy thinking time.</p>
        <div class="filler-grid">
{filler_html}        </div>
      </div>
    </div>
  </section>

{categories_html}

  </div><!-- /bento-grid -->

</div>
</div>

<script>
{file_js}
</script>

</body>
</html>'''


def build_categories_html(config, categories):
    """Build the category sections with question cards."""
    html = ''
    q_counter = 0
    chevron_svg = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>'

    for i, cat in enumerate(categories):
        cat_config = config['categories'][i] if i < len(config['categories']) else config['categories'][-1]
        cat_id = cat_config['id']
        cat_label = cat_config['label']
        cat_css = cat_config['css_class']
        q_count = len(cat['questions'])

        html += f'\n  <!-- {cat_label.upper()} QUESTIONS -->\n'
        html += f'  <section id="{cat_id}" class="category">\n'
        html += f'    <div class="film-divider"><span class="cat-label {cat_css}">{cat_label} &mdash; {q_count} Questions</span></div>\n'
        html += f'    <div class="q-card-grid">\n'

        for q in cat['questions']:
            q_counter += 1
            prefix = cat_id.replace('sec-', '')[:3]

            html += f'\n    <!-- {q["num"]} -->\n'
            html += f'    <div class="q-card" data-q="{q_counter}">\n'
            html += f'      <div class="q-header" onclick="toggleQ(this)">\n'
            html += f'        <div class="q-title"><span class="num">{q["num"]}</span> {q["text"]}</div>\n'
            html += f'        <span class="q-diff {q["difficulty"]}">{q["difficulty"].capitalize()}</span>\n'
            html += f'        {chevron_svg}\n'
            html += f'      </div>\n'
            html += f'      <div class="q-body"><div class="q-body-inner">\n'

            # Build buttons
            html += f'        <div class="actions">\n'
            html += f'          <button class="btn btn-hint" onclick="togglePanel(event,\'hint-{prefix}{q_counter}\')">Hint</button>\n'

            if len(q['answers']) == 1:
                html += f'          <button class="btn btn-answer" onclick="togglePanel(event,\'ans-{prefix}{q_counter}\')">Model Answer</button>\n'
            elif len(q['answers']) >= 2:
                html += f'          <button class="btn btn-answer" onclick="togglePanel(event,\'ans-{prefix}{q_counter}-yes\')">Answer (Yes)</button>\n'
                html += f'          <button class="btn btn-alt" onclick="togglePanel(event,\'ans-{prefix}{q_counter}-no\')">Answer (No)</button>\n'

            html += f'        </div>\n'

            # Build hint panel
            if q.get('hint'):
                html += f'        <div id="hint-{prefix}{q_counter}" class="panel hint-panel">\n'

                has_sides = any('YES' in item.upper() or 'NO' in item.upper() or 'side' in item.lower() for item in (q['hint'].get('items') or []))
                html += f'          <h3>{"Consider Both Sides" if has_sides else "Think About It First"}</h3>\n'
                html += f'          <ul>\n'
                for item in (q['hint'].get('items') or []):
                    item_clean = re.sub(r'<[^>]+>', '', item).strip()
                    # Preserve bold markers
                    item_clean = re.sub(r'📌\s*', '', item_clean)
                    html += f'            <li>{item_clean}</li>\n'
                html += f'          </ul>\n'

                if q['hint'].get('key_phrases'):
                    kp_codes = ' '.join(f'<code>{kp}</code>' for kp in q['hint']['key_phrases'])
                    html += f'          <div class="key-phrases">Key vocab: {kp_codes}</div>\n'

                html += f'        </div>\n'

            # Build answer panels
            for j, ans in enumerate(q.get('answers', [])):
                if len(q['answers']) == 1:
                    panel_id = f'ans-{prefix}{q_counter}'
                else:
                    panel_id = f'ans-{prefix}{q_counter}-{"yes" if j == 0 else "no"}'

                html += f'        <div id="{panel_id}" class="panel">\n'
                html += f'          <div class="answer-grid">\n'
                html += f'            <div class="model-answer">\n'
                html += f'              <span class="side-label">{ans["label"]}</span>\n'
                html += f'              <p class="en-text">"{ans["en_text"]}"</p>\n'
                html += f'            </div>\n'
                html += f'            <div class="jp-box">\n'
                html += f'              <span class="side-label">Japanese</span>\n'
                html += f'              <p class="jp-text">{ans["jp_text"]}</p>\n'
                html += f'            </div>\n'
                html += f'          </div>\n'

                if ans.get('tips'):
                    html += f'          <div class="directors-notes">\n'
                    html += f'            <h3>Director\'s Notes</h3>\n'
                    html += f'            <ul>\n'
                    for tip in ans['tips']:
                        html += f'              <li><span class="phrase">"{tip["phrase"]}"</span> <span class="explain">{tip["explain"]}</span></li>\n'
                    html += f'            </ul>\n'
                    html += f'          </div>\n'

                html += f'        </div>\n'

            html += f'      </div></div>\n'
            html += f'    </div>\n'

        html += f'    </div><!-- /q-card-grid -->\n'
        html += f'  </section>\n'

    return html


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 convert_to_cosmic.py <input.html> [--dry-run]")
        print(f"\nConfigured files: {', '.join(FILE_CONFIG.keys())}")
        sys.exit(1)

    input_path = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    filename = os.path.basename(input_path)

    if filename not in FILE_CONFIG:
        print(f"Error: No configuration found for '{filename}'")
        print(f"Configured files: {', '.join(FILE_CONFIG.keys())}")
        sys.exit(1)

    config = FILE_CONFIG[filename]

    print(f"Converting: {filename}")
    print(f"  Title: {config['title']}")
    print(f"  Part: {config['part_label']}")

    # Read input file
    with open(input_path, 'r', encoding='utf-8') as f:
        old_html = f.read()

    # Extract content from old design
    print("  Extracting categories and questions...")
    categories = extract_questions_from_old(old_html)

    for cat in categories:
        print(f"    {cat['name']}: {len(cat['questions'])} questions")
        for q in cat['questions']:
            print(f"      {q['num']}: {q['text'][:50]}... [{q['difficulty']}] ({len(q['answers'])} answers)")

    # Extract filler phrases
    fillers = extract_filler_phrases(old_html)
    print(f"  Extracted {len(fillers)} filler phrases")

    # If no fillers found, use defaults
    if not fillers:
        fillers = [
            {'en': "That's an interesting question...", 'jp': '面白い質問ですね'},
            {'en': 'Let me think about that for a moment...', 'jp': '少し考えさせてください'},
            {'en': 'Well, from my perspective...', 'jp': '私の見方からすると'},
            {'en': "That's a difficult question, but...", 'jp': '難しい質問ですが'},
            {'en': "I haven't thought about it deeply, but...", 'jp': '深く考えたことはないですが'},
            {'en': "If I had to choose, I'd say...", 'jp': '選ぶとしたら'},
        ]
        print("  Using default filler phrases")

    # Read template parts from Part 1
    print("  Reading template from Part 1...")
    css, starfield, js = read_template_parts()

    # Build new file
    print("  Building Hollywood Cosmic HTML...")
    new_html = build_cosmic_html(config, categories, fillers, css, starfield, js)

    if dry_run:
        print(f"\n  [DRY RUN] Would write {len(new_html)} chars to {input_path}")
        print(f"  Preview first 200 chars:\n{new_html[:200]}")
    else:
        # Backup original
        backup_path = input_path + '.bak'
        os.rename(input_path, backup_path)
        print(f"  Backed up original to {backup_path}")

        # Write new file
        with open(input_path, 'w', encoding='utf-8') as f:
            f.write(new_html)
        print(f"  Wrote {len(new_html)} chars to {input_path}")

    print("  Done!")


if __name__ == '__main__':
    main()
