---
name: verify
description: Run the project's checks (typecheck, lint, unit tests, optionally integration tests and build) with compact output. Use before committing or when asked to check, test or verify a change in bestemmingsbord.
---

# Verify

Run from the repo root. Show only failures, not full logs, to save tokens.

1. Typecheck + lint + unit tests, stopping at the first failing step:

   ```bash
   pnpm -s typecheck 2>&1 | tail -30 && pnpm -s lint 2>&1 | tail -30 && pnpm -s test 2>&1 | grep -E '^# (tests|pass|fail)|not ok|Error' | head -40
   ```

2. Integration tests (demo feed, ~slower): run only when the change touches `src/features/`
   or `scripts/`:

   ```bash
   pnpm -s test:integration 2>&1 | grep -E '^# (tests|pass|fail)|not ok|Error' | head -40
   ```

3. `pnpm build` only when the change touches routing, `next.config.ts`, layouts or the proxy.
   Pipe through `tail -40`.

4. Formatting: `pnpm -s format:check 2>&1 | tail -20`; fix with `pnpm exec prettier --write <files>`
   on the changed files only.

On a failure, open only the failing test or file at the reported line; do not rerun the
whole suite to read more output.
