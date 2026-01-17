# English Resources - System Documentation

## Overview
This system automatically syncs local file changes to GitHub and updates all index.html files.

```
Edit files locally → Auto-generates indexes → Pushes to GitHub → Live on website
```

---

## Key Locations

| What | Path |
|------|------|
| **Local Repo** | `/Users/slimtetto/Projects/English-Resources` |
| **GitHub Repo** | `https://github.com/harashima-eng/English-Resources` |
| **Live Website** | `https://harashima-eng.github.io/English-Resources` |
| **Auto-sync Script** | `/usr/local/bin/english-resources-autosync.sh` |
| **Index Generator** | `/usr/local/bin/english-resources-generate.py` |
| **LaunchAgent** | `~/Library/LaunchAgents/com.english-resources.autosync.plist` |
| **Sync Log** | `/tmp/english-resources-autosync.log` |
| **Backup Script** | `/usr/local/bin/english-resources-backup.sh` |
| **Backup Location** | `iCloud Drive/Backups/English-Resources/` |
| **Backup Log** | `/tmp/english-resources-backup.log` |

---

## UI Features

### Premium Apple-Style Design
- **Glass morphism** - Multi-layer frosted glass with gradient overlays
- **Glow effects** - Colored halos behind icons that intensify on hover
- **3-layer shadows** - Ambient, key, and contact shadows for depth
- **60fps animations** - GPU-accelerated with spring physics timing

### User Controls
- **Light/Dark mode** - Toggle in header (light is default, preference saved)
- **Grid/List view** - Toggle layout style (preference saved)
- **Breadcrumb navigation** - Easy path navigation on subpages

### Other Features
- Recursive lesson counts for folders
- Last updated date in footer
- Favicon and Open Graph meta tags for social sharing
- Staggered reveal animation on page load
- Reduced motion support for accessibility

---

## How It Works

### 1. Auto-Sync (runs on Mac login)
- Watches for file changes in the repo folder
- When changes detected:
  1. Runs the index generator
  2. Commits all changes
  3. Pushes to GitHub

### 2. Index Generator
- Scans all folders and HTML files
- Regenerates every `index.html` to list current contents
- URL-encodes Japanese folder/file names for web compatibility
- Applies premium Apple-style UI with all features above

### 3. Auto-Backup (runs weekly)
- Runs every Sunday at 2:00 AM
- Backs up to iCloud Drive (syncs to all devices)
- Keeps last 4 weekly backups (1 month rolling history)
- Location: `iCloud Drive/Backups/English-Resources/YYYY-MM-DD/`

---

## Common Commands

### Check if auto-sync is running
```bash
launchctl list | grep english-resources
```

### View sync log
```bash
cat /tmp/english-resources-autosync.log
```

### Manually regenerate indexes
```bash
python3 /usr/local/bin/english-resources-generate.py
```

### Stop auto-sync
```bash
launchctl unload ~/Library/LaunchAgents/com.english-resources.autosync.plist
```

### Start auto-sync
```bash
launchctl load ~/Library/LaunchAgents/com.english-resources.autosync.plist
```

### Restart auto-sync
```bash
launchctl unload ~/Library/LaunchAgents/com.english-resources.autosync.plist
launchctl load ~/Library/LaunchAgents/com.english-resources.autosync.plist
```

---

## Adding Content

### Add a new file
1. Put HTML file in any folder (e.g., `高校２年/論理・表現II/newfile.html`)
2. Auto-sync will:
   - Update the folder's `index.html`
   - Commit and push to GitHub
3. Check website in ~1-5 minutes

### Add a new folder
1. Create folder with Japanese or English name
2. Add HTML files inside
3. Auto-sync will:
   - Update parent folder's `index.html`
   - Create new folder's `index.html`
   - Push to GitHub

### Rename folder/file
1. Just rename it in Finder or Terminal
2. Auto-sync handles the rest

### Delete folder/file
1. Just delete it
2. Auto-sync will update indexes and push

---

## Troubleshooting

### Changes not syncing?
1. Check if auto-sync is running: `launchctl list | grep english-resources`
2. Check log for errors: `cat /tmp/english-resources-autosync.log`
3. Restart auto-sync (see commands above)

### Website not updating?
- GitHub Pages takes 1-5 minutes to update
- Hard refresh: `Cmd + Shift + R`
- Try incognito window

### Need to edit the generator?
- File: `/usr/local/bin/english-resources-generate.py`
- After editing, changes apply on next file save in repo

---

## Files NOT to delete
- `data.json` - stores settings
- `.nojekyll` - needed for GitHub Pages
- `index.html` files - auto-generated, but needed
- `favicon.svg` - site favicon
- `og-image.png` - social sharing preview image

---

## User Preferences (localStorage)

| Key | Values | Default |
|-----|--------|---------|
| `er-theme` | `light` / `dark` | `light` |
| `er-view` | `grid` / `list` | `grid` |

---

Created: 2026-01-17
Updated: 2026-01-17
System set up with Claude Code
