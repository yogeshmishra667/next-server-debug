import { describe, it, expect, vi, beforeEach } from "vitest";
import { debugStore, debug, debugTimed, buildSpanTree } from "../src/store";
import type { DebugEntry } from "../src/types";

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  debugStore.clearEntries();
});

// ─── debugStore.runWithContext ───────────────────────────────────────────────

describe("debugStore.runWithContext", () => {
  it("creates a request context with requestId and traceId", () => {
    debugStore.runWithContext(() => {
      const ctx = debugStore.getContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.requestId).toBeDefined();
      expect(ctx!.traceId).toBeDefined();
      expect(ctx!.entries).toEqual([]);
    });
  });

  it("uses provided traceId when given", () => {
    debugStore.runWithContext(() => {
      const ctx = debugStore.getContext();
      expect(ctx!.traceId).toBe("my-trace-123");
    }, "my-trace-123");
  });

  it("returns null context outside of runWithContext", () => {
    expect(debugStore.getContext()).toBeNull();
    expect(debugStore.getRequestId()).toBeNull();
    expect(debugStore.getTraceId()).toBeNull();
  });
});

// ─── debugStore.addEntry ────────────────────────────────────────────────────

describe("debugStore.addEntry", () => {
  function makeEntry(overrides: Partial<DebugEntry> = {}): DebugEntry {
    return {
      id: `entry-${Math.random().toString(36).slice(2, 8)}`,
      label: "test",
      data: {},
      level: "info",
      source: "test.ts",
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it("stamps entries with requestId and traceId inside a context", () => {
    debugStore.runWithContext(() => {
      const entry = makeEntry();
      debugStore.addEntry(entry);

      expect(entry.requestId).toBeDefined();
      expect(entry.traceId).toBeDefined();
    });
  });

  it("collects entries within request context", () => {
    debugStore.runWithContext(() => {
      debugStore.addEntry(makeEntry({ label: "a" }));
      debugStore.addEntry(makeEntry({ label: "b" }));

      const entries = debugStore.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].label).toBe("a");
      expect(entries[1].label).toBe("b");
    });
  });

  it("collects entries in global pool outside context", () => {
    const entry = makeEntry({ label: "global" });
    debugStore.addEntry(entry);

    const entries = debugStore.getGlobalEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("global");
    expect(entries[0].requestId).toBeUndefined();
  });

  it("respects maxEntriesPerRequest limit", () => {
    debugStore.configure({ maxEntriesPerRequest: 3 });

    debugStore.runWithContext(() => {
      for (let i = 0; i < 10; i++) {
        debugStore.addEntry(makeEntry({ label: `entry-${i}` }));
      }
      expect(debugStore.getEntries()).toHaveLength(3);
    });

    // Reset config
    debugStore.configure({ maxEntriesPerRequest: 500 });
  });
});

// ─── debugStore.withSpan ────────────────────────────────────────────────────

describe("debugStore.withSpan", () => {
  function makeEntry(overrides: Partial<DebugEntry> = {}): DebugEntry {
    return {
      id: `entry-${Math.random().toString(36).slice(2, 8)}`,
      label: "test",
      data: {},
      level: "info",
      source: "test.ts",
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it("sets parentId on entries created within a span", () => {
    debugStore.runWithContext(() => {
      const parentEntry = makeEntry({ id: "parent-1", label: "parent" });
      debugStore.addEntry(parentEntry);

      debugStore.withSpan(parentEntry, () => {
        const childEntry = makeEntry({ label: "child" });
        debugStore.addEntry(childEntry);
        expect(childEntry.parentId).toBe("parent-1");
      });
    });
  });

  it("restores previous span after withSpan completes", () => {
    debugStore.runWithContext(() => {
      const parentEntry = makeEntry({ id: "parent-1" });
      debugStore.addEntry(parentEntry);

      debugStore.withSpan(parentEntry, () => {
        // Inside span — activeSpanId is parent-1
        const inner = makeEntry({ label: "inside" });
        debugStore.addEntry(inner);
        expect(inner.parentId).toBe("parent-1");
      });

      // Outside span — activeSpanId should be restored to null
      const outer = makeEntry({ label: "outside" });
      debugStore.addEntry(outer);
      expect(outer.parentId).toBeUndefined();
    });
  });
});

// ─── debugStore.configure ───────────────────────────────────────────────────

describe("debugStore.configure", () => {
  it("updates config partially", () => {
    debugStore.configure({ terminalLogging: false });
    const config = debugStore.getConfig();
    expect(config.terminalLogging).toBe(false);
    expect(config.enabled).toBe(true); // unchanged

    // Reset
    debugStore.configure({ terminalLogging: true });
  });

  it("merges thresholds deeply", () => {
    debugStore.configure({ thresholds: { slow: 300 } as never });
    const config = debugStore.getConfig();
    expect(config.thresholds.slow).toBe(300);
    expect(config.thresholds.critical).toBe(1000); // unchanged

    // Reset
    debugStore.configure({ thresholds: { slow: 200 } as never });
  });
});

// ─── buildSpanTree ──────────────────────────────────────────────────────────

describe("buildSpanTree", () => {
  it("builds a flat list as root nodes when no parentId", () => {
    const entries: DebugEntry[] = [
      { id: "1", label: "a", data: {}, level: "info", source: "x", timestamp: "" },
      { id: "2", label: "b", data: {}, level: "info", source: "x", timestamp: "" },
    ];
    const tree = buildSpanTree(entries);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
    expect(tree[1].children).toHaveLength(0);
  });

  it("nests children under their parent", () => {
    const entries: DebugEntry[] = [
      { id: "root", label: "root", data: {}, level: "info", source: "x", timestamp: "" },
      { id: "child1", label: "child1", data: {}, level: "info", source: "x", timestamp: "", parentId: "root" },
      { id: "child2", label: "child2", data: {}, level: "info", source: "x", timestamp: "", parentId: "root" },
    ];
    const tree = buildSpanTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].entry.id).toBe("root");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it("handles deeply nested spans", () => {
    const entries: DebugEntry[] = [
      { id: "a", label: "a", data: {}, level: "info", source: "x", timestamp: "" },
      { id: "b", label: "b", data: {}, level: "info", source: "x", timestamp: "", parentId: "a" },
      { id: "c", label: "c", data: {}, level: "info", source: "x", timestamp: "", parentId: "b" },
    ];
    const tree = buildSpanTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].entry.id).toBe("c");
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("handles orphan entries (parentId not in list)", () => {
    const entries: DebugEntry[] = [
      { id: "orphan", label: "orphan", data: {}, level: "info", source: "x", timestamp: "", parentId: "nonexistent" },
    ];
    const tree = buildSpanTree(entries);
    expect(tree).toHaveLength(1); // becomes root since parent doesn't exist
  });
});

// ─── debug() unified API ────────────────────────────────────────────────────

describe("debug() unified API", () => {
  it("creates an entry and registers it in the global store", () => {
    debugStore.runWithContext(() => {
      const entry = debug("test entry", { foo: "bar" });
      expect(entry.label).toBe("test entry");
      expect(entry.requestId).toBeDefined();
      expect(entry.level).toBe("info");

      const entries = debugStore.getEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("supports custom level and tags", () => {
    debugStore.runWithContext(() => {
      const entry = debug("warn msg", { x: 1 }, "warn", ["db"]);
      expect(entry.level).toBe("warn");
      expect(entry.tags).toEqual(["db"]);
    });
  });
});

// ─── debugTimed() ───────────────────────────────────────────────────────────

describe("debugTimed()", () => {
  it("times an async operation and returns the result", async () => {
    const result = await debugStore.runWithContext(async () => {
      return debugTimed("fetch users", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return [{ id: 1 }];
      });
    });

    expect(result).toEqual([{ id: 1 }]);
  });

  it("creates an error entry when fn throws", async () => {
    await expect(
      debugStore.runWithContext(async () => {
        return debugTimed("failing op", async () => {
          throw new Error("boom");
        });
      })
    ).rejects.toThrow("boom");
  });
});
