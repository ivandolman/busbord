# Next.js Project Conventions

Rules for creating or changing files in this project. Setting up a project (Prettier and
ESLint config, installs) is in `CONVENTIONS-SETUP.md`; read it only when scaffolding.

**Version:** 1.3 — 2026-11-13

## 0. Scope

- Apply to new and touched files only; never mass-refactor unless asked.
- If surrounding code consistently does otherwise, follow it and mention the mismatch in one
  sentence.
- A project may delete or rewrite a section; deleted = no rule. **[optional]** marks a stack
  choice a project may drop.

## 1. Language

English for everything except copy a visitor reads on the page: identifiers, file/folder names,
comments, docs, commits, PRs, test names, developer errors, logs, schema fields, DB columns,
query params. Localized (e.g. Dutch): JSX text, user-facing validation messages and toasts,
content data files, nav labels, SEO metadata, public URL slugs, `<html lang>`. Rule of thumb:
would a translator touch it?

## 2. Stack

Next.js App Router · TypeScript strict · pnpm · Tailwind 4 with CSS variables, no
`tailwind.config.ts` · `cn()` (`clsx` + `tailwind-merge`) in `lib/utils.ts` · Zod 4 · Prettier ·
ESLint flat config. [optional]: Radix UI directly (never Shadcn/ui), CVA, lucide-react,
react-hook-form, next-safe-action, Prisma, next-auth v5, sonner. Ask before adding any other
dependency.

## 3. Directory structure

```
app/            routing only; route-scoped components in app/<route>/_components/
components/ui/  generic primitives (no domain nouns)    components/layout/  structural wrappers
components/app/ app shell                               components/<domain>/ domain display
features/<name>/ business capabilities (§7)             lib/   infrastructure, no domain logic
hooks/          shared use-*.ts                         styles/globals.css + styles/theme/*.css
types/          *.d.ts only                             docs/  long-form docs
```

- A `page.tsx` only fetches, resolves params, builds metadata and composes.
- Used by one route → `_components/`; by two or more → `components/`.
- Business logic → `features/`, never in components or route files. If `lib/` code queries
  models, it is a feature service.
- No barrel files. `@/` imports outside the current folder; relative only within it.

## 4. Naming

- kebab-case files and folders. Role suffixes: `.schema.ts`, `.service.ts`, `.action.ts`,
  `.repository.ts`, `.items.ts`, `.constants.ts`, `.tests.ts`.
- One primary export per file; file name = that export in kebab-case. Components `.tsx`, the
  rest `.ts`. Next special files keep their names.
- Route slugs localized and hyphenated; dynamic segments English (`[id]`).
- Hooks `use-*`; types PascalCase; props of `Foo` = `FooProps`; constants
  `SCREAMING_SNAKE_CASE`; schemas `PascalCaseSchema` (or the project's existing style).

## 5. File anatomy

Order: one-line description comment → `"use client"` (if needed) → imports → sections with
`// --- NAME ---` separators: `CONSTANTS`, `STYLING`, `INTERFACES`, `METADATA` (route files),
then `COMPONENT` (or `SERVICE` / `ACTIONS` / `HELPERS`). Omit empty sections. Comments only for
a non-obvious *why*; the description line is always there.

## 6. Components

- Named exports in `components/ui` and `components/layout`; default export (named after the
  file) for domain, shell and route-scoped components.
- Components only render; no fetching, mutating, sorting or formatting. Presentational
  components never import a service or action. Props: data in, callbacks out.
- Split at ~150 lines, two responsibilities or a reused part. >6 props or mutually exclusive
  booleans → split or use one `variant` union. Prefer composition (`children`, slots).
- Extend `React.ComponentProps<"el">`, spread `...props`, merge `className` via `cn()`.
- [optional] Radix for interactive widgets (no hand-rolled focus traps/ARIA); `asChild` instead
  of duplicating as a link.
- Conditional styling via CVA with intent names (`destructive`, not `red`) and
  `defaultVariants`.

## 7. Feature modules

`features/<name>/`: `<name>.schema.ts` (Zod + inferred types), `.service.ts` (logic + data
access), `.action.ts` (`"use server"`), optional `.repository.ts`, tests per file.

Layering, one direction: **component → action → service → (repository) → ORM/client.**

- Components never import a service or ORM. Actions validate, call one service operation, and
  revalidate/redirect; never the ORM.
- Services never import React, `next/navigation`, `next/cache`, cookies or headers; they run in
  plain Node.
- Cross-feature: service → service only. One feature = one capability, not one table.
- Services are factories with injected dependencies plus a default instance:
  `export const createXService = (db = dbDefault) => ({ … })`; `export const xService = createXService()`.

## 8. Server and client

- Server components by default; `"use client"` only for state, effects, refs, browser APIs or
  handlers, pushed to the leaves.
- Fetch in server components, not `useEffect`, when possible. Pass plain serializable data
  across the boundary.
- Mutations via server actions; `app/api/**/route.ts` only for webhooks, uploads, file serving
  and third-party callbacks. `revalidate*` in actions, not services.
- Request-time routes declare `export const dynamic = "force-dynamic"`.
- Secrets server-side only; `NEXT_PUBLIC_*` is public.

## 9. Validation and types

- No `any` (use `unknown` + narrowing or Zod). No `!` on values that can be null.
- Zod at every boundary: action input, route bodies, `searchParams`, `params`, env vars,
  third-party responses. Types via `z.infer`, no parallel interfaces. Shared schemas in
  `lib/schemas.ts`.
- Union literals over `enum`; `type` for unions, `interface` for extended object shapes.

## 10. Styling

- Theme in `styles/globals.css` + `styles/theme/{colors,typography,spacing,effects}.css`, each
  with its own `@theme {}`.
- Design tokens only (`bg-primary`), no raw hex. Re-theme a subtree by overriding the theme
  variable Tailwind reads (`--color-primary`).
- Never override `--spacing-<n>` or `--radius-<name>`; custom spacing tokens are additive and
  descriptive (`--spacing-side-padding`).
- Classes via `cn()` and CVA; no string concatenation, no `@apply` for colour/layout. Mobile
  first. Never hand-sort classes.

## 11. Accessibility and SEO

- Semantic elements (`button` for actions, `Link` for navigation, landmarks). One `h1`; no
  skipped levels.
- `alt` on every image (`""` if decorative); localized `aria-label` on icon-only buttons; visible
  `focus-visible`; real labels tied to inputs, errors via `aria-invalid` + `aria-describedby`;
  respect `prefers-reduced-motion`.
- Public routes export metadata through the shared helper in `lib/seo` (title, description,
  canonical, OG). One canonical per page; admin/auth/preview/duplicates `noindex`. JSON-LD via a
  shared `<JsonLd>` where it applies. Public sites have `app/sitemap.ts` and `app/robots.ts`.
- `next/image` with `sizes`, `next/font`; no raw `<img>` or webfont `<link>`.

## 12. Tests

- `node:test` + `node:assert`, files `<name>.tests.ts` next to the source.
- Priority: schemas (valid passes, each invalid case fails) → services (fakes injected via the
  factory) → actions (auth, validation, right service call). Not framework behaviour,
  presentational components or generated code.
- One behaviour per `it`, named as the expectation. Unit tests never touch a real DB, network or
  file system; integration tests live outside the unit script.
- New logic ships with tests in the same commit; a bug fix adds the reproducing test.

## 13. Formatting

Prettier enforces it: no semicolons, double quotes, 4 spaces, trailing commas, 100 columns,
imports grouped react → next → third party → `@/` → relative. ESLint ends with
`eslint-config-prettier`. Never edit generated output (`.next/`, `lib/generated/`). Keep a file's
existing formatting plus your change; no separate formatting commits.

## 14. Commits and branches

- Conventional Commits, English, imperative, lowercase, no period:
  `<type>(<scope>): <what changes>`. Types: feat, fix, refactor, chore, docs, style, test, perf,
  build, ci. Scope = touched unit in kebab-case; omit only when cross-cutting. Subject ≤ 72
  chars; optional body explains why (wrap 72); footer `BREAKING CHANGE:` and refs.
- One logical change per commit. Commit each finished step without asking once typecheck, lint
  and tests pass. Moves/renames in their own commit first.
- **Never push without an explicit go, every time.** Pushing `main` deploys.
- Never create, switch or delete branches, and don't ask; the user's branch names are
  `<type>/<short-kebab-description>`.

## 15. Definition of done

Right folder and name (§3–4) · anatomy and description line (§5) · English except UI copy (§1) ·
layering (§7) · minimal `"use client"` (§8) · Zod at boundaries, no `any` (§9) · tokens, `cn()`,
CVA (§10) · a11y and metadata (§11) · tests for new logic (§12) · `pnpm lint` passes (§13) · no
unasked dependency.

## 16. Changelog

- **1.3 — 2026-11-13** — Same rules, ~half the tokens: prose and examples cut, setup (Prettier
  and ESLint config, installs) moved to `CONVENTIONS-SETUP.md`.
- **1.2 — 2026-11-12** — §14: commit per finished step without asking, moves/renames first,
  never push without an explicit go.
- **1.1 — 2026-09-11** — §14: Claude creates no branches.
- **1.0 — 2026-09-08** — Initial version.
