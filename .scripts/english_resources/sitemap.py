"""
Sitemap Generator for English Resources

Generates sitemap.xml for SEO and crawlability.
"""

import os
from datetime import datetime
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString

from .scanning import IGNORED_DIRS, IGNORED_FILES, safe_quote


def generate_sitemap(repo_dir: str, base_url: str = "https://harashima-eng.github.io/English-Resources") -> str:
    """
    Generate sitemap.xml content for the repository.

    Args:
        repo_dir: Repository root directory
        base_url: Base URL for the live site

    Returns:
        XML string for sitemap
    """
    urlset = Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')

    def add_url(loc: str, lastmod: datetime, priority: str = "0.5"):
        """Add a URL entry to the sitemap."""
        url = SubElement(urlset, 'url')
        loc_elem = SubElement(url, 'loc')
        loc_elem.text = loc
        lastmod_elem = SubElement(url, 'lastmod')
        lastmod_elem.text = lastmod.strftime('%Y-%m-%d')
        priority_elem = SubElement(url, 'priority')
        priority_elem.text = priority

    def scan_directory(path: str, url_path: str, depth: int = 0):
        """Recursively scan directory and add HTML files to sitemap."""
        # Add index.html for this directory
        index_path = os.path.join(path, 'index.html')
        if os.path.exists(index_path):
            mtime = datetime.fromtimestamp(os.path.getmtime(index_path))
            priority = "1.0" if depth == 0 else ("0.8" if depth == 1 else "0.6")
            add_url(f"{base_url}/{url_path}index.html" if url_path else f"{base_url}/index.html",
                    mtime, priority)

        # Scan for HTML files and subdirectories
        try:
            for item in sorted(os.listdir(path)):
                if item in IGNORED_DIRS or item in IGNORED_FILES:
                    continue

                full_path = os.path.join(path, item)

                if os.path.isdir(full_path):
                    # Recurse into subdirectory
                    encoded_item = safe_quote(item)
                    new_url_path = f"{url_path}{encoded_item}/" if url_path else f"{encoded_item}/"
                    scan_directory(full_path, new_url_path, depth + 1)
                elif item.endswith('.html'):
                    # Add HTML file
                    mtime = datetime.fromtimestamp(os.path.getmtime(full_path))
                    encoded_item = safe_quote(item)
                    file_url = f"{base_url}/{url_path}{encoded_item}" if url_path else f"{base_url}/{encoded_item}"
                    add_url(file_url, mtime, "0.5")
        except OSError:
            pass

    # Start scanning from repo root
    scan_directory(repo_dir, "")

    # Convert to pretty-printed XML string
    rough_string = tostring(urlset, encoding='unicode')
    reparsed = parseString(rough_string)
    return reparsed.toprettyxml(indent="  ", encoding=None)


def write_sitemap(repo_dir: str, base_url: str = "https://harashima-eng.github.io/English-Resources"):
    """
    Generate and write sitemap.xml to the repository.

    Args:
        repo_dir: Repository root directory
        base_url: Base URL for the live site
    """
    sitemap_content = generate_sitemap(repo_dir, base_url)
    sitemap_path = os.path.join(repo_dir, 'sitemap.xml')

    with open(sitemap_path, 'w', encoding='utf-8') as f:
        f.write(sitemap_content)
