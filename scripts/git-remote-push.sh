#!/usr/bin/env bash
# Usage: ./scripts/git-remote-push.sh 'https://github.com/YOUR_USER/YOUR_REPO.git'
set -euo pipefail
url="${1:?Pass your repo HTTPS URL, e.g. https://github.com/you/bio-sim-matrix.git}"
cd "$(dirname "$0")/.."
git remote remove origin 2>/dev/null || true
git remote add origin "$url"
echo "Pushing main → origin ..."
git push -u origin main
