"""
English Resources Generator Modules
Modular components for generating the English Resources static site.
"""

from .colors import GRADE_COLORS, get_grade_style
from .templates import MAIN_STYLE, FONT_LINK, ARROW_SVG, SUN_ICON, MOON_ICON, BG_GLOW_HTML, THEME_TOGGLE_JS
from .scanning import (
    normalize_nfc, safe_quote, get_folder_name, get_file_title,
    count_items, count_lessons_recursive, build_breadcrumb, get_formatted_date,
    scan_top_folders, IGNORED_DIRS, IGNORED_FILES
)

__all__ = [
    'GRADE_COLORS', 'get_grade_style',
    'MAIN_STYLE', 'FONT_LINK', 'ARROW_SVG', 'SUN_ICON', 'MOON_ICON', 'BG_GLOW_HTML', 'THEME_TOGGLE_JS',
    'normalize_nfc', 'safe_quote', 'get_folder_name', 'get_file_title',
    'count_items', 'count_lessons_recursive', 'build_breadcrumb', 'get_formatted_date'
]
