---
name: add-api-route
description: Add or change an API endpoint in bestemmingsbord following the repo's layering (route → service → repository) with Zod on both ends. Use when creating a new /api/* route or adding parameters to an existing one.
---

# Add or change an API route

Model files (read one, not all): `src/app/api/departures/route.ts` (GET with query),
`src/app/api/routes/route.ts` (GET/POST/DELETE), `src/app/api/settings/route.ts` (PUT body).

1. **Query/body schema** in the feature's `*.schema.ts` (`features/board/board.schema.ts`,
   `features/network/network.schema.ts`, `features/user-data/user-data.schema.ts`). Reuse
   `lib/schemas.ts` (`PlaceIdSchema`, `AreaIdSchema`, flag schemas). Derive input types with
   `z.infer`.
2. **Service method** on the feature's factory (`createBoardService`, `createNetworkService`,
   `createUserDataService`). Dependencies are injected through the factory arguments so tests can
   pass fakes; pure logic goes in its own file, SQL only in `board.repository.ts`.
3. **Route** `src/app/api/<name>/route.ts`: description comment on line 1, `runtime = "nodejs"`,
   `dynamic = "force-dynamic"`, `parseQuery(Schema, searchParams, "<Dutch error>")`, call the
   service, wrap in `try { … } catch (error) { return handleRouteError(error) }`. User-visible
   error text is Dutch; everything else English.
4. **Client side:** response schema in `src/app/_components/network-map/network-map.schema.ts`
   (or next to the hook), fetched with `fetchParsed`. Hooks live in `src/hooks/` or next to the
   map component as `use-*.ts`.
5. **Auth:** `src/proxy.ts` guards every route; public paths are listed in `isPublicPath`
   (`src/lib/auth.ts`). Add a route there only when it must work without a login.
6. **Tests** for new schema/service logic as `<file>.tests.ts` next to the source.
7. **Docs:** add the route to the API table in `docs/ARCHITECTURE.md`.
8. Run the `verify` skill.
