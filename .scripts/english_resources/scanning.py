"""
Scanning and Utility Functions for English Resources

File/folder discovery, URL encoding, breadcrumb building, and date formatting.
"""

import os
import unicodedata
from datetime import datetime
from urllib.parse import quote

# Directories and files to ignore during scanning
IGNORED_DIRS = {'.git', '.scripts', 'node_modules', '.DS_Store'}
IGNORED_FILES = {
    'index.html', 'auto-sync.sh', 'data.json', '.nojekyll', '.DS_Store',
    'SYSTEM-README.md', 'CLAUDE.md', 'favicon.svg', 'og-image.svg', 'og-image.png',
    'styles.css', 'sitemap.xml'
}

# Folder name display mappings
FOLDER_NAME_MAP = {
    'grade2': '高校２年',
    'grade3': '高校３年',
    'kounen': '高校２年',
    'past-exams': '大学入試',
    'englishexpressionsii': '論表Ⅱ',
    'folder': '論表Ⅱ',
    'new-folder': '新規フォルダ'
}


def normalize_nfc(text: str) -> str:
    """
    Normalize Unicode to NFC form for consistent URL encoding.

    macOS uses NFD form by default, GitHub Pages expects NFC.
    This prevents 404 errors on Japanese folder names.
    """
    return unicodedata.normalize('NFC', text)


def safe_quote(text: str) -> str:
    """URL-encode text with NFC normalization."""
    return quote(normalize_nfc(text))


def get_folder_name(path: str) -> str:
    """
    Get display name for a folder.

    Args:
        path: Folder path or name

    Returns:
        Human-readable display name
    """
    folder_name = os.path.basename(path)
    return FOLDER_NAME_MAP.get(folder_name, folder_name)


def get_file_title(filename: str) -> str:
    """
    Extract title from filename by removing extension.

    Args:
        filename: File name with extension

    Returns:
        File name without extension
    """
    return os.path.splitext(filename)[0]


def count_items(path: str) -> tuple:
    """
    Count subfolders and HTML files in a directory.

    Args:
        path: Directory path

    Returns:
        Tuple of (folder_count, file_count)
    """
    folders = 0
    files = 0
    try:
        for item in os.listdir(path):
            if item in IGNORED_DIRS or item in IGNORED_FILES:
                continue
            full_path = os.path.join(path, item)
            if os.path.isdir(full_path):
                folders += 1
            elif item.endswith('.html'):
                files += 1
    except OSError:
        pass
    return folders, files


def count_lessons_recursive(path: str) -> int:
    """
    Recursively count all HTML lesson files in a directory tree.

    Args:
        path: Root directory path

    Returns:
        Total count of HTML files
    """
    total = 0
    try:
        for item in os.listdir(path):
            if item in IGNORED_DIRS or item in IGNORED_FILES:
                continue
            full_path = os.path.join(path, item)
            if os.path.isdir(full_path):
                total += count_lessons_recursive(full_path)
            elif item.endswith('.html'):
                total += 1
    except OSError:
        pass
    return total


def build_breadcrumb(rel_path: str, depth: int) -> str:
    """
    Build breadcrumb HTML from relative path.

    Args:
        rel_path: Relative path from repo root (e.g., "高校２年/論理・表現II")
        depth: Folder depth from repo root

    Returns:
        HTML string for breadcrumb navigation
    """
    if depth == 0:
        return ''

    parts = rel_path.split('/') if rel_path else []
    if not parts:
        return ''

    crumbs = []
    home_path = '../' * depth + 'index.html'
    crumbs.append(f'<a href="{home_path}" class="breadcrumb-item">Home</a>')
    crumbs.append('<span class="breadcrumb-sep" role="presentation">›</span>')

    for i, part in enumerate(parts[:-1]):
        display_name = get_folder_name(part)
        path_to = '../' * (depth - i - 1) + 'index.html'
        crumbs.append(f'<a href="{path_to}" class="breadcrumb-item">{display_name}</a>')
        crumbs.append('<span class="breadcrumb-sep" role="presentation">›</span>')

    current_name = get_folder_name(parts[-1])
    crumbs.append(f'<span class="breadcrumb-current">{current_name}</span>')

    return ''.join(crumbs)


def get_formatted_date() -> str:
    """
    Get current date formatted for display.

    Returns:
        Date string like "January 27, 2026"
    """
    now = datetime.now()
    return now.strftime("%B %d, %Y")


def scan_top_folders(repo_dir: str) -> list:
    """
    Find top-level folders in the repository.

    Args:
        repo_dir: Repository root directory

    Returns:
        List of folder dictionaries with name, slug, and meta
    """
    top_folders = []
    meta_map = {
        '高校１年': 'First Year',
        '高校２年': 'Second Year',
        '高校３年': 'Third Year',
    }

    try:
        for item in sorted(os.listdir(repo_dir)):
            if item in IGNORED_DIRS or item.startswith('.') or item in IGNORED_FILES:
                continue
            full_path = os.path.join(repo_dir, item)
            if os.path.isdir(full_path):
                name = get_folder_name(item)
                top_folders.append({
                    'name': name,
                    'slug': item,
                    'meta': meta_map.get(name, '')
                })
    except OSError:
        pass

    return top_folders
