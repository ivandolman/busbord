# Next.js Project Setup

Only for scaffolding a project or fixing its tooling; day-to-day rules are in `CONVENTIONS.md`.

## Prettier

`.prettierrc` (copy verbatim):

```json
{
    "semi": false,
    "singleQuote": false,
    "tabWidth": 4,
    "trailingComma": "all",
    "endOfLine": "lf",
    "printWidth": 100,
    "plugins": ["@ianvs/prettier-plugin-sort-imports", "prettier-plugin-tailwindcss"],
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

```bash
pnpm add -D prettier @ianvs/prettier-plugin-sort-imports prettier-plugin-tailwindcss eslint-config-prettier
```

## ESLint

Flat config with `eslint-config-next` (core-web-vitals + typescript) and
`eslint-config-prettier` last. Ignore generated output (`lib/generated/**`, `.next/**`).

## Tests

```json
"test": "node --experimental-test-module-mocks --import tsx --test **/*.tests.ts"
```

## CLAUDE.md

Add: `Follow ./CONVENTIONS.md for all code style, structure and naming.`
