#!/bin/bash

# Auto-sync script: watches for file changes and auto-commits/pushes to GitHub
# Usage: ./auto-sync.sh

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "Auto-sync started for: $REPO_DIR"
echo "Watching for file changes... (Press Ctrl+C to stop)"
echo ""

fswatch -o --exclude '.git' "$REPO_DIR" | while read -r event; do
    # Wait a moment for file writes to complete
    sleep 1

    # Check if there are changes
    if [[ -n $(git status --porcelain) ]]; then
        # Get list of changed files for commit message
        CHANGED=$(git status --porcelain | head -5 | awk '{print $2}' | tr '\n' ', ' | sed 's/,$//')

        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected: $CHANGED"

        # Add all changes
        git add -A

        # Commit with timestamp
        git commit -m "Auto-sync: $CHANGED"

        # Push to GitHub
        if git push; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushed to GitHub successfully"
        else
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Push failed - check your connection"
        fi
        echo ""
    fi
done
