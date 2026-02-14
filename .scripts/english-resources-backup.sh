#!/bin/bash
REPO="/Users/slimtetto/Projects/English-Resources"
BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/English-Resources"
TIMESTAMP=$(date +%Y-%m-%d)
LOG="$HOME/.claude/logs/english-resources-backup.log"

echo "[$(date)] Starting backup..." >> "$LOG"

mkdir -p "$BACKUP_DIR"
rsync -av --exclude='.git' "$REPO/" "$BACKUP_DIR/$TIMESTAMP/" >> "$LOG" 2>&1

# Keep only last 4 backups
cd "$BACKUP_DIR" && ls -dt */ 2>/dev/null | tail -n +5 | xargs rm -rf 2>/dev/null

echo "[$(date)] Backup completed to $BACKUP_DIR/$TIMESTAMP" >> "$LOG"
