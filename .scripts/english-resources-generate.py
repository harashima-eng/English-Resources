#!/usr/bin/env python3
"""
Index Generator for English Resources
Scans the folder structure and regenerates all index.html files.
Nordic Design System - Gray/Beige aesthetic with separate folder/file sections.

Usage:
    python3 english-resources-generate.py [--dry-run]
"""

import os
import sys
import json
import logging
from datetime import datetime
from pathlib import Path

# Add module path for imports
sys.path.insert(0, '/usr/local/bin')

from english_resources.colors import GRADE_COLORS, get_grade_style
from english_resources.templates import (
    MAIN_STYLE, FONT_LINK, ARROW_SVG, SUN_ICON, MOON_ICON,
    BG_GLOW_HTML, THEME_TOGGLE_JS, FOLDER_ICON_SVG, FILE_ICON_SVG, BOOK_ICON_SVG
)
from english_resources.scanning import (
    IGNORED_DIRS, IGNORED_FILES, safe_quote, get_folder_name, get_file_title,
    count_items, count_lessons_recursive, build_breadcrumb, get_formatted_date,
    scan_top_folders
)
from english_resources.sitemap import write_sitemap

# Configuration
REPO_DIR = "/Users/slimtetto/Projects/English-Resources"
LOG_FILE = "/tmp/english-resources-generate.log"

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def generate_og_meta(title: str, description: str, depth: int = 0) -> str:
    """Generate Open Graph meta tags."""
    return f'''<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://harashima-eng.github.io/English-Resources/og-image.png">
<meta name="twitter:card" content="summary_large_image">'''


def get_css_path(depth: int) -> str:
    """Get relative path to styles.css based on folder depth."""
    if depth == 0:
        return "styles.css"
    return "../" * depth + "styles.css"


def generate_main_index(folders_data: list, settings: dict) -> str:
    """Generate the main index.html."""
    folder_cards = ""
    for folder in folders_data:
        folder_path = os.path.join(REPO_DIR, folder['slug'])
        lesson_count = count_lessons_recursive(folder_path)
        if lesson_count > 0:
            count_text = f"{lesson_count} lessons"
        else:
            subfolders, files = count_items(folder_path)
            count_text = f"{subfolders + files} items" if subfolders + files != 1 else "1 item"
        encoded_slug = safe_quote(folder['slug'])
        name = folder['name']
        grade_info = get_grade_style(name)
        gradient, icon = grade_info[0], grade_info[1]

        # Use SVG folder icon instead of emoji for consistency
        folder_cards += f'''<a href="{encoded_slug}/index.html" class="card" title="{name}">
        <div class="card-icon" style="background:{gradient}">{icon}</div>
        <div class="card-content">
          <div class="card-title" title="{name}">{name}</div>
          <div class="card-meta">{folder.get('meta', '')} · {count_text}</div>
        </div>
        <span class="card-arrow">{ARROW_SVG}</span>
      </a>'''

    og_meta = generate_og_meta(settings['siteName'], '英語学習教材ライブラリ - 高校英語の学習教材にアクセス')
    formatted_date = get_formatted_date()
    css_path = get_css_path(0)

    return f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{settings['siteName']}</title>
<meta name="description" content="英語学習教材ライブラリ - 高校英語の学習教材にアクセス">
{og_meta}
<link rel="icon" href="favicon.svg" type="image/svg+xml">
{FONT_LINK}
<link rel="stylesheet" href="{css_path}">
</head>
<body>
{BG_GLOW_HTML}
<header class="header">
  <div class="header-inner">
    <div class="header-icon" style="background:linear-gradient(135deg,var(--accent),#0A7A70)">{settings['siteIcon']}</div>
    <div class="header-content">
      <div class="header-title">{settings['siteName']}</div>
    </div>
    <div class="header-actions">
      <button class="theme-btn" aria-label="Toggle theme">{SUN_ICON}{MOON_ICON}</button>
      <div class="header-badge">{len(folders_data)} grades</div>
    </div>
  </div>
</header>
<main>
  <div class="container">
    <section class="hero">
      <h1 class="hero-title">{settings['siteName']}</h1>
      <p class="hero-description">学年を選択して英語学習教材にアクセス</p>
    </section>
    <section class="section">
      <div class="grid">{folder_cards}</div>
    </section>
    <footer>
      Crafted for learning
      <div class="footer-date">Last updated: {formatted_date}</div>
    </footer>
  </div>
</main>
{THEME_TOGGLE_JS}
</body>
</html>'''


def generate_folder_index(path: str, rel_path: str, name: str, parent_path: str = "../",
                          depth: int = 1, grade_color: str = None, grade_color_dark: str = None) -> str:
    """Generate index.html for a subfolder with separate folder/file sections."""
    subfolders = []
    files = []

    try:
        for item in sorted(os.listdir(path)):
            if item in IGNORED_DIRS or item in IGNORED_FILES:
                continue
            full_path = os.path.join(path, item)
            if os.path.isdir(full_path):
                subfolders.append(item)
            elif item.endswith('.html'):
                files.append(item)
    except OSError as e:
        logger.error(f"Error reading directory {path}: {e}")

    grade_info = get_grade_style(name)
    gradient, icon = grade_info[0], grade_info[1]

    # Use provided grade color or get from current grade
    if grade_color is None and len(grade_info) >= 4:
        grade_color = grade_info[2]
        grade_color_dark = grade_info[3]

    # Default fallback
    if grade_color is None:
        grade_color = '#8B7355'
        grade_color_dark = '#7A6345'

    # Generate folder section with SVG icons
    folders_html = ""
    if subfolders:
        folder_items = ""
        for folder in subfolders:
            folder_path = os.path.join(path, folder)
            lesson_count = count_lessons_recursive(folder_path)
            if lesson_count > 0:
                count_text = f"{lesson_count} lessons"
            else:
                sub_folders, sub_files = count_items(folder_path)
                total = sub_folders + sub_files
                count_text = f"{total} items" if total != 1 else "1 item"
            display_name = get_folder_name(folder)
            encoded_folder = safe_quote(folder)
            folder_items += f'''<a href="{encoded_folder}/index.html" class="card" title="{display_name}">
            <div class="card-icon" style="background:linear-gradient(135deg,{grade_color},{grade_color_dark})">{FOLDER_ICON_SVG}</div>
            <div class="card-content">
              <div class="card-title" title="{display_name}">{display_name}</div>
              <div class="card-meta">{count_text}</div>
            </div>
            <span class="card-arrow">{ARROW_SVG}</span>
          </a>'''

        folders_html = f'''<section class="section">
      <div class="section-header">
        <div class="section-icon" style="background:linear-gradient(135deg,{grade_color},{grade_color_dark});color:white">{FOLDER_ICON_SVG}</div>
        <span class="section-title">Folders</span>
        <span class="section-count">{len(subfolders)}</span>
      </div>
      <div class="grid">{folder_items}</div>
    </section>'''

    # Generate files section with SVG icons
    files_html = ""
    if files:
        file_items = ""
        for file in files:
            title = get_file_title(file)
            encoded_file = safe_quote(file)
            # Extract icon content (lesson number or document icon)
            icon_content = FILE_ICON_SVG
            if 'Lesson' in title or 'lesson' in title:
                parts = title.split('｜')
                if len(parts) > 0:
                    num_part = parts[0].replace('Lesson ', '').replace('lesson ', '')
                    if num_part.isdigit():
                        icon_content = num_part
            file_items += f'''<a href="{encoded_file}" class="item" target="_blank" rel="noopener noreferrer" title="{title} (新しいタブで開く)">
            <div class="item-icon" style="background:linear-gradient(135deg,{grade_color},{grade_color_dark})">{icon_content}</div>
            <div class="item-content">
              <div class="item-title" title="{title}">{title}</div>
              <div class="item-meta">Click to open</div>
            </div>
            <span class="item-arrow">{ARROW_SVG}</span>
          </a>'''

        files_html = f'''<section class="section">
      <div class="section-header">
        <div class="section-icon" style="background:linear-gradient(135deg,{grade_color},{grade_color_dark});color:white">{FILE_ICON_SVG}</div>
        <span class="section-title">Files</span>
        <span class="section-count">{len(files)}</span>
      </div>
      <div class="list">{file_items}</div>
    </section>'''

    # Combine content
    content = folders_html + files_html

    # Empty state if no content
    if not subfolders and not files:
        content = '''<div class="empty-state">
      <div class="empty-icon">📂</div>
      <h2 class="empty-title">Coming Soon</h2>
      <p class="empty-description">このセクションの教材は現在準備中です</p>
    </div>'''

    # Count summary for badge
    total_lessons = count_lessons_recursive(path)
    if total_lessons > 0:
        badge = f"{total_lessons} lessons"
    elif len(subfolders) > 0:
        badge = f"{len(subfolders)} folders"
    else:
        badge = "Empty"

    breadcrumb_html = build_breadcrumb(rel_path, depth)
    favicon_path = '../' * depth + 'favicon.svg'
    css_path = get_css_path(depth)
    og_meta = generate_og_meta(f"{name} | English Resources", f"英語学習教材ライブラリ - {name}", depth)
    formatted_date = get_formatted_date()

    return f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{name} | English Resources</title>
<meta name="description" content="英語学習教材ライブラリ - {name}">
{og_meta}
<link rel="icon" href="{favicon_path}" type="image/svg+xml">
{FONT_LINK}
<link rel="stylesheet" href="{css_path}">
</head>
<body>
{BG_GLOW_HTML}
<header class="header">
  <div class="header-inner">
    <div class="header-icon" style="background:{gradient}">{icon}</div>
    <div class="header-content">
      <div class="header-title">{name}</div>
      <nav class="breadcrumb" aria-label="Breadcrumb">{breadcrumb_html}</nav>
    </div>
    <div class="header-actions">
      <button class="theme-btn" aria-label="Toggle theme">{SUN_ICON}{MOON_ICON}</button>
      <div class="header-badge">{badge}</div>
    </div>
  </div>
</header>
<main>
  <div class="container">
    {content}
    <footer>
      Crafted for learning
      <div class="footer-date">Last updated: {formatted_date}</div>
    </footer>
  </div>
</main>
{THEME_TOGGLE_JS}
</body>
</html>'''


def write_css_file():
    """Write the external CSS stylesheet."""
    css_path = os.path.join(REPO_DIR, 'styles.css')
    try:
        with open(css_path, 'w', encoding='utf-8') as f:
            f.write(MAIN_STYLE)
        logger.info("Generated styles.css")
    except OSError as e:
        logger.error(f"Error writing styles.css: {e}")
        raise


def scan_and_generate():
    """Scan the repo and generate all index files."""
    logger.info("Starting index generation...")
    logger.info(f"Repository: {REPO_DIR}")

    # Load or create settings
    data_path = os.path.join(REPO_DIR, 'data.json')
    try:
        if os.path.exists(data_path):
            with open(data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            settings = data.get('settings', {
                'siteName': 'English Resources',
                'siteIcon': '📚',
                'siteColor': '#0D9488',
                'mainHtmlFile': 'index.html'
            })
        else:
            settings = {
                'siteName': 'English Resources',
                'siteIcon': '📚',
                'siteColor': '#0D9488',
                'mainHtmlFile': 'index.html'
            }
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Error reading data.json, using defaults: {e}")
        settings = {
            'siteName': 'English Resources',
            'siteIcon': '📚',
            'siteColor': '#0D9488',
            'mainHtmlFile': 'index.html'
        }

    # Write external CSS file
    write_css_file()

    # Find top-level folders
    top_folders = scan_top_folders(REPO_DIR)
    logger.info(f"Found {len(top_folders)} top-level folders")

    # Generate main index
    logger.info("Generating main index.html...")
    try:
        main_html = generate_main_index(top_folders, settings)
        with open(os.path.join(REPO_DIR, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(main_html)
    except OSError as e:
        logger.error(f"Error writing main index.html: {e}")
        raise

    # Generate index for each folder recursively
    def process_folder(path: str, rel_path: str, depth: int = 1,
                       grade_color: str = None, grade_color_dark: str = None):
        name = get_folder_name(os.path.basename(path))
        parent = "../" * depth

        # If this is a top-level grade folder, get its color
        if depth == 1:
            grade_info = get_grade_style(name)
            if len(grade_info) >= 4:
                grade_color = grade_info[2]
                grade_color_dark = grade_info[3]

        logger.info(f"Generating {rel_path}/index.html...")
        try:
            html = generate_folder_index(path, rel_path, name, parent, depth, grade_color, grade_color_dark)
            with open(os.path.join(path, 'index.html'), 'w', encoding='utf-8') as f:
                f.write(html)
        except OSError as e:
            logger.error(f"Error writing {rel_path}/index.html: {e}")
            raise

        # Process subfolders, passing grade color down
        try:
            for item in os.listdir(path):
                if item in IGNORED_DIRS:
                    continue
                full_path = os.path.join(path, item)
                if os.path.isdir(full_path):
                    process_folder(full_path, f"{rel_path}/{item}", depth + 1, grade_color, grade_color_dark)
        except OSError as e:
            logger.error(f"Error processing subfolders of {rel_path}: {e}")

    for folder in top_folders:
        folder_path = os.path.join(REPO_DIR, folder['slug'])
        process_folder(folder_path, folder['slug'])

    # Generate sitemap
    logger.info("Generating sitemap.xml...")
    try:
        write_sitemap(REPO_DIR)
    except OSError as e:
        logger.error(f"Error writing sitemap.xml: {e}")

    # Update data.json only if settings changed (avoid noisy timestamp-only commits)
    logger.info("Checking data.json...")
    try:
        new_data = {
            'settings': settings
        }
        needs_write = True
        if os.path.exists(data_path):
            with open(data_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            if existing.get('settings') == settings:
                needs_write = False

        if needs_write:
            logger.info("Updating data.json (settings changed)...")
            with open(data_path, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, ensure_ascii=False, indent=2)
        else:
            logger.info("data.json unchanged, skipping write")
    except (OSError, json.JSONDecodeError) as e:
        logger.error(f"Error with data.json: {e}")

    logger.info("Done!")


if __name__ == '__main__':
    try:
        scan_and_generate()
    except Exception as e:
        logger.error(f"Generator failed: {e}")
        sys.exit(1)
