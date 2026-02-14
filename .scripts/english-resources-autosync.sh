#!/bin/bash

# Auto-sync script: watches for file changes, regenerates indexes, and pushes to GitHub

REPO_DIR="/Users/slimtetto/Projects/English-Resources"
cd "$REPO_DIR" || exit 1

echo "Auto-sync started for: $REPO_DIR"
echo "Watching for file changes..."

/usr/local/bin/fswatch -o --exclude '.git' --exclude '.DS_Store' "$REPO_DIR" | while read -r event; do
    sleep 5  # Debounce: wait for file writes to settle

    # Check if there are meaningful changes (ignore .DS_Store)
    CHANGES=$(git status --porcelain -- . ':!*.DS_Store' 2>/dev/null)
    if [[ -z "$CHANGES" ]]; then
        continue
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected, regenerating indexes..."

    # Run the index generator
    /usr/local/bin/python3 /usr/local/bin/english-resources-generate.py

    # Stage only meaningful files (exclude .DS_Store)
    git add -A -- . ':!*.DS_Store'

    # Check if there are staged changes
    if git diff --cached --quiet; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] No meaningful changes to commit"
        continue
    fi

    CHANGED=$(git diff --cached --name-only | head -5 | tr '\n' ', ' | sed 's/,$//')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Committing: $CHANGED"

    git commit -m "Auto-sync: $CHANGED"

    if git push; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushed to GitHub successfully"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Push failed"
    fi
    echo ""

    sleep 3  # Cooldown: prevent cascading triggers from generated files
done
