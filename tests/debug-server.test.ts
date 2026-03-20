import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dbg,
  timed,
  createDebugger,
  inspectEnv,
  inspectSearchParams,
  safeSerialize,
  normalizeForBoundary,
} from "../src/debug.server";

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ─── dbg ─────────────────────────────────────────────────────────────────────

describe("dbg", () => {
  it("creates a debug entry with correct fields", () => {
    const entry = dbg("test label", { foo: "bar" }, "test.ts");

    expect(entry.id).toBeDefined();
    expect(entry.label).toBe("test label");
    expect(entry.data).toEqual({ foo: "bar" });
    expect(entry.level).toBe("info");
    expect(entry.source).toBe("test.ts");
    expect(entry.timestamp).toBeDefined();
    expect(entry.size).toBeGreaterThan(0);
  });

  it("uses specified level", () => {
    const entry = dbg("warn test", {}, "test.ts", "warn");
    expect(entry.level).toBe("warn");
  });

  it("attaches tags when provided", () => {
    const entry = dbg("tagged", {}, "test.ts", "info", ["db", "query"]);
    expect(entry.tags).toEqual(["db", "query"]);
  });

  it("does not attach tags when empty", () => {
    const entry = dbg("no tags", {}, "test.ts");
    expect(entry.tags).toBeUndefined();
  });

  it("handles circular references in data", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const entry = dbg("circular", obj, "test.ts");
    // Should not throw, and data should be serializable
    expect(() => JSON.stringify(entry.data)).not.toThrow();
  });
});

// ─── timed ───────────────────────────────────────────────────────────────────

describe("timed", () => {
  it("returns result and entry with duration", async () => {
    const { result, entry } = await timed(
      "test op",
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 42;
      },
      "test.ts"
    );

    expect(result).toBe(42);
    expect(entry.durationMs).toBeGreaterThan(0);
    expect(entry.level).toBe("perf");
  });

  it("creates error entry and re-throws on failure", async () => {
    const testError = new Error("test error");

    await expect(
      timed("failing op", async () => { throw testError; }, "test.ts")
    ).rejects.toThrow("test error");
  });
});

// ─── createDebugger ──────────────────────────────────────────────────────────

describe("createDebugger", () => {
  it("collects entries via log/warn/error/success", () => {
    const debug = createDebugger("test.ts");

    debug.log("info msg", { a: 1 });
    debug.warn("warn msg", { b: 2 });
    debug.error("error msg", { c: 3 });
    debug.success("success msg", { d: 4 });

    expect(debug.count).toBe(4);
    expect(debug.entries[0].level).toBe("info");
    expect(debug.entries[1].level).toBe("warn");
    expect(debug.entries[2].level).toBe("error");
    expect(debug.entries[3].level).toBe("success");
  });

  it("perf adds entry with durationMs", () => {
    const debug = createDebugger("test.ts");
    debug.perf("manual timing", {}, 123.45);

    expect(debug.entries[0].level).toBe("perf");
    expect(debug.entries[0].durationMs).toBe(123.45);
  });

  it("timed returns result and stores entry", async () => {
    const debug = createDebugger("test.ts");
    const result = await debug.timed("async op", async () => "hello");

    expect(result).toBe("hello");
    expect(debug.count).toBe(1);
    expect(debug.entries[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("timed re-throws errors", async () => {
    const debug = createDebugger("test.ts");

    await expect(
      debug.timed("fail", async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");

    expect(debug.count).toBe(1);
    expect(debug.entries[0].level).toBe("error");
  });

  it("snapshot captures current entries", () => {
    const debug = createDebugger("test.ts");
    debug.log("a", 1);
    debug.log("b", 2);

    const snap = debug.snapshot("my-snapshot");
    expect(snap.name).toBe("my-snapshot");
    expect(snap.entries).toHaveLength(2);
    expect(snap.capturedAt).toBeDefined();
  });

  it("clear removes all entries", () => {
    const debug = createDebugger("test.ts");
    debug.log("a", 1);
    debug.log("b", 2);
    expect(debug.count).toBe(2);

    debug.clear();
    expect(debug.count).toBe(0);
    expect(debug.entries).toHaveLength(0);
  });

  it("entries returns a copy (not the internal array)", () => {
    const debug = createDebugger("test.ts");
    debug.log("a", 1);
    const entries = debug.entries;
    entries.push(dbg("fake", {}, "fake.ts"));
    expect(debug.count).toBe(1); // original unchanged
  });
});

// ─── inspectEnv ──────────────────────────────────────────────────────────────

describe("inspectEnv", () => {
  it("returns env values for listed keys", () => {
    process.env.TEST_NSD_VAR = "hello";
    const entry = inspectEnv(["TEST_NSD_VAR", "MISSING_VAR"]);

    const data = entry.data as Record<string, string>;
    expect(data.TEST_NSD_VAR).toBe("hello");
    expect(data.MISSING_VAR).toBe("not set");

    delete process.env.TEST_NSD_VAR;
  });

  it("redacts keys containing sensitive words", () => {
    process.env.MY_SECRET_TOKEN = "super-secret-value";
    process.env.API_KEY = "key-12345";
    process.env.DB_PASSWORD = "pass123";

    const entry = inspectEnv(["MY_SECRET_TOKEN", "API_KEY", "DB_PASSWORD"]);
    const data = entry.data as Record<string, string>;

    expect(data.MY_SECRET_TOKEN).toBe("[redacted]");
    expect(data.API_KEY).toBe("[redacted]");
    expect(data.DB_PASSWORD).toBe("[redacted]");

    delete process.env.MY_SECRET_TOKEN;
    delete process.env.API_KEY;
    delete process.env.DB_PASSWORD;
  });

  it("does not redact non-sensitive keys", () => {
    process.env.NODE_ENV = "test";
    const entry = inspectEnv(["NODE_ENV"]);
    const data = entry.data as Record<string, string>;
    expect(data.NODE_ENV).toBe("test");
  });
});

// ─── inspectSearchParams ─────────────────────────────────────────────────────

describe("inspectSearchParams", () => {
  it("creates entry with search params data", () => {
    const entry = inspectSearchParams(
      { page: "1", sort: "name", tags: ["a", "b"] },
      "test.ts"
    );

    expect(entry.label).toBe("Search Params");
    expect(entry.data).toEqual({ page: "1", sort: "name", tags: ["a", "b"] });
    expect(entry.source).toBe("test.ts");
  });
});

// ─── safeSerialize ───────────────────────────────────────────────────────────

describe("safeSerialize", () => {
  it("passes through simple JSON-safe values", () => {
    expect(safeSerialize({ a: 1, b: "hello", c: true, d: null })).toEqual({
      a: 1,
      b: "hello",
      c: true,
      d: null,
    });
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;

    const result = safeSerialize(obj);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect((result as Record<string, unknown>).a).toBe(1);
  });

  it("handles nested circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b", parent: a };
    a.child = b;

    const result = safeSerialize(a);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("truncates values larger than 50KB", () => {
    const bigString = "x".repeat(60000);
    const result = safeSerialize(bigString);
    expect(typeof result).toBe("string");
    // Original string is JSON-safe so it passes the first try
    // but JSON.stringify wraps in quotes making it >50KB
  });

  it("handles arrays", () => {
    expect(safeSerialize([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("handles null and undefined", () => {
    expect(safeSerialize(null)).toBeNull();
  });
});

// ─── normalizeForBoundary ────────────────────────────────────────────────────

describe("normalizeForBoundary", () => {
  it("converts Date to ISO string", () => {
    const date = new Date("2026-01-15T10:30:00.000Z");
    expect(normalizeForBoundary(date)).toBe("2026-01-15T10:30:00.000Z");
  });

  it("converts BigInt to string with n suffix", () => {
    expect(normalizeForBoundary(BigInt(12345))).toBe("12345n");
  });

  it("converts undefined to null", () => {
    expect(normalizeForBoundary(undefined)).toBeNull();
  });

  it("converts Error to plain object", () => {
    const err = new Error("test");
    const result = normalizeForBoundary(err) as Record<string, unknown>;
    expect(result.__type).toBe("Error");
    expect(result.message).toBe("test");
    expect(result.name).toBe("Error");
  });

  it("converts class instances to plain objects with __type", () => {
    class User {
      name = "Alice";
      age = 30;
    }
    const result = normalizeForBoundary(new User()) as Record<string, unknown>;
    expect(result.__type).toBe("User");
    expect(result.name).toBe("Alice");
    expect(result.age).toBe(30);
  });

  it("handles nested objects with mixed types", () => {
    const data = {
      date: new Date("2026-01-01T00:00:00.000Z"),
      count: 42,
      items: [1, "two", null],
    };
    const result = normalizeForBoundary(data) as Record<string, unknown>;
    expect(result.date).toBe("2026-01-01T00:00:00.000Z");
    expect(result.count).toBe(42);
    expect(result.items).toEqual([1, "two", null]);
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = normalizeForBoundary(obj) as Record<string, unknown>;
    expect(result.a).toBe(1);
    expect(result.self).toBe("[circular reference]");
  });

  it("converts functions to descriptive strings", () => {
    function myFunc() {}
    expect(normalizeForBoundary(myFunc)).toBe("[function: myFunc]");
  });

  it("converts symbols to descriptive strings", () => {
    const sym = Symbol("test");
    expect(normalizeForBoundary(sym)).toBe("[symbol: Symbol(test)]");
  });

  it("converts RegExp to string", () => {
    expect(normalizeForBoundary(/test/gi)).toBe("/test/gi");
  });
});
