# Git Commit Instructions

Generate a commit message for the staged changes, following Conventional Commits 1.0.0.

Output ONLY the raw commit message. No code fences, no quotes, no emoji, no explanation before or after it.

## Format

```
<type>(<scope>): <description>

<body>

<footer>
```

- The header line is required. Scope, body and footer are optional.
- Separate header, body and footer with exactly one blank line.

## Types

Use exactly one of these types:

| Type       | Use when the change...                                                                     |
|------------|--------------------------------------------------------------------------------------------|
| `feat`     | adds new functionality for users or a new capability to an API                             |
| `fix`      | corrects wrong or unexpected behaviour (a bug)                                             |
| `perf`     | makes something faster or lighter without changing behaviour                               |
| `refactor` | restructures code without changing behaviour and without fixing a bug                      |
| `test`     | only adds, fixes or improves tests                                                         |
| `docs`     | only changes documentation (readme, markdown files, doc comments)                          |
| `build`    | changes dependencies, lockfiles, bundler or build config, dockerfiles                      |
| `ci`       | changes ci/cd configuration (e.g. `.github/workflows`)                                     |
| `style`    | only changes formatting (whitespace, prettier, lint auto-fixes); NOT css or ui changes     |
| `chore`    | is maintenance that fits nowhere else (remove unused code, `.gitignore`, tooling config)   |
| `revert`   | reverts a previous commit                                                                  |

### Choosing the type

1. Pick the type that describes the primary intent of the change.
2. Tests and docs that accompany a code change do not change its type (a feature with tests is `feat`).
3. If two types still fit equally, use the first one in this order:
   `feat` > `fix` > `perf` > `refactor` > `test` > `docs` > `build` > `ci` > `style` > `chore`.
4. Ui or css changes are `feat` (new) or `fix` (corrected), never `style`.

## Scope

- Add a scope when the change is limited to one clear area: the module, feature or top-level folder.
- Use a short lowercase noun, kebab-case if needed (e.g. `auth`, `api`, `ui`, `db`, `signature-generator`).
- Use `deps` for dependency updates and `release` for version bumps.
- Omit the scope when the change spans several unrelated areas.

## Description

- Lowercase, imperative mood: "add", "fix", "remove", not "added", "adds" or "adding".
- The full header (type + scope + description) is at most 72 characters.
- Do not end with a period.
- Describe what changes and why it matters, not which files were touched:
  "add password reset flow", not "update auth.ts".
- Never use vague descriptions such as "update code", "changes", "misc", "wip" or "fix bug".
- Do not repeat the type in the description ("fix: fix login" becomes "fix(auth): prevent login with expired token").

## Body

Add a body only when it adds information the header cannot hold:

- the diff contains more than one notable change,
- the reason for the change is not obvious from the header,
- migration or upgrade steps are needed.

Body rules:

- Lowercase, wrapped at 72 characters.
- Explain why, not a line-by-line repeat of the diff.
- Use `- ` bullets when listing multiple changes.
- If the diff mixes unrelated changes, use the dominant type in the header and list the other changes in the body.

## Breaking changes

- Append `!` after the type or scope: `feat(api)!:` or `refactor!:`.
- Always add a footer that starts with `BREAKING CHANGE: ` and explains what consumers must change.

## Footer

- Use footers only for breaking changes and issue references.
- Issue references: `Closes #123` (closes the issue on merge) or `Refs #123` (mentions it only).
- Only add an issue reference when the issue number is explicitly known, for example from a branch name such as `feat/123-password-reset`. Never invent or guess issue numbers.

## Casing exceptions

Everything is lowercase, except:

- the `BREAKING CHANGE:` footer token, which must be uppercase,
- code identifiers, file names, paths and environment variables, which keep their exact casing (e.g. `DATABASE_URL`, `UserService`, `README.md`).

## Security

- Never copy secrets, tokens, passwords, api keys, connection strings, internal hostnames or personal data from the diff into the message.
- For security fixes, describe what was fixed, not how it could be exploited.

## Examples

```
feat(auth): add jwt authentication for /abc
```

```
fix(db): correct typo in env variable for db connection
```

```
perf(keys): cache deterministic hash to speed up key lookup
```

```
refactor: move encryption logic to pkg/encryption
```

```
test(keys): add integration tests for key retrieval routes
```

```
docs: update readme to incorporate new sdk
```

```
build(deps): bump next from 15.5 to 16.0
```

```
ci: run type-check before tests in pull request workflow
```

```
chore: remove unused helper functions in internal/utils
```

```
fix(auth): reject login attempts with expired reset tokens

tokens were only validated on creation, so an expired token could
still be used to set a new password.

Closes #123
```

```
refactor(api)!: rename /api/keys to /v1/keys for versioning

BREAKING CHANGE: clients must update all api endpoint references
from /api/keys to /v1/keys
```

```
revert: feat(auth): add jwt authentication for /abc

Refs: 4f2a9c1
```

## Wrong vs right

| Wrong                                  | Right                                                   |
|----------------------------------------|---------------------------------------------------------|
| `Fixed the login bug.`                 | `fix(auth): prevent login with expired session`        |
| `feat: Added new button`               | `feat(ui): add export button to logbook overview`      |
| `update files`                         | `chore: remove unused mock data from tests/fixtures`   |
| `style: change button color to blue`   | `fix(ui): use brand color for primary buttons`         |
| `fix: fix`                             | `fix(api): return 404 instead of 500 for unknown ids`  |
