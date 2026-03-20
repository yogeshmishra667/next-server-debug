# Changelog

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
