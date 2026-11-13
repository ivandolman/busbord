#!/bin/sh
# PreToolUse hook: blocks a `git commit` while files under src/ or scripts/ are added, deleted or
# renamed (or .env.example changed) and docs/ARCHITECTURE.md is not changed along with them.

command=$(jq -r '.tool_input.command // ""')
case "$command" in
    *CODE_MAP_OK=1*) exit 0 ;;
    *"git commit"*) ;;
    *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Working tree and index together: `git add … && git commit` in one command stages after this runs.
changes=$(git status --porcelain --untracked-files=all)
printf '%s\n' "$changes" | grep -q 'docs/ARCHITECTURE.md$' && exit 0

structural=$(printf '%s\n' "$changes" | awk '
    { code = substr($0, 1, 2); path = substr($0, 4); sub(/.* -> /, "", path) }
    code ~ /[ADR?]/ && path ~ /^(src|scripts)\// { print code " " path }
    path == ".env.example" { print code " " path }
')
[ -z "$structural" ] && exit 0

{
    echo "Structural change without a code map update (docs/ARCHITECTURE.md unchanged):"
    printf '%s\n' "$structural" | sed 's/^/  /'
    echo "Update the matching lines in docs/ARCHITECTURE.md and include it in the commit."
    echo "If the map is not affected (e.g. a new test file, or the files are not part of this"
    echo "commit), rerun the command with CODE_MAP_OK=1 in front of git commit."
} >&2
exit 2
