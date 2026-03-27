import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "crypto";
import type {
  DebugConfig,
  DebugEntry,
  DebugLevel,
  DebugSpanNode,
  PerformanceThresholds,
} from "./types";

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

// ─── Inline Serialization (avoids circular dep with debug.server.ts) ────────

const MAX_SERIALIZABLE_SIZE = 50 * 1024;

function inlineSafeSerialize(data: unknown): unknown {
  try {
    const json = JSON.stringify(data);
    if (json.length > MAX_SERIALIZABLE_SIZE) {
      return `[truncated: ${json.length} bytes]`;
    }
    return JSON.parse(json) as unknown;
  } catch {
    return inlineWalk(data, new WeakSet());
  }
}

function inlineWalk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return `[function: ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return `[symbol: ${value.toString()}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) {
    return { __type: "Error", name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular reference]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => inlineWalk(item, seen));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    result[key] = inlineWalk((value as Record<string, unknown>)[key], seen);
  }
  return result;
}

function computeSize(data: unknown): number {
  try { return JSON.stringify(data).length; } catch { return 0; }
}

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
      requestId: randomUUID(),
      traceId: traceId ?? randomUUID(),
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
      if (ctx.entries.length < this.config.maxEntriesPerRequest) {
        ctx.entries.push(entry);
      }
    } else {
      entry.requestId = undefined;
      entry.traceId = undefined;
      if (this.globalEntries.length < this.config.maxEntriesPerRequest) {
        this.globalEntries.push(entry);
      }
    }
  }

  getEntries(): DebugEntry[] {
    const ctx = this.getContext();
    if (ctx) return [...ctx.entries];
    return [...this.globalEntries];
  }

  getRequestTree(): DebugSpanNode[] {
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

// ─── Span Tree Builder ──────────────────────────────────────────────────────

export function buildSpanTree(entries: DebugEntry[]): DebugSpanNode[] {
  const nodeMap = new Map<string, DebugSpanNode>();
  const roots: DebugSpanNode[] = [];

  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [], depth: 0 });
  }

  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (entry.parentId && nodeMap.has(entry.parentId)) {
      const parent = nodeMap.get(entry.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

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
  try {
    normalizedData = inlineSafeSerialize(data);
  } catch {
    normalizedData = { error: "data not serializable", type: typeof data };
  }

  const entry: DebugEntry = {
    id: randomUUID(),
    label,
    data: normalizedData,
    level,
    source,
    timestamp: new Date().toISOString(),
    size: computeSize(normalizedData),
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
