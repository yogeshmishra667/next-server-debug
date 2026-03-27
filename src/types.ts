/**
 * Severity level for a debug entry.
 */
export type DebugLevel = "info" | "warn" | "error" | "success" | "perf";

/**
 * Cache status for fetch requests inspected via `inspectCache()`.
 */
export type CacheStatus = "HIT" | "MISS" | "STALE" | "REVALIDATE" | "SKIP";

/**
 * View mode for the debug panel display.
 */
export type DebugViewMode = "list" | "tree" | "timeline";

/**
 * A single debug entry representing a piece of server-side data
 * captured for inspection in the browser debug panel.
 */
export interface DebugEntry {
  /** Unique identifier generated via `crypto.randomUUID()`. */
  id: string;
  /** Short human-readable description of this entry. */
  label: string;
  /** The captured data — must be JSON-serializable. */
  data: unknown;
  /** Severity level controlling badge color and filtering. */
  level: DebugLevel;
  /** File path or descriptive string indicating where this entry was created. */
  source: string;
  /** ISO 8601 timestamp string (serializable across the server→client boundary). */
  timestamp: string;
  /** Duration in milliseconds if this was a timed operation. */
  durationMs?: number;
  /** Optional user-defined tags for filtering and grouping. */
  tags?: string[];
  /** Byte size of the serialized `data` field (computed automatically). */
  size?: number;
  /** Cache status when this entry was created via `inspectCache()`. */
  cacheStatus?: CacheStatus;
  /** Request ID for correlating entries within the same HTTP request. */
  requestId?: string;
  /** Trace ID for distributed tracing across service boundaries. */
  traceId?: string;
  /** Parent entry ID for building span trees (async/nested flow tracking). */
  parentId?: string;
}

/**
 * A span node used for tree-based visualization of nested operations.
 * Each node wraps a DebugEntry and has references to its children.
 */
export interface DebugSpanNode {
  /** The debug entry for this span. */
  entry: DebugEntry;
  /** Child spans nested under this span. */
  children: DebugSpanNode[];
  /** Depth level in the span tree (0 = root). */
  depth: number;
}

/**
 * Configurable thresholds for performance insight indicators.
 */
export interface PerformanceThresholds {
  /** Duration in ms above which an operation is considered slow (yellow). Default: `200`. */
  slow: number;
  /** Duration in ms above which an operation is critical (red). Default: `1000`. */
  critical: number;
  /** Duration in ms above which a fetch is considered slow. Default: `500`. */
  slowFetch: number;
  /** Duration in ms above which a DB query is considered slow. Default: `100`. */
  slowQuery: number;
}

/**
 * Global configuration for the debug system.
 */
export interface DebugConfig {
  /** Whether debug tracking is enabled. Default: `process.env.NODE_ENV !== 'production'`. */
  enabled: boolean;
  /** Performance thresholds for smart highlighting. */
  thresholds: PerformanceThresholds;
  /** Whether to auto-instrument fetch calls. Default: `true`. */
  autoInstrumentFetch: boolean;
  /** Whether to log entries to the terminal. Default: `true`. */
  terminalLogging: boolean;
  /** Maximum number of entries to retain per request. Default: `500`. */
  maxEntriesPerRequest: number;
  /** Whether to persist entries across page reloads. Default: `false`. */
  persistEntries: boolean;
}

/**
 * A named collection of debug entries captured at a single point in time.
 * Useful for "before/after" comparisons during debugging.
 */
export interface DebugSnapshot {
  /** Descriptive name for this snapshot. */
  name: string;
  /** The entries captured in this snapshot. */
  entries: DebugEntry[];
  /** ISO 8601 timestamp of when the snapshot was taken. */
  capturedAt: string;
}

/**
 * Props for the `DebugPanel` floating UI component.
 */
export interface DebugPanelProps {
  /** Array of debug entries to display. When omitted in auto mode, reads from global store. */
  entries?: DebugEntry[];
  /** Corner of the viewport where the panel appears. Default: `"bottom-right"`. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Whether the panel starts in collapsed (minimized) state. Default: `false`. */
  defaultCollapsed?: boolean;
  /** Title shown in the panel header. Default: `"server debug"`. */
  title?: string;
  /** Color theme. `"auto"` follows the system preference. Default: `"dark"`. */
  theme?: "dark" | "light" | "auto";
  /** Maximum height of the entries area in pixels. Default: `360`. */
  maxHeight?: number;
  /** Panel opacity from 0 to 1. Default: `0.97`. */
  opacity?: number;
  /** Editor URL scheme for source file deep linking. Default: `"vscode"`. Set to `false` to disable. */
  editorScheme?: "vscode" | "cursor" | "webstorm" | false;
  /** Absolute path to the project root for resolving relative source paths. */
  projectRoot?: string;
  /** Display mode for entries. Default: `"list"`. */
  viewMode?: DebugViewMode;
  /** Duration threshold in ms for slow operation highlighting. Default: `200`. */
  slowThreshold?: number;
}

/**
 * Interface for the debugger collector returned by `createDebugger()`.
 */
export interface Debugger {
  /** Log an info-level entry. */
  log(label: string, data: unknown, tags?: string[]): void;
  /** Log a warn-level entry. */
  warn(label: string, data: unknown, tags?: string[]): void;
  /** Log an error-level entry. */
  error(label: string, data: unknown, tags?: string[]): void;
  /** Log a success-level entry. */
  success(label: string, data: unknown, tags?: string[]): void;
  /** Log a perf-level entry with a manual duration. */
  perf(label: string, data: unknown, durationMs: number): void;
  /** Time an async operation, store the entry, and return the result. */
  timed<T>(label: string, fn: () => Promise<T>, tags?: string[]): Promise<T>;
  /** Capture the current entries as a named snapshot. */
  snapshot(name: string): DebugSnapshot;
  /** Clear all collected entries. */
  clear(): void;
  /** All collected entries. */
  readonly entries: DebugEntry[];
  /** Number of collected entries. */
  readonly count: number;
}
