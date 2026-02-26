#!/bin/bash

# Auto-sync script: watches for file changes, regenerates indexes, and pushes to GitHub

# Ensure node/npx are available (LaunchAgent has minimal PATH)
export PATH="/usr/local/bin:$PATH"

REPO_DIR="/Users/slimtetto/Projects/English-Resources"
cd "$REPO_DIR" || exit 1

echo "Auto-sync started for: $REPO_DIR"
echo "Watching for file changes..."

# Log rotation: keep last 1000 lines when log exceeds 5000
LOG="/tmp/english-resources-autosync.log"
if [ -f "$LOG" ] && [ $(wc -l < "$LOG") -gt 5000 ]; then
    tail -1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Log rotated (kept last 1000 lines)"
fi

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

        # Deploy to Firebase Hosting (keeps web.app in sync with GitHub Pages)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Firebase deploy..."
        FIREBASE_OUTPUT=$(/usr/local/bin/npx --yes firebase-tools deploy --only hosting --project english-resources-reveal 2>&1)
        FIREBASE_EXIT=$?
        if [ $FIREBASE_EXIT -eq 0 ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Firebase Hosting deployed successfully"
            # Clean up old hosting versions (keep 5)
            /usr/local/bin/node /Users/slimtetto/Projects/English-Resources/.scripts/hosting-cleanup.js 5 2>&1 | head -3
        else
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Firebase Hosting deploy failed (exit $FIREBASE_EXIT):"
            echo "$FIREBASE_OUTPUT" | tail -20
        fi

        # Run content validator if lesson files changed
        if echo "$CHANGED" | grep -q "Dual Scope.*\.html"; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running content validator..."
            VALIDATE_OUTPUT=$(/usr/local/bin/python3 /usr/local/bin/english-resources-validate.py 2>&1)
            VALIDATE_EXIT=$?
            if [ $VALIDATE_EXIT -eq 0 ]; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] Content validation: all checks passed"
            else
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] Content validation: issues found"
                echo "$VALIDATE_OUTPUT" | grep -E "^  (🔴|🟡)" | head -10
                HIGH_COUNT=$(echo "$VALIDATE_OUTPUT" | grep -c "🔴" || true)
                if [ "$HIGH_COUNT" -gt 0 ]; then
                    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ $HIGH_COUNT HIGH severity issues — check with: python3 /usr/local/bin/english-resources-validate.py"
                fi
            fi
        fi
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Push failed"
    fi
    echo ""

    sleep 3  # Cooldown: prevent cascading triggers from generated files
done
