import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDebugLogging, createPrismaDebugExtension } from "../src/prisma";
import { createDebugger } from "../src/debug.server";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("withDebugLogging", () => {
  it("returns an object with the expected Prisma extension shape", () => {
    const debug = createDebugger("test");
    const ext = withDebugLogging(debug);

    expect(ext).toHaveProperty("query");
    expect(ext.query).toHaveProperty("$allModels");
    expect(ext.query.$allModels).toHaveProperty("$allOperations");
    expect(typeof ext.query.$allModels.$allOperations).toBe("function");
  });

  it("logs a perf entry with timing after a successful query", async () => {
    const debug = createDebugger("test");
    const ext = withDebugLogging(debug);
    const mockQuery = vi.fn().mockResolvedValue([{ id: 1, name: "Alice" }]);

    const result = await ext.query.$allModels.$allOperations({
      model: "User",
      operation: "findMany",
      args: { where: { active: true } },
      query: mockQuery,
    });

    expect(result).toEqual([{ id: 1, name: "Alice" }]);
    expect(mockQuery).toHaveBeenCalledWith({ where: { active: true } });
    expect(debug.count).toBe(1);
    expect(debug.entries[0].level).toBe("perf");
    expect(debug.entries[0].label).toBe("User.findMany");
    expect(debug.entries[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs an error entry and re-throws on query failure", async () => {
    const debug = createDebugger("test");
    const ext = withDebugLogging(debug);
    const mockQuery = vi.fn().mockRejectedValue(new Error("connection lost"));

    await expect(
      ext.query.$allModels.$allOperations({
        model: "Post",
        operation: "create",
        args: { data: {} },
        query: mockQuery,
      })
    ).rejects.toThrow("connection lost");

    expect(debug.count).toBe(1);
    expect(debug.entries[0].level).toBe("error");
    expect(debug.entries[0].label).toBe("Post.create");
  });

  it("handles operations without a model name", async () => {
    const debug = createDebugger("test");
    const ext = withDebugLogging(debug);
    const mockQuery = vi.fn().mockResolvedValue(5);

    await ext.query.$allModels.$allOperations({
      operation: "$queryRaw",
      args: {},
      query: mockQuery,
    });

    expect(debug.entries[0].label).toBe("$queryRaw");
  });
});

describe("createPrismaDebugExtension", () => {
  it("returns an extension and getEntries function", () => {
    const { extension, getEntries } = createPrismaDebugExtension();
    expect(extension).toHaveProperty("query");
    expect(typeof getEntries).toBe("function");
    expect(getEntries()).toEqual([]);
  });

  it("collects entries from queries", async () => {
    const { extension, getEntries } = createPrismaDebugExtension("db");
    const mockQuery = vi.fn().mockResolvedValue({ id: 1 });

    await extension.query.$allModels.$allOperations({
      model: "User",
      operation: "findFirst",
      args: {},
      query: mockQuery,
    });

    const entries = getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("db");
  });
});
