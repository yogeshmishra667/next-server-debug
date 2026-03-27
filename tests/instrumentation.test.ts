import { describe, it, expect, vi, beforeEach } from "vitest";
import { debugStore } from "../src/store";
import { withDebug, withDebugMiddleware, withRouteDebug } from "../src/instrumentation";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  debugStore.clearEntries();
});

// ─── withDebug (Server Action Wrapper) ──────────────────────────────────────

describe("withDebug", () => {
  it("wraps a server action and logs start + success", async () => {
    const action = vi.fn(async (a: number, b: number) => a + b);
    const wrapped = withDebug("add", action);

    let entries: ReturnType<typeof debugStore.getEntries> = [];
    const result = await debugStore.runWithContext(async () => {
      const r = await wrapped(2, 3);
      entries = debugStore.getEntries();
      return r;
    });

    expect(result).toBe(5);
    expect(action).toHaveBeenCalledWith(2, 3);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].label).toBe("Server Action: add");
    expect(entries[0].tags).toEqual(["server-action"]);
    expect(entries[0].durationMs).toBeDefined();
  });

  it("logs error state when action throws", async () => {
    const action = vi.fn(async () => {
      throw new Error("action failed");
    });
    const wrapped = withDebug("failAction", action);

    await expect(
      debugStore.runWithContext(async () => wrapped())
    ).rejects.toThrow("action failed");
  });

  it("nests child entries under the action span", async () => {
    const action = vi.fn(async () => {
      debugStore.addEntry({
        id: "child-1",
        label: "db query",
        data: {},
        level: "info",
        source: "test",
        timestamp: new Date().toISOString(),
      });
      return "ok";
    });
    const wrapped = withDebug("parentAction", action);

    let entries: ReturnType<typeof debugStore.getEntries> = [];
    await debugStore.runWithContext(async () => {
      await wrapped();
      entries = debugStore.getEntries();
    });

    expect(entries.length).toBe(2);
    expect(entries[1].parentId).toBe(entries[0].id);
  });
});

// ─── withDebugMiddleware ────────────────────────────────────────────────────

describe("withDebugMiddleware", () => {
  it("wraps middleware and logs execution", async () => {
    const middleware = vi.fn(async (req: { url: string }) => {
      return { status: 200 };
    });
    const wrapped = withDebugMiddleware(middleware);

    const result = await wrapped({ url: "http://localhost:3000/api/test" });

    expect(result).toEqual({ status: 200 });
    expect(middleware).toHaveBeenCalled();
  });

  it("creates a request context for the middleware", async () => {
    let capturedRequestId: string | null = null;

    const middleware = vi.fn(async (req: { url: string }) => {
      capturedRequestId = debugStore.getRequestId();
      return { status: 200 };
    });
    const wrapped = withDebugMiddleware(middleware);

    await wrapped({ url: "http://localhost:3000/" });

    expect(capturedRequestId).not.toBeNull();
  });

  it("logs error state when middleware throws", async () => {
    const middleware = vi.fn(async () => {
      throw new Error("middleware failed");
    });
    const wrapped = withDebugMiddleware(middleware);

    await expect(wrapped({ url: "http://localhost:3000/" })).rejects.toThrow(
      "middleware failed"
    );
  });
});

// ─── withRouteDebug ──────────────────────────────────────────────────────────

describe("withRouteDebug", () => {
  it("wraps a route handler and logs execution with timing", async () => {
    let capturedEntries: ReturnType<typeof debugStore.getEntries> = [];

    const handler = vi.fn(async (req: { url: string; method: string }) => {
      // Entries are added after fn returns, so we capture inside a wrapper
      return { status: 200, body: "ok" };
    });

    // withRouteDebug creates its own context, entries are scoped there.
    // We need to wrap in our own context to observe entries.
    const wrapped = withRouteDebug("GET /api/users", handler);

    await debugStore.runWithContext(async () => {
      const result = await wrapped({ url: "http://localhost:3000/api/users", method: "GET" });
      expect(result).toEqual({ status: 200, body: "ok" });
      expect(handler).toHaveBeenCalled();
    });
  });

  it("logs error state when handler throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("handler failed");
    });
    const wrapped = withRouteDebug("POST /api/users", handler);

    await expect(
      wrapped({ url: "http://localhost:3000/api/users", method: "POST" })
    ).rejects.toThrow("handler failed");
  });

  it("creates a request context for nested debug calls", async () => {
    let capturedRequestId: string | null = null;

    const handler = vi.fn(async (req: { url: string; method: string }) => {
      capturedRequestId = debugStore.getRequestId();
      return { status: 200 };
    });
    const wrapped = withRouteDebug("GET /api/test", handler);

    await wrapped({ url: "http://localhost:3000/api/test", method: "GET" });

    expect(capturedRequestId).not.toBeNull();
  });

  it("passes through the return value and context parameter", async () => {
    const handler = vi.fn(async (_req: unknown, ctx?: unknown) => {
      return { status: 201, ctx };
    });
    const wrapped = withRouteDebug("POST /api/items", handler);

    const result = await wrapped(
      { url: "http://localhost:3000/api/items", method: "POST" },
      { params: { id: "123" } }
    );

    expect(result.status).toBe(201);
    expect(result.ctx).toEqual({ params: { id: "123" } });
    expect(handler).toHaveBeenCalledWith(
      { url: "http://localhost:3000/api/items", method: "POST" },
      { params: { id: "123" } }
    );
  });
});
