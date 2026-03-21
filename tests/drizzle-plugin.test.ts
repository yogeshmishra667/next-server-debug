import { describe, it, expect, vi, beforeEach } from "vitest";
import { DebugLogger, createDrizzleDebugLogger } from "../src/drizzle";
import { createDebugger } from "../src/debug.server";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DebugLogger", () => {
  it("logs a SQL query as an info entry", () => {
    const debug = createDebugger("test");
    const logger = new DebugLogger(debug);

    logger.logQuery("SELECT * FROM users WHERE id = $1", [42]);

    expect(debug.count).toBe(1);
    expect(debug.entries[0].level).toBe("info");
    expect(debug.entries[0].label).toBe("SQL Query");
    const data = debug.entries[0].data as { query: string; params: unknown[] };
    expect(data.query).toBe("SELECT * FROM users WHERE id = $1");
    expect(data.params).toEqual([42]);
  });

  it("includes drizzle and sql tags", () => {
    const debug = createDebugger("test");
    const logger = new DebugLogger(debug);

    logger.logQuery("INSERT INTO posts VALUES ($1)", ["hello"]);

    expect(debug.entries[0].tags).toEqual(["drizzle", "sql"]);
  });

  it("handles empty params array", () => {
    const debug = createDebugger("test");
    const logger = new DebugLogger(debug);

    logger.logQuery("SELECT 1", []);

    const data = debug.entries[0].data as { query: string; params: unknown[] };
    expect(data.params).toEqual([]);
  });

  it("serializes complex params safely", () => {
    const debug = createDebugger("test");
    const logger = new DebugLogger(debug);

    logger.logQuery("SELECT * FROM data WHERE json = $1", [
      { nested: { deep: true } },
    ]);

    expect(debug.count).toBe(1);
    const data = debug.entries[0].data as { params: unknown[] };
    expect(data.params).toEqual([{ nested: { deep: true } }]);
  });
});

describe("createDrizzleDebugLogger", () => {
  it("returns a logger and getEntries function", () => {
    const { logger, getEntries } = createDrizzleDebugLogger();
    expect(logger).toBeInstanceOf(DebugLogger);
    expect(typeof getEntries).toBe("function");
    expect(getEntries()).toEqual([]);
  });

  it("collects entries from logged queries", () => {
    const { logger, getEntries } = createDrizzleDebugLogger("db");

    logger.logQuery("SELECT 1", []);
    logger.logQuery("SELECT 2", []);

    const entries = getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].source).toBe("db");
    expect(entries[1].source).toBe("db");
  });
});
