# Next.js Project Conventions

Canonical coding conventions for Next.js projects. Claude MUST follow this document when
creating or modifying files in this project.

**Version:** 1.2 — 2026-11-12

---

## 0. How to use this document

- **Per project:** copy this file to the repo root as `CONVENTIONS.md` and add one line to
  `CLAUDE.md` / `AGENTS.md`: `Follow ./CONVENTIONS.md for all code style, structure and naming.`
- **Precedence:** project `CONVENTIONS.md` > this global copy. A project may delete or rewrite
  any section; a deleted section means "no rule", not "do the opposite".
- **Existing projects:** apply these rules to *new and touched* files only. Never mass-refactor
  an existing codebase to match this document unless explicitly asked.
- **Conflicts with reality:** if the surrounding code consistently does something else, follow
  the surrounding code and tell the user about the mismatch in one sentence.
- **Updating:** edit the canonical file, bump the version line, and note the change under
  §16 Changelog.

Every rule marked **[optional]** describes a stack choice that a project may drop. Rules without
that marker are structural and apply to every Next.js project.

---

## 1. Language

**All code and code-adjacent text is written in English.** The only exception is literal copy
that a visitor reads on the rendered page.

English (always):
- Identifiers: variables, functions, components, types, props, CSS custom properties
- File names, folder names, route segment *code* identifiers
- Comments, JSDoc, `../README.md`, `CLAUDE.md`, `docs/**`, commit messages, PR descriptions
- Test names, error messages thrown for developers, log output
- Schema field names, database columns, API/query params

Localized (project language, e.g. Dutch):
- JSX text nodes and rendered strings
- Validation messages and toasts shown to the user
- Content data files (`lib/pages/**/*.items.ts`), navigation labels, SEO metadata
- Public URL slugs (`/over-ons`, `/werken-bij`) and `<html lang>`

Rule of thumb: if a translator would need to touch it, it is localized; otherwise it is English.

---

## 2. Tech stack defaults

| Concern | Default |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript, `strict: true` |
| Package manager | pnpm |
| Styling | Tailwind CSS 4 + CSS custom properties (no `tailwind.config.ts`) |
| UI primitives | **Radix UI** (`@radix-ui/react-*`) directly — **never Shadcn/ui** [optional] |
| Variants | class-variance-authority (CVA) [optional] |
| Class merging | `clsx` + `tailwind-merge` via `cn()` in `../lib/utils.ts` |
| Icons | lucide-react [optional] |
| Validation | Zod (v4) |
| Forms | react-hook-form + `@hookform/resolvers` [optional] |
| Server actions | next-safe-action [optional] |
| Database | Prisma (driver adapters) [optional] |
| Auth | next-auth v5 [optional] |
| Toasts | sonner [optional] |
| Formatting | Prettier (see §13) |
| Linting | ESLint flat config + `eslint-config-next` + `eslint-config-prettier` |

Do not introduce a new dependency for something the stack above already covers. Ask before
adding any dependency that is not in this table.

---

## 3. Directory structure

```
app/                      # Routing only — thin files, no business logic
  (site)/                 # Route groups for shared layouts
  admin/
    _components/          # Route-scoped components (colocation, underscore-prefixed)
  api/<route>/route.ts
  layout.tsx
  page.tsx

components/
  ui/                     # Generic, app-agnostic primitives (button, input, dialog)
  layout/                 # Structural wrappers (container, box, grid, section)
  app/                    # App-wide shell (header, footer, hero, nav)
  <domain>/               # Domain display components (article/, contact/, product/)

features/<name>/          # One folder per business capability — see §7
lib/                      # Framework-agnostic infrastructure and helpers
  <domain>/               # Grouped helpers (seo/, uploads/, nav/, utils/)
  utils.ts                # cn() and generic helpers
hooks/                    # Shared React hooks (use-*.ts)
styles/
  globals.css             # Tailwind import + @theme entry point
  theme/*.css             # colors.css, typography.css, spacing.css, effects.css
types/                    # Ambient declarations only (*.d.ts)
public/
docs/                     # Long-form documentation
```

Placement rules:

1. **`../app` holds routing, not logic.** A `page.tsx` may fetch data, resolve params, build
   metadata and compose components. Anything else moves to `../features` or `components/`.
2. **Used by one route → `app/<route>/_components/`.** Used by two or more routes → `../components`.
3. **Reusable in any project → `../components/ui`.** If it mentions a domain noun, it does not
   belong in `ui/`.
4. **Business logic → `../features`.** Never in a component, never in a route file.
5. **No domain knowledge in `../lib`.** `../lib` is infrastructure: clients, formatters, config,
   pure helpers. If it queries your models, it is a feature service.
6. **No barrel files** (`index.ts` re-exports). Import from the concrete file path.
7. Import via the `@/` alias for anything outside the current folder; relative imports only for
   siblings inside the same feature/route folder.

---

## 4. File naming

- Files and folders: **kebab-case** — `article-preview.tsx`, `use-mobile.ts`, `keyword.schema.ts`.
- Suffix carries the role, dot-separated: `<name>.schema.ts`, `<name>.service.ts`,
  `<name>.action.ts`, `<name>.repository.ts`, `<name>.items.ts`, `<name>.constants.ts`,
  `<name>.tests.ts`.
- One primary export per file; the file name matches that export in kebab-case
  (`ArticlePreview` → `article-preview.tsx`).
- React components: `.tsx`. Everything else: `.ts`.
- Next.js special files keep their framework names (`page.tsx`, `layout.tsx`, `route.ts`,
  `loading.tsx`, `error.tsx`, `not-found.tsx`, `opengraph-image.tsx`).
- Route segments use localized, lowercase, hyphenated slugs; dynamic segments are English
  (`[variant]`, `[keyword]`, `[id]`).
- Hooks start with `use-`. Types/interfaces are PascalCase; the props interface of `Foo` is
  `FooProps`. Constants are `SCREAMING_SNAKE_CASE`. Zod schemas are `PascalCaseSchema` (or
  `camelCaseSchema` if the project already does that — be consistent within a project).

---

## 5. File anatomy

Every component/module file follows this fixed order, with `// --- NAME ---` separators
(double dash, uppercase). Omit sections that do not apply — never leave an empty section.

```tsx
// Short one-line description of what this file provides

"use client" // only when needed; after the description, before the imports

import { useState } from "react"
import Link from "next/link"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// --- STYLING ---

const cardVariants = cva("…", { … })

// --- INTERFACES ---

interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {
    title: string
}

// --- METADATA ---        // route files only: generateMetadata / export const metadata

// --- COMPONENT ---

export function Card({ title, className, ...props }: CardProps) { … }
```

Section order: description → `"use client"` → imports → `CONSTANTS` → `STYLING` →
`INTERFACES` → `METADATA` → `COMPONENT` (or `SERVICE` / `ACTIONS` / `HELPERS` for non-UI files).

Comment policy: **no comments that restate the code.** Write a comment only when the *why* is
non-obvious (a workaround, a spec quirk, a deliberate deviation). The one-line file description
at the top is always present.

---

## 6. Components

### Exports
- `components/ui/**` and `components/layout/**`: **named exports** (`export function Button`).
- Domain, app-shell and route-scoped components: **default export**, named after the file.
- Next.js special files: default export as the framework requires.

### Composition rules
- A component does one thing: render. Fetching, mutating, sorting and formatting live in
  `../features` or `lib/`.
- Split a component when it (a) exceeds ~150 lines, (b) mixes two responsibilities, or
  (c) has a part that is reused. Prefer composition (`children`, slots) over boolean prop soup.
- More than ~6 props, or two booleans that are never both true, is a signal to split or to
  replace booleans with a single `variant` union.
- Props are data in, callbacks out. A presentational component never imports a service or action.
- Prefer `React.ComponentProps<"element">` + `...props` spread over hand-listing DOM props, and
  always merge `className` through `cn()` so callers can override.
- Use Radix primitives for anything interactive (dialog, accordion, menu, tooltip, popover).
  Do not hand-roll focus traps, escape handling or ARIA wiring. [optional]
- Use `asChild` + `@radix-ui/react-slot` instead of duplicating a component as a link. [optional]

### Variants
- All conditional styling goes through CVA, never inline ternaries on class strings.
- Variant names describe intent (`variant="destructive"`, `size="lg"`), not appearance
  (`variant="red"`).
- Always declare `defaultVariants`.

---

## 7. Feature modules

```
features/<name>/
  <name>.schema.ts       # Zod schemas + inferred input/output types
  <name>.service.ts      # Business logic + data access
  <name>.action.ts       # "use server" server actions
  <name>.repository.ts   # [optional] raw data access when the service grows too big
  <name>.schema.tests.ts
  <name>.service.tests.ts
  <name>.action.tests.ts
```

**Layering (strict, one direction):**

```
component → action → service → (repository) → ORM/client
```

- A component never imports a service or the ORM.
- An action never touches the ORM directly; it validates input, calls exactly one service
  operation, and handles revalidation/redirects.
- A service never imports React, `next/navigation`, `next/cache`, or reads cookies/headers.
  Services are pure application logic and must be testable in plain Node.
- Cross-feature calls go feature → feature *service*, never feature → feature action.
- One feature = one business capability, not one database table.

**Services are factories with injected dependencies**, so tests can pass fakes:

```ts
export const createNewsService = (prisma = prismaDefault, deleteImages = deleteImagesDefault) => ({
    async getAll() { … },
    async create(data: NewsInput, userId: string) { … },
})

export const newsService = createNewsService()
```

**Actions** validate at the boundary and stay thin:

```ts
"use server"

export const createNewsAction = authActionClient
    .inputSchema(NewsSchema)
    .action(async ({ clientInput, ctx }) => {
        await newsService.create(clientInput, ctx.userId)
        revalidatePath("/nieuws")
    })
```

---

## 8. Server and client components

- **Server component by default.** Add `"use client"` only for state, effects, refs, browser
  APIs, or event handlers.
- Push `"use client"` to the leaves: keep pages and layouts as server components and mark the
  small interactive part, not its container.
- Fetch data in server components; do not fetch in a `useEffect` when a server component can do it.
- Server components pass plain serializable data to client components. Never pass a function,
  class instance, `Date`-heavy graph or ORM model with methods across the boundary — map to a
  plain shape first.
- Mutations go through server actions, not route handlers. Use `app/api/**/route.ts` only for
  webhooks, uploads, file serving and third-party callbacks.
- `revalidatePath` / `revalidateTag` belongs in the action, never in the service.
- Any route that reads the database or request-time data and must not be prerendered declares
  `export const dynamic = "force-dynamic"`.
- Secrets are read in server code only. Anything named `NEXT_PUBLIC_*` is public — treat it as
  such and never put a key behind that prefix.

---

## 9. Validation and types

- **TypeScript strict. No `any`** (`unknown` + a narrow, or a Zod parse). No non-null `!`
  assertions on values that can genuinely be null — handle the null.
- Zod validates every boundary: server action input, route handler bodies, `searchParams`,
  route `params`, environment variables and third-party responses.
- Derive types from schemas (`type NewsInput = z.infer<typeof NewsSchema>`), never maintain
  a parallel hand-written interface.
- Zod is also welcome outside boundaries when it makes code cleaner (parsing config objects,
  narrowing unions, validating content data files).
- Shared schemas (`IdSchema`, `ImageSchema`, `SlugSchema`) live in `../lib/schemas.ts`.
- Prefer union literals over `enum`. Prefer `type` for unions/aliases and `interface` for
  object shapes that components extend.

---

## 10. Styling

- **Tailwind CSS 4, no `tailwind.config.ts`.** Configuration lives in `../styles/globals.css` and
  the `styles/theme/*.css` files it imports, each with its own `@theme {}` block:
  `colors.css`, `typography.css`, `spacing.css`, `effects.css`. Keep one concern per file.
- Colors are CSS custom properties defined in `:root`. Reference design tokens
  (`bg-primary`, `text-text-light-bg`), never raw hex values in components.
- To re-theme a subtree, override the **theme variable Tailwind reads** (`--color-primary`),
  not the raw variable it points at.
- **Never override `--spacing-<n>` or `--radius-<name>` in `@theme`** — that silently redefines
  standard utilities like `p-5` and mixes two spacing grids. Use the default Tailwind scale.
- Custom spacing tokens are additive and descriptively named
  (`--spacing-side-padding` → `px-side-padding`).
- Always compose classes with `cn()`. No string concatenation of class names, no
  `class={cond ? "a" : "b"}` for anything CVA can express.
- **No `@apply`** for color or layout utilities. Utilities go in the markup; CVA holds the variants.
- Mobile-first: unprefixed styles are the small screen; add `sm:`/`md:`/`lg:` upward.
- Long class strings in CVA are split across lines with string concatenation, sorted by the
  Tailwind Prettier plugin — do not hand-sort.

---

## 11. Accessibility and SEO

Accessibility:
- Semantic elements first: `<button>` for actions, `<a>`/`<Link>` for navigation, `<nav>`,
  `<main>`, `<section>`, `<header>`, `<footer>`.
- One `<h1>` per page; heading levels never skip. Styling comes from classes, not from picking
  a bigger tag.
- Every `<Image>` has `alt`. Decorative images use `alt=""`. Icon-only buttons carry
  `aria-label` (localized).
- Interactive elements are keyboard reachable with a visible `focus-visible` ring; never
  `outline: none` without a replacement.
- Form fields have a real `<label>` (or Radix `Label`) tied to the input; errors are announced
  via `aria-invalid` + `aria-describedby`.
- Respect `prefers-reduced-motion` for non-essential animation.

SEO:
- `<html lang>` is the site's content language.
- Every public route exports `metadata` or `generateMetadata` built through a shared helper in
  `../lib/seo` — title, description, canonical, Open Graph. Never hand-assemble metadata objects
  in a page.
- One canonical URL per page; variant/duplicate routes set `noindex` or a canonical to the
  primary one.
- Add JSON-LD structured data via a shared `<JsonLd>` component where it applies
  (Organization, Article, BreadcrumbList).
- `../app/sitemap.ts` and `app/robots.ts` exist for public sites. Data-driven ones declare
  `dynamic = "force-dynamic"`.
- Use `next/image` with explicit `sizes`, and `next/font` — no raw `<img>` or webfont `<link>`.
- Admin, auth and preview routes are `noindex`.

---

## 12. Tests

- Runner: Node's built-in test runner. Test files sit **next to the source**:
  `<name>.tests.ts`.
  ```json
  "test": "node --experimental-test-module-mocks --import tsx --test **/*.tests.ts"
  ```
- Import `assert` from `node:assert` and `describe/it/mock` from `node:test`.
- What is tested, in priority order:
  1. **Schemas** — valid input passes, each invalid case is rejected.
  2. **Services** — business rules, with dependencies injected as fakes (`createXService(fake)`).
  3. **Actions** — auth is enforced, input is validated, the right service call is made.
- Do not test framework behaviour, presentational components or generated code.
- One behaviour per `it`; the name states the expectation
  (`it("create should reject an empty title")`).
- Tests never touch a real database, network or file system — inject a fake instead. A test that
  needs a running server is an integration test and lives outside the unit test script.
- New feature logic ships with tests in the same commit. A bug fix adds the test that reproduces it.

---

## 13. Formatting and linting

`../.prettierrc` (copy verbatim):

```json
{
    "semi": false,
    "singleQuote": false,
    "tabWidth": 4,
    "trailingComma": "all",
    "endOfLine": "lf",
    "printWidth": 100,
    "plugins": [
        "@ianvs/prettier-plugin-sort-imports",
        "prettier-plugin-tailwindcss"
    ],
    "tailwindFunctions": ["cva", "cx", "cn", "clsx"],
    "importOrderTypeScriptVersion": "5.0.0",
    "importOrder": [
        "^(react|react-dom)(.*)$",
        "^(next)(.*)$",
        "",
        "<THIRD_PARTY_MODULES>",
        "",
        "^@/(.*)$",
        "",
        "^[./]"
    ]
}
```

Install:

```bash
pnpm add -D prettier @ianvs/prettier-plugin-sort-imports prettier-plugin-tailwindcss eslint-config-prettier
```

Consequences Claude must honour while writing code:
- No semicolons, double quotes, 4-space indent, trailing commas everywhere, max 100 columns.
- Import groups in this order, separated by one blank line: react/react-dom → next → third
  party → `@/` → relative. Never hand-sort Tailwind classes; the plugin does it.
- ESLint uses the flat config with `eslint-config-next` (core-web-vitals + typescript) and
  `eslint-config-prettier` **last**, so lint never fights the formatter.
- Generated output (`lib/generated/**`, `.next/**`) is ignored by lint and never edited by hand.
- Formatting is not a separate commit: leave a file formatted the way you found it plus your change.

---

## 14. Commits and branches

**Conventional Commits, English, imperative, lowercase, no trailing period.**

```
<type>(<scope>): <what changes>
```

- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `perf`, `build`, `ci`.
- Scope is the touched unit in kebab-case: the component, feature, route or config file
  (`feat(contact-form): …`, `refactor(nav): …`, `chore(deps): …`). Omit the scope only for
  genuinely cross-cutting changes.
- Subject ≤ 72 characters, describes the change, not the file
  (`feat(back-button): add generic back button component for navigation`).
- Body (optional, blank line first) explains *why*, wrapped at 72 columns. Footer carries
  `BREAKING CHANGE:` and issue refs.
- One logical change per commit. Never mix a refactor with a feature, or formatting with logic.
- **Commit per step.** In work with several steps, Claude commits each finished step on its own,
  without asking, once typecheck, lint and tests pass. Never leave a multi-step task as one big
  uncommitted change.
- **Moves and renames get their own commit**, before any content change to those files, so git
  keeps file history and blame intact.
- **Never push without an explicit go**, every time. Pushing `main` deploys.

Branches are the user's call. Claude never creates, switches or deletes a branch on its own, and
never asks to; work happens on whatever branch is currently checked out, `main` included. When the
user does create one, the naming is `<type>/<short-kebab-description>` (`feat/share-pages`,
`fix/upload-mime-check`).

---

## 15. Definition of done

Before reporting a task complete, verify:

- [ ] Files are in the right folder per §3 and named per §4
- [ ] File anatomy, section separators and the description line are in place (§5)
- [ ] Everything except user-visible copy is in English (§1)
- [ ] Layering respected: component → action → service → data (§7)
- [ ] `"use client"` only where required, pushed to the leaves (§8)
- [ ] Boundaries validated with Zod, no `any` (§9)
- [ ] Styling via tokens, `cn()` and CVA; default spacing scale untouched (§10)
- [ ] Semantics, labels, alt text and metadata handled (§11)
- [ ] Tests added for new schema/service/action logic (§12)
- [ ] `pnpm lint` passes and the code matches the Prettier config (§13)
- [ ] No new dependency added without asking

---

## 16. Changelog

- **1.2 — 2026-11-12** — §14: Claude commits per finished step without asking, moves/renames in
  their own commit first, never pushes without an explicit go.
- **1.1 — 2026-09-11** — §14: Claude creates no branches; branching is the user's decision.
- **1.0 — 2026-09-08** — Initial version.
