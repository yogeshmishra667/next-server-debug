/**
 * Severity level for a debug entry.
 */
export type DebugLevel = "info" | "warn" | "error" | "success" | "perf";

/**
 * Cache status for fetch requests inspected via `inspectCache()`.
 */
export type CacheStatus = "HIT" | "MISS" | "STALE" | "REVALIDATE" | "SKIP";

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
  /** Array of debug entries to display. */
  entries: DebugEntry[];
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
