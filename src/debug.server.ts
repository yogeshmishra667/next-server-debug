import { randomUUID } from "crypto";
import type {
  CacheStatus,
  DebugEntry,
  DebugLevel,
  DebugSnapshot,
  Debugger,
} from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_SERIALIZABLE_SIZE = 50 * 1024; // 50KB
const SENSITIVE_HEADER_KEYS = ["authorization", "cookie", "x-api-key"];
const SENSITIVE_VALUE_PATTERNS = /secret|key|password|token/i;

const LEVEL_LABELS: Record<DebugLevel, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  success: "SUCCESS",
  perf: "PERF",
};

// ─── Serialization Utilities ─────────────────────────────────────────────────

/**
 * Safely serialize data, handling circular references and non-serializable values.
 * Returns a JSON-safe value that can cross the server→client boundary.
 */
export function safeSerialize(data: unknown): unknown {
  try {
    const json = JSON.stringify(data);
    if (json.length > MAX_SERIALIZABLE_SIZE) {
      return `[truncated: ${json.length} bytes]`;
    }
    return JSON.parse(json) as unknown;
  } catch {
    return walkAndSerialize(data, new WeakSet());
  }
}

function walkAndSerialize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }

  if (typeof value === "function") {
    return `[function: ${value.name || "anonymous"}]`;
  }

  if (typeof value === "symbol") {
    return `[symbol: ${value.toString()}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      __type: "Error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular reference]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value) {
      result.push(walkAndSerialize(item, seen));
    }
    const json = JSON.stringify(result);
    if (json.length > MAX_SERIALIZABLE_SIZE) {
      return `[truncated: ${json.length} bytes]`;
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  const proto = Object.getPrototypeOf(value) as object | null;
  if (
    proto !== null &&
    proto !== Object.prototype &&
    proto.constructor?.name
  ) {
    result.__type = proto.constructor.name;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    result[key] = walkAndSerialize(
      (value as Record<string, unknown>)[key],
      seen
    );
  }

  const json = JSON.stringify(result);
  if (json.length > MAX_SERIALIZABLE_SIZE) {
    return `[truncated: ${json.length} bytes]`;
  }

  return result;
}

/**
 * Normalize data for the server→client boundary.
 * Converts Date → ISO string, BigInt → string with `n` suffix,
 * undefined → null, class instances → plain objects with `__type`.
 */
export function normalizeForBoundary(data: unknown): unknown {
  return normalizeValue(data, new WeakSet());
}

function normalizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }

  if (typeof value === "function") {
    return `[function: ${value.name || "anonymous"}]`;
  }

  if (typeof value === "symbol") {
    return `[symbol: ${value.toString()}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      __type: "Error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular reference]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  const proto = Object.getPrototypeOf(value) as object | null;
  if (
    proto !== null &&
    proto !== Object.prototype &&
    proto.constructor?.name
  ) {
    result.__type = proto.constructor.name;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    result[key] = normalizeValue(
      (value as Record<string, unknown>)[key],
      seen
    );
  }

  return result;
}

// ─── Terminal Logging ────────────────────────────────────────────────────────

function logToTerminal(entry: DebugEntry): void {
  if (process.env.NODE_ENV === "production") return;

  const prefix = `[next-server-debug][${LEVEL_LABELS[entry.level]}]`;
  const duration = entry.durationMs != null ? ` (${entry.durationMs}ms)` : "";
  const line = `${prefix} ${entry.label}${duration}`;

  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }

  try {
    const serialized = JSON.stringify(entry.data, null, 2);
    console.log(serialized);
  } catch {
    console.log("[data not serializable]");
  }
}

// ─── Compute Size ────────────────────────────────────────────────────────────

function computeSize(data: unknown): number {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Create a single debug entry. The lowest-level primitive.
 *
 * @param label  - Short description of this entry
 * @param data   - Any JSON-serializable value to inspect
 * @param source - File path or descriptive origin string
 * @param level  - Severity level (default: `"info"`)
 * @param tags   - Optional tags for filtering
 * @returns A serializable `DebugEntry`
 */
export function dbg(
  label: string,
  data: unknown,
  source: string,
  level: DebugLevel = "info",
  tags?: string[]
): DebugEntry {
  let normalizedData: unknown;
  try {
    normalizedData = safeSerialize(normalizeForBoundary(data));
  } catch {
    normalizedData = {
      error: "circular reference — data not serializable",
      type: typeof data,
    };
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

  logToTerminal(entry);
  return entry;
}

/**
 * Time an async operation. Returns both the result and the debug entry.
 * If `fn` throws, creates an error entry and re-throws the original error.
 *
 * @param label  - Short description
 * @param fn     - Async function to time
 * @param source - File path or descriptive origin string
 * @param level  - Severity level (default: `"perf"`)
 * @returns Object containing the function result and the timing entry
 */
export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
  source: string,
  level: DebugLevel = "perf"
): Promise<{ result: T; entry: DebugEntry }> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const entry = dbg(label, { durationMs }, source, level);
    entry.durationMs = durationMs;
    return { result, entry };
  } catch (error: unknown) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const entry = dbg(
      label,
      { error: error instanceof Error ? error.message : String(error), durationMs },
      source,
      "error"
    );
    entry.durationMs = durationMs;
    throw error;
  }
}

/**
 * Create a debugger collector scoped to a specific source.
 * Accumulates entries that can be passed to the `DebugPanel`.
 *
 * @param source - File path or descriptive origin string for all entries
 * @returns A `Debugger` instance with log/warn/error/success/perf/timed methods
 */
export function createDebugger(source: string): Debugger {
  const _entries: DebugEntry[] = [];

  return {
    log(label: string, data: unknown, tags?: string[]): void {
      _entries.push(dbg(label, data, source, "info", tags));
    },

    warn(label: string, data: unknown, tags?: string[]): void {
      _entries.push(dbg(label, data, source, "warn", tags));
    },

    error(label: string, data: unknown, tags?: string[]): void {
      _entries.push(dbg(label, data, source, "error", tags));
    },

    success(label: string, data: unknown, tags?: string[]): void {
      _entries.push(dbg(label, data, source, "success", tags));
    },

    perf(label: string, data: unknown, durationMs: number): void {
      const entry = dbg(label, data, source, "perf");
      entry.durationMs = durationMs;
      _entries.push(entry);
    },

    async timed<T>(
      label: string,
      fn: () => Promise<T>,
      tags?: string[]
    ): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        const duration =
          Math.round((performance.now() - start) * 100) / 100;
        const entry = dbg(label, { durationMs: duration }, source, "perf", tags);
        entry.durationMs = duration;
        _entries.push(entry);
        return result;
      } catch (error: unknown) {
        const duration =
          Math.round((performance.now() - start) * 100) / 100;
        const entry = dbg(
          label,
          {
            error: error instanceof Error ? error.message : String(error),
            durationMs: duration,
          },
          source,
          "error",
          tags
        );
        entry.durationMs = duration;
        _entries.push(entry);
        throw error;
      }
    },

    snapshot(name: string): DebugSnapshot {
      return {
        name,
        entries: [..._entries],
        capturedAt: new Date().toISOString(),
      };
    },

    clear(): void {
      _entries.length = 0;
    },

    get entries(): DebugEntry[] {
      return [..._entries];
    },

    get count(): number {
      return _entries.length;
    },
  };
}

/**
 * Inspect the current request headers.
 * Sanitizes sensitive headers (Authorization, Cookie, x-api-key).
 * Returns an error-level entry if called outside a request context.
 *
 * @param source - Optional source identifier (default: `"headers"`)
 * @returns A `DebugEntry` containing the sanitized headers
 */
export async function inspectHeaders(
  source: string = "headers"
): Promise<DebugEntry> {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const headersObj: Record<string, string> = {};

    headerStore.forEach((value: string, key: string) => {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_HEADER_KEYS.includes(lowerKey)) {
        headersObj[key] = "[redacted]";
      } else {
        headersObj[key] = value;
      }
    });

    return dbg("Request Headers", headersObj, source, "info");
  } catch (error: unknown) {
    return dbg(
      "Headers unavailable",
      {
        error:
          error instanceof Error ? error.message : String(error),
        hint: "headers() can only be called within a request context (Server Component, Route Handler, Server Action, or middleware)",
      },
      source,
      "error"
    );
  }
}

/**
 * Inspect specific environment variables. NEVER auto-exposes all env vars.
 * Redacts values containing "secret", "key", "password", or "token" (case-insensitive).
 *
 * @param keys   - Explicit list of env var names to inspect
 * @param source - Optional source identifier (default: `"env"`)
 * @returns A `DebugEntry` containing the (possibly redacted) values
 */
export function inspectEnv(
  keys: string[],
  source: string = "env"
): DebugEntry {
  const envData: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key];
    if (value === undefined) {
      envData[key] = "not set";
    } else if (SENSITIVE_VALUE_PATTERNS.test(key)) {
      envData[key] = "[redacted]";
    } else {
      envData[key] = value;
    }
  }

  return dbg("Environment Variables", envData, source, "info");
}

/**
 * Create a debug entry for URL search parameters.
 *
 * @param searchParams - The search params object to inspect
 * @param source       - Optional source identifier (default: `"searchParams"`)
 * @returns A `DebugEntry` containing the search params
 */
export function inspectSearchParams(
  searchParams: Record<string, string | string[]>,
  source: string = "searchParams"
): DebugEntry {
  return dbg("Search Params", searchParams, source, "info");
}

// ─── Cache Inspector ─────────────────────────────────────────────────────────

const CACHE_HEADER_KEYS = [
  "x-nextjs-cache",
  "x-vercel-cache",
  "cf-cache-status",
] as const;

function parseCacheStatus(headerValue: string): CacheStatus {
  const normalized = headerValue.toUpperCase().trim();
  if (normalized === "HIT") return "HIT";
  if (normalized === "MISS") return "MISS";
  if (normalized === "STALE") return "STALE";
  if (normalized === "REVALIDATED" || normalized === "REVALIDATE")
    return "REVALIDATE";
  return "SKIP";
}

/**
 * Fetch a URL and inspect its cache status from response headers.
 * Reads `x-nextjs-cache`, `x-vercel-cache`, and `cf-cache-status`.
 * Returns both the original `Response` and a `DebugEntry` with `cacheStatus`.
 *
 * @param label  - Short description of the fetch
 * @param url    - URL to fetch
 * @param init   - Optional `RequestInit` (headers, method, etc.)
 * @param source - Optional source identifier (default: `"cache"`)
 * @returns Object containing the fetch response and a debug entry
 */
export async function inspectCache(
  label: string,
  url: string | URL,
  init?: RequestInit,
  source: string = "cache"
): Promise<{ response: Response; entry: DebugEntry }> {
  const start = performance.now();
  try {
    const response = await fetch(url, init);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    let cacheStatus: CacheStatus = "MISS";
    for (const headerKey of CACHE_HEADER_KEYS) {
      const value = response.headers.get(headerKey);
      if (value) {
        cacheStatus = parseCacheStatus(value);
        break;
      }
    }

    const entry = dbg(
      label,
      {
        url: url.toString(),
        status: response.status,
        cacheStatus,
        durationMs,
        headers: Object.fromEntries(
          CACHE_HEADER_KEYS.filter((k) => response.headers.has(k)).map((k) => [
            k,
            response.headers.get(k),
          ])
        ),
      },
      source,
      "perf",
      ["cache"]
    );
    entry.durationMs = durationMs;
    entry.cacheStatus = cacheStatus;

    return { response, entry };
  } catch (error: unknown) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const entry = dbg(
      label,
      {
        url: url.toString(),
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      },
      source,
      "error",
      ["cache"]
    );
    entry.durationMs = durationMs;
    entry.cacheStatus = "MISS";
    throw error;
  }
}

// ─── Redirect Interceptor ────────────────────────────────────────────────────

/**
 * Log a redirect before executing it via Next.js `redirect()`.
 * Creates a warn-level entry with the redirect URL and optional reason,
 * then calls `redirect()` which throws internally.
 *
 * @param url     - The URL to redirect to
 * @param options - Optional reason, source, and redirect type
 * @returns Never — `redirect()` always throws
 */
export function debugRedirect(
  url: string,
  options?: { reason?: string; source?: string; type?: "replace" | "push" }
): never {
  dbg(
    `Redirect → ${url}`,
    {
      url,
      reason: options?.reason ?? null,
      type: options?.type ?? "replace",
    },
    options?.source ?? "redirect",
    "warn",
    ["redirect"]
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nav = require("next/navigation") as {
    redirect: (url: string, type?: "replace" | "push") => never;
  };
  return nav.redirect(url, options?.type);
}
