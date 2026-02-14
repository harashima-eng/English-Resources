"""
Color System - Single Source of Truth for English Resources

RULE: ALL colored icons MUST use inline styles derived from GRADE_COLORS.
      NEVER use CSS class-based colors (.section-icon.folders, etc.)
      CSS classes are for layout/sizing only, NOT for colors.

GRADE_COLORS tuple format:
    (css_gradient, icon_text, hex_primary, hex_dark)

Colored elements that MUST use inline style="background:linear-gradient(...)":
    - .header-icon      (page header icon)
    - .section-icon     (folders AND files section headers)
    - .card-icon        (folder cards in grid)
    - .item-icon        (file items in list)

Grade colors are passed recursively through the folder hierarchy:
    process_folder() -> generate_folder_index() -> (subfolders inherit)
"""

# Nordic palette colors for each grade level
GRADE_COLORS = {
    '高校１年': ('linear-gradient(135deg,#A05020,#8A4018)', '1', '#A05020', '#8A4018'),  # Nordic rust
    '高校２年': ('linear-gradient(135deg,#7A9BA8,#6A8B98)', '2', '#7A9BA8', '#6A8B98'),  # Nordic fjord teal
    '高校３年': ('linear-gradient(135deg,#337058,#2A5F4A)', '3', '#337058', '#2A5F4A'),  # Nordic forest green
}

# Default fallback color for non-grade folders
DEFAULT_COLOR = '#8B7355'
DEFAULT_COLOR_DARK = '#7A6345'


def get_grade_style(name: str) -> tuple:
    """
    Get gradient, icon, and colors for grade folders.

    Args:
        name: Folder display name (e.g., '高校１年')

    Returns:
        Tuple of (css_gradient, icon_text, hex_primary, hex_dark)
    """
    if name in GRADE_COLORS:
        return GRADE_COLORS[name]
    return (f'linear-gradient(135deg,{DEFAULT_COLOR},{DEFAULT_COLOR_DARK})',
            '📁', DEFAULT_COLOR, DEFAULT_COLOR_DARK)
