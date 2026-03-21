import type { Debugger, DebugEntry } from "./types";
import { createDebugger, safeSerialize } from "./debug.server";

/**
 * A Drizzle-compatible logger that auto-logs SQL queries to a debugger instance.
 * Implements the `{ logQuery(query, params): void }` interface expected by Drizzle ORM.
 *
 * @example
 * ```ts
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { createDebugger } from "next-server-debug/server";
 * import { DebugLogger } from "next-server-debug/drizzle";
 *
 * const debug = createDebugger("db");
 * const db = drizzle(pool, { logger: new DebugLogger(debug) });
 * ```
 */
export class DebugLogger {
  private debuggerInstance: Debugger;

  constructor(debuggerInstance: Debugger) {
    this.debuggerInstance = debuggerInstance;
  }

  /**
   * Log a SQL query. Called automatically by Drizzle for every query.
   *
   * @param query  - The SQL query string
   * @param params - The bound parameters
   */
  logQuery(query: string, params: unknown[]): void {
    this.debuggerInstance.log(
      "SQL Query",
      {
        query,
        params: safeSerialize(params),
      },
      ["drizzle", "sql"]
    );
  }
}

/**
 * Create a standalone Drizzle debug logger with its own debugger.
 * Returns the logger instance and collected entries.
 *
 * @example
 * ```ts
 * const { logger, getEntries } = createDrizzleDebugLogger("db/drizzle");
 * const db = drizzle(pool, { logger });
 * // Later: pass getEntries() to DebugPanel
 * ```
 *
 * @param source - Source identifier for entries (default: `"drizzle"`)
 * @returns Object with `logger` for Drizzle config and `getEntries()` to retrieve collected entries
 */
export function createDrizzleDebugLogger(source: string = "drizzle"): {
  logger: DebugLogger;
  getEntries: () => DebugEntry[];
} {
  const debuggerInstance = createDebugger(source);
  return {
    logger: new DebugLogger(debuggerInstance),
    getEntries: () => debuggerInstance.entries,
  };
}
