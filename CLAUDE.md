# CLAUDE.md — next-server-debug

## Project Overview
`next-server-debug` is a production-ready npm package providing a floating debug panel for Next.js App Router. It lets developers inspect server-side data (DB results, API responses, timing, headers, env info) directly in the browser during development, with zero production cost.

**Published to npm**: https://www.npmjs.com/package/next-server-debug (v0.1.0, published 2026-03-21)

## Architecture

```
src/
  types.ts           → All shared TypeScript interfaces (DebugEntry, DebugLevel, etc.)
  debug.server.ts    → Server-side utilities (Node.js only, no React/browser APIs)
  DebugPanel.tsx     → "use client" floating panel component (inline styles, zero deps)
  DebugProvider.tsx   → "use client" context provider + useDebug() hook
  index.ts           → Client-safe exports (panel, provider, types)
  server.ts          → Server-only exports (subpath: next-server-debug/server)
tests/
  debug-server.test.ts → 34 vitest tests for server utilities
test-app/            → Next.js 16 integration test app
examples/            → 5 usage examples (basic, advanced, route-handler, server-action, with-provider)
```

## Key Design Decisions
- **Dual entry points**: `index.ts` (client, has "use client" banner) and `server.ts` (Node.js only)
- **tsup bundler**: Two separate configs in array — index gets "use client" esbuild banner, server does not. Treeshake disabled on index to prevent rollup from stripping the directive
- **Zero runtime deps**: All icons are inline SVGs, JSON renderer is custom recursive React component, all styles are inline
- **Production guard**: `DebugPanel` returns `null` when `NODE_ENV === 'production'`
- **Serialization**: `safeSerialize()` handles circular refs, `normalizeForBoundary()` converts Date/BigInt/undefined/class instances to JSON-safe values

## Build & Test Commands
```bash
pnpm build        # tsup → dist/ (CJS + ESM + DTS for both entry points)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (34 tests)
pnpm dev          # tsup --watch
```

## Package Versions (2026-latest)
- react/react-dom: 19.2.4
- next: 16.2.0
- typescript: 5.9.3
- tsup: 8.5.1
- vitest: 4.1.0
- @types/react: 19.2.14
- @types/react-dom: 19.2.3
- @types/node: 25.5.0

## Bundle Size
- Client bundle (index.mjs): ~36KB raw, ~7.6KB gzipped (target: <8KB)
- Server bundle (server.mjs): ~8.6KB raw

## CI
GitHub Actions workflow (`.github/workflows/ci.yml`): typecheck → build → test → verify dist → bundle size gate (<10KB gzipped). Runs on Node 20 + 22.

## File Relationships
- `types.ts` is imported by all other src files
- `debug.server.ts` imports only from `types.ts` and Node.js `crypto`
- `DebugPanel.tsx` imports only from `types.ts` and React
- `DebugProvider.tsx` imports from `types.ts`, React, and `DebugPanel.tsx`
- `index.ts` re-exports from `DebugPanel`, `DebugProvider`, `types`
- `server.ts` re-exports from `debug.server`, `types`

## Important Constraints
- No `any` types — use `unknown` when type is truly unknown
- All inline styles (no CSS modules, no Tailwind)
- All icons must be inline SVG paths
- `inspectEnv()` NEVER auto-exposes all env vars — requires explicit key list
- Sensitive header values (Authorization, Cookie, x-api-key) are always redacted
- Env values with "secret", "key", "password", "token" in the key name are redacted

## Test App
Located at `test-app/`. Uses `file:..` dependency to link the package. Run with:
```bash
cd test-app && pnpm dev
```
Preview available via `.claude/launch.json` config on port 3099.
