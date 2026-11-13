# Bestemmingsbord: working notes for agents

- **Code map:** read `docs/ARCHITECTURE.md` first to find files; do not scan the repo or read
  `README.md` whole (it is long; grep its "How it works" section for behaviour details).
- **Keep the map current:** when a commit adds, removes, moves or renames a file, an API route,
  an env var or a data file, update `docs/ARCHITECTURE.md` in the same commit.
- **Read narrowly:** grep for the symbol, then read only the lines you need. Big files
  (`board.service.ts`, `router.ts`, `importer.ts`, `corridors.ts`) are 500+ lines.
- **Never read** `data/` (SQLite and binary files), `.next/`, `dist/`, `pnpm-lock.yaml`.
- **Checks:** use the `verify` skill instead of running each command by hand.
