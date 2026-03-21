# Changelog

## 0.4.0

- Resizable panel — drag the grip handle at the bottom-right corner to resize width (320–900px) and height (120–700px)
- Panel size persists across hot reloads via `sessionStorage`

## 0.3.0

- **Cache Inspector** — `inspectCache()` wraps `fetch()` and shows colored HIT/MISS/STALE/REVALIDATE/SKIP pills in the panel
- **Prisma plugin** — `next-server-debug/prisma` subpath; `withDebugLogging()` and `createPrismaDebugExtension()` for auto-logging queries with timing
- **Drizzle plugin** — `next-server-debug/drizzle` subpath; `DebugLogger` class and `createDrizzleDebugLogger()` for auto-logging SQL queries
- **Redirect Interceptor** — `debugRedirect()` logs a warn-level entry before calling Next.js `redirect()`
- **Editor deep links** — source filenames in the panel are clickable links that open the file in VS Code, Cursor, or WebStorm via `editorScheme` and `projectRoot` props

## 0.2.0

- Fixed `"use client"` banner being stripped by rollup (treeshake disabled on client bundle)
- Updated author and repository URL in `package.json`
- Added vitest test suite (34 tests)

## 0.1.0 — Initial release

- `DebugPanel` floating panel component with dark/light/auto themes
- `DebugProvider` and `useDebug()` hook for client-side entry accumulation
- Server utilities: `dbg`, `timed`, `createDebugger`, `inspectHeaders`, `inspectEnv`, `inspectSearchParams`
- Serialization utilities: `safeSerialize`, `normalizeForBoundary`
- Syntax-highlighted JSON renderer
- Drag-to-reposition with edge snapping
- Keyboard shortcuts (Ctrl+Shift+D, Ctrl+K, Escape)
- Production guard — returns `null` when `NODE_ENV === 'production'`
- Zero runtime dependencies
