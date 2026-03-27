// Server-only exports — do NOT import in "use client" files
export type {
  CacheStatus,
  DebugLevel,
  DebugEntry,
  DebugSnapshot,
  DebugPanelProps,
  Debugger,
  DebugSpanNode,
  DebugViewMode,
  PerformanceThresholds,
  DebugConfig,
} from "./types";

export {
  dbg,
  timed,
  createDebugger,
  inspectHeaders,
  inspectEnv,
  inspectSearchParams,
  inspectCache,
  debugRedirect,
  safeSerialize,
  normalizeForBoundary,
} from "./debug.server";

export {
  debugStore,
  debug,
  debugTimed,
  buildSpanTree,
} from "./store";

export {
  instrumentFetch,
  withDebug,
  withDebugMiddleware,
  withRouteDebug,
} from "./instrumentation";
