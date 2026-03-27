import { AsyncLocalStorage } from "node:async_hooks";
import { generateId } from "./uuid";
import type {
  DebugConfig,
  DebugEntry,
  DebugLevel,
  PerformanceThresholds,
} from "./types";
import { safeSerializeWithSize } from "./serialize";
import { buildSpanTree } from "./span-tree";

// ─── Default Configuration ──────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  slow: 200,
  critical: 1000,
  slowFetch: 500,
  slowQuery: 100,
};

const DEFAULT_CONFIG: DebugConfig = {
  enabled: process.env.NODE_ENV !== "production",
  thresholds: DEFAULT_THRESHOLDS,
  autoInstrumentFetch: true,
  terminalLogging: true,
  maxEntriesPerRequest: 500,
  persistEntries: false,
};

// ─── Terminal Logging ───────────────────────────────────────────────────────

const LEVEL_LABELS: Record<DebugLevel, string> = {
  info: "INFO", warn: "WARN", error: "ERROR", success: "SUCCESS", perf: "PERF",
};

function logToTerminal(entry: DebugEntry): void {
  if (process.env.NODE_ENV === "production") return;
  const prefix = `[next-server-debug][${LEVEL_LABELS[entry.level]}]`;
  const duration = entry.durationMs != null ? ` (${entry.durationMs}ms)` : "";
  const line = `${prefix} ${entry.label}${duration}`;
  switch (entry.level) {
    case "error": console.error(line); break;
    case "warn": console.warn(line); break;
    default: console.log(line);
  }
  try { console.log(JSON.stringify(entry.data, null, 2)); } catch { console.log("[data not serializable]"); }
}

// ─── Request-scoped Store ───────────────────────────────────────────────────

interface RequestDebugContext {
  requestId: string;
  traceId: string;
  entries: DebugEntry[];
  activeSpanId: string | null;
}

// ─── Singleton Debug Store ──────────────────────────────────────────────────

class DebugStore {
  private als = new AsyncLocalStorage<RequestDebugContext>();
  private config: DebugConfig = { ...DEFAULT_CONFIG };
  private globalEntries: DebugEntry[] = [];

  configure(partial: Partial<DebugConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
      thresholds: {
        ...this.config.thresholds,
        ...(partial.thresholds ?? {}),
      },
    };
  }

  getConfig(): Readonly<DebugConfig> {
    return { ...this.config };
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  runWithContext<T>(fn: () => T, traceId?: string): T {
    const ctx: RequestDebugContext = {
      requestId: generateId(),
      traceId: traceId ?? generateId(),
      entries: [],
      activeSpanId: null,
    };
    return this.als.run(ctx, fn);
  }

  getContext(): RequestDebugContext | null {
    return this.als.getStore() ?? null;
  }

  getRequestId(): string | null {
    return this.getContext()?.requestId ?? null;
  }

  getTraceId(): string | null {
    return this.getContext()?.traceId ?? null;
  }

  addEntry(entry: DebugEntry): void {
    if (!this.config.enabled) return;

    const ctx = this.getContext();
    if (ctx) {
      entry.requestId = ctx.requestId;
      entry.traceId = ctx.traceId;
      if (ctx.activeSpanId) {
        entry.parentId = ctx.activeSpanId;
      }
      ctx.entries.push(entry);
      // Evict oldest entries (FIFO) to cap memory usage
      if (ctx.entries.length > this.config.maxEntriesPerRequest) {
        ctx.entries.splice(0, ctx.entries.length - this.config.maxEntriesPerRequest);
      }
    } else {
      entry.requestId = undefined;
      entry.traceId = undefined;
      this.globalEntries.push(entry);
      // Evict oldest entries (FIFO) to prevent unbounded growth
      if (this.globalEntries.length > this.config.maxEntriesPerRequest) {
        this.globalEntries.splice(0, this.globalEntries.length - this.config.maxEntriesPerRequest);
      }
    }
  }

  getEntries(): DebugEntry[] {
    const ctx = this.getContext();
    if (ctx) return [...ctx.entries];
    return [...this.globalEntries];
  }

  getRequestTree() {
    return buildSpanTree(this.getEntries());
  }

  clearEntries(): void {
    const ctx = this.getContext();
    if (ctx) { ctx.entries.length = 0; }
    else { this.globalEntries.length = 0; }
  }

  getGlobalEntries(): DebugEntry[] {
    return [...this.globalEntries];
  }

  withSpan<T>(spanEntry: DebugEntry, fn: () => T): T {
    const ctx = this.getContext();
    if (!ctx) return fn();

    const previousSpanId = ctx.activeSpanId;
    ctx.activeSpanId = spanEntry.id;
    try {
      return fn();
    } finally {
      ctx.activeSpanId = previousSpanId;
    }
  }
}

// Re-export from shared module for backward compatibility
export { buildSpanTree } from "./span-tree";

// ─── Singleton Instance ─────────────────────────────────────────────────────

export const debugStore = new DebugStore();

// ─── Inline Entry Creation ──────────────────────────────────────────────────

function createStoreEntry(
  label: string,
  data: unknown,
  source: string,
  level: DebugLevel = "info",
  tags?: string[]
): DebugEntry {
  let normalizedData: unknown;
  let size = 0;

  try {
    const serialized = safeSerializeWithSize(data);
    normalizedData = serialized.value;
    size = serialized.size;
  } catch {
    normalizedData = { error: "data not serializable", type: typeof data };
  }

  const entry: DebugEntry = {
    id: generateId(),
    label,
    data: normalizedData,
    level,
    source,
    timestamp: new Date().toISOString(),
    size,
  };

  if (tags && tags.length > 0) {
    entry.tags = tags;
  }

  return entry;
}

// ─── Simplified Unified API ─────────────────────────────────────────────────

/**
 * Simplified debug function that auto-registers entries in the global store.
 * Works both inside and outside request contexts.
 *
 * @example
 * ```ts
 * import { debug } from "next-server-debug/server";
 *
 * debug("User fetched", { id: 1 }, "info");
 * debug("Query slow", { durationMs: 350 }, "warn", ["db"]);
 * ```
 */
export function debug(
  label: string,
  data: unknown,
  level: DebugLevel = "info",
  tags?: string[]
): DebugEntry {
  // Fast-path: skip all work in production
  if (process.env.NODE_ENV === "production") {
    return { id: "", label, data: null, level, source: "", timestamp: "" };
  }

  const source = captureCallerSource();
  const entry = createStoreEntry(label, data, source, level, tags);
  debugStore.addEntry(entry);
  logToTerminal(entry);
  return entry;
}

/**
 * Time an async operation and auto-register it in the global store.
 * Creates a span so nested calls appear as children.
 *
 * @example
 * ```ts
 * const users = await debugTimed("Fetch users", async () => {
 *   return db.user.findMany();
 * });
 * ```
 */
export async function debugTimed<T>(
  label: string,
  fn: () => Promise<T>,
  tags?: string[]
): Promise<T> {
  // Fast-path: skip all instrumentation in production
  if (process.env.NODE_ENV === "production") {
    return fn();
  }

  const source = captureCallerSource();
  const start = performance.now();

  const spanEntry = createStoreEntry(label, { status: "started" }, source, "perf", tags);
  debugStore.addEntry(spanEntry);

  try {
    const result = await debugStore.withSpan(spanEntry, () => fn());
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    spanEntry.durationMs = durationMs;
    spanEntry.data = { durationMs };
    return result;
  } catch (error: unknown) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    spanEntry.durationMs = durationMs;
    spanEntry.level = "error";
    spanEntry.data = {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    };
    throw error;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function captureCallerSource(): string {
  const originalPrepare = Error.prepareStackTrace;
  try {
    const err = new Error();
    let callerFile = "unknown";

    Error.prepareStackTrace = (_err, stack) => stack;
    const stack = err.stack as unknown as NodeJS.CallSite[];

    if (stack) {
      for (const frame of stack) {
        const fileName = frame.getFileName();
        if (
          fileName &&
          !fileName.includes("store.ts") &&
          !fileName.includes("store.js") &&
          !fileName.includes("debug.server.ts") &&
          !fileName.includes("debug.server.js") &&
          !fileName.includes("node:internal")
        ) {
          callerFile = fileName;
          const line = frame.getLineNumber();
          if (line) callerFile += `:${line}`;
          break;
        }
      }
    }

    return callerFile;
  } finally {
    Error.prepareStackTrace = originalPrepare;
  }
}
