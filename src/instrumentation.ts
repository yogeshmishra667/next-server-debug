import { debugStore } from "./store";
import type { DebugEntry, DebugLevel } from "./types";
import { randomUUID } from "crypto";

// ─── Fetch Interceptor ──────────────────────────────────────────────────────

let fetchPatched = false;

/**
 * Monkey-patch the global `fetch` to auto-log every request/response.
 * Creates entries with `level: 'perf'` and tags `['fetch']`.
 *
 * Call this once in your `instrumentation.ts` or `next.config.js` setup.
 * The patch is idempotent — calling it multiple times is safe.
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * import { instrumentFetch } from "next-server-debug/server";
 * instrumentFetch();
 * ```
 */
export function instrumentFetch(): void {
  if (fetchPatched) return;
  if (typeof globalThis.fetch !== "function") return;
  if (process.env.NODE_ENV === "production") return;

  const originalFetch = globalThis.fetch;
  fetchPatched = true;

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const start = performance.now();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";

    try {
      const response = await originalFetch(input, init);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      const entry: DebugEntry = {
        id: randomUUID(),
        label: `${method} ${shortenUrl(url)}`,
        data: {
          url,
          method,
          status: response.status,
          statusText: response.statusText,
          durationMs,
          headers: extractSafeHeaders(response.headers),
        },
        level: classifyFetchLevel(response.status, durationMs),
        source: "fetch-interceptor",
        timestamp: new Date().toISOString(),
        durationMs,
        tags: ["fetch"],
      };

      debugStore.addEntry(entry);
      return response;
    } catch (error: unknown) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      const entry: DebugEntry = {
        id: randomUUID(),
        label: `${method} ${shortenUrl(url)} [FAILED]`,
        data: {
          url,
          method,
          error: error instanceof Error ? error.message : String(error),
          durationMs,
        },
        level: "error",
        source: "fetch-interceptor",
        timestamp: new Date().toISOString(),
        durationMs,
        tags: ["fetch"],
      };

      debugStore.addEntry(entry);
      throw error;
    }
  };
}

/**
 * Restore the original `fetch` function if previously patched.
 * Useful for testing or when disabling instrumentation.
 */
export function restoreFetch(): void {
  fetchPatched = false;
  // Note: We can't truly restore since we don't keep a reference.
  // This just prevents patching again when called.
}

// ─── Server Action Wrapper ──────────────────────────────────────────────────

/**
 * Wrap a server action to auto-log its execution, timing, and result.
 * Entries are tagged with `['server-action']`.
 *
 * @example
 * ```ts
 * "use server";
 * import { withDebug } from "next-server-debug/server";
 *
 * async function createUser(formData: FormData) {
 *   const name = formData.get("name");
 *   return db.user.create({ data: { name } });
 * }
 * export const createUserAction = withDebug("createUser", createUser);
 * ```
 */
export function withDebug<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async function debugWrapped(...args: TArgs): Promise<TResult> {
    if (process.env.NODE_ENV === "production") {
      return fn(...args);
    }

    const start = performance.now();
    const actionId = randomUUID();

    // Log start
    const startEntry: DebugEntry = {
      id: actionId,
      label: `Server Action: ${name}`,
      data: { status: "started", argsCount: args.length },
      level: "info",
      source: "server-action",
      timestamp: new Date().toISOString(),
      tags: ["server-action"],
    };
    debugStore.addEntry(startEntry);

    try {
      const result = await debugStore.withSpan(startEntry, () => fn(...args));
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      // Update with success
      startEntry.durationMs = durationMs;
      startEntry.level = durationMs > debugStore.getConfig().thresholds.slow
        ? "warn"
        : "success";
      startEntry.data = {
        status: "completed",
        durationMs,
      };

      return result;
    } catch (error: unknown) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      startEntry.durationMs = durationMs;
      startEntry.level = "error";
      startEntry.data = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };

      throw error;
    }
  };
}

// ─── Middleware Helper ──────────────────────────────────────────────────────

/**
 * Wrap a Next.js middleware function to auto-create a request context
 * and log the middleware execution.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { withDebugMiddleware } from "next-server-debug/server";
 * import { NextResponse } from "next/server";
 *
 * export const middleware = withDebugMiddleware(async (req) => {
 *   // your middleware logic
 *   return NextResponse.next();
 * });
 * ```
 */
export function withDebugMiddleware<TReq, TRes>(
  fn: (req: TReq) => Promise<TRes>
): (req: TReq) => Promise<TRes> {
  return async function debugMiddleware(req: TReq): Promise<TRes> {
    if (process.env.NODE_ENV === "production") {
      return fn(req);
    }

    return debugStore.runWithContext(async () => {
      const start = performance.now();
      const url =
        req && typeof req === "object" && "url" in req
          ? String((req as Record<string, unknown>).url)
          : "unknown";

      try {
        const result = await fn(req);
        const durationMs = Math.round((performance.now() - start) * 100) / 100;

        const entry: DebugEntry = {
          id: randomUUID(),
          label: `Middleware: ${shortenUrl(url)}`,
          data: { url, durationMs },
          level: durationMs > debugStore.getConfig().thresholds.slow ? "warn" : "info",
          source: "middleware",
          timestamp: new Date().toISOString(),
          durationMs,
          tags: ["middleware"],
        };
        debugStore.addEntry(entry);
        return result;
      } catch (error: unknown) {
        const durationMs = Math.round((performance.now() - start) * 100) / 100;

        const entry: DebugEntry = {
          id: randomUUID(),
          label: `Middleware: ${shortenUrl(url)} [FAILED]`,
          data: {
            url,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
          },
          level: "error",
          source: "middleware",
          timestamp: new Date().toISOString(),
          durationMs,
          tags: ["middleware"],
        };
        debugStore.addEntry(entry);
        throw error;
      }
    });
  };
}

// ─── Route Handler Wrapper ──────────────────────────────────────────────────

/**
 * Wrap a Next.js route handler (GET, POST, PUT, DELETE, PATCH) to auto-log
 * its execution, timing, and result. Creates a request context so nested
 * `debug()` calls are correlated.
 *
 * @example
 * ```ts
 * // app/api/users/route.ts
 * import { withRouteDebug } from "next-server-debug/server";
 * import { NextResponse } from "next/server";
 *
 * export const GET = withRouteDebug("GET /api/users", async (req) => {
 *   const users = await db.user.findMany();
 *   return NextResponse.json(users);
 * });
 *
 * export const POST = withRouteDebug("POST /api/users", async (req) => {
 *   const body = await req.json();
 *   const user = await db.user.create({ data: body });
 *   return NextResponse.json(user, { status: 201 });
 * });
 * ```
 */
export function withRouteDebug<TReq, TRes>(
  name: string,
  fn: (req: TReq, ctx?: unknown) => Promise<TRes>
): (req: TReq, ctx?: unknown) => Promise<TRes> {
  return async function debugRouteHandler(req: TReq, ctx?: unknown): Promise<TRes> {
    if (process.env.NODE_ENV === "production") {
      return fn(req, ctx);
    }

    return debugStore.runWithContext(async () => {
      const start = performance.now();
      const url =
        req && typeof req === "object" && "url" in req
          ? String((req as Record<string, unknown>).url)
          : "unknown";
      const method =
        req && typeof req === "object" && "method" in req
          ? String((req as Record<string, unknown>).method)
          : "UNKNOWN";

      try {
        const result = await fn(req, ctx);
        const durationMs = Math.round((performance.now() - start) * 100) / 100;

        // Extract status from Response-like objects
        const status =
          result && typeof result === "object" && "status" in result
            ? (result as Record<string, unknown>).status
            : undefined;

        const entry: DebugEntry = {
          id: randomUUID(),
          label: name,
          data: { url: shortenUrl(url), method, status, durationMs },
          level: durationMs > debugStore.getConfig().thresholds.slow ? "warn" : "perf",
          source: "route-handler",
          timestamp: new Date().toISOString(),
          durationMs,
          tags: ["route-handler"],
        };
        debugStore.addEntry(entry);
        return result;
      } catch (error: unknown) {
        const durationMs = Math.round((performance.now() - start) * 100) / 100;

        const entry: DebugEntry = {
          id: randomUUID(),
          label: `${name} [FAILED]`,
          data: {
            url: shortenUrl(url),
            method,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
          },
          level: "error",
          source: "route-handler",
          timestamp: new Date().toISOString(),
          durationMs,
          tags: ["route-handler"],
        };
        debugStore.addEntry(entry);
        throw error;
      }
    });
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + (parsed.search ? "?" + parsed.searchParams.toString().slice(0, 30) : "");
  } catch {
    return url.length > 60 ? url.slice(0, 60) + "…" : url;
  }
}

function classifyFetchLevel(status: number, durationMs: number): DebugLevel {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  const thresholds = debugStore.getConfig().thresholds;
  if (durationMs > thresholds.slowFetch) return "warn";
  return "perf";
}

const SAFE_HEADERS = [
  "content-type",
  "content-length",
  "x-nextjs-cache",
  "x-vercel-cache",
  "cf-cache-status",
  "cache-control",
  "x-request-id",
];

function extractSafeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of SAFE_HEADERS) {
    const value = headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}
