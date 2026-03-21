import type { Debugger, DebugEntry } from "./types";
import { createDebugger, safeSerialize } from "./debug.server";

/**
 * Query operation parameters passed to the Prisma extension callback.
 * Uses `unknown` for Prisma-specific types to avoid a hard dependency on `@prisma/client`.
 */
interface PrismaQueryArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * Create a Prisma `$extends` client extension that auto-logs all queries
 * with timing data to an existing debugger instance.
 *
 * @example
 * ```ts
 * import { PrismaClient } from "@prisma/client";
 * import { createDebugger } from "next-server-debug/server";
 * import { withDebugLogging } from "next-server-debug/prisma";
 *
 * const debug = createDebugger("db");
 * const prisma = new PrismaClient().$extends(withDebugLogging(debug));
 * ```
 *
 * @param debuggerInstance - A `Debugger` instance from `createDebugger()`
 * @returns A Prisma client extension object for use with `$extends()`
 */
export function withDebugLogging(debuggerInstance: Debugger): {
  query: {
    $allModels: {
      $allOperations: (args: PrismaQueryArgs) => Promise<unknown>;
    };
  };
} {
  return {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: PrismaQueryArgs): Promise<unknown> {
          const label = model ? `${model}.${operation}` : operation;
          const start = performance.now();
          try {
            const result = await query(args);
            const durationMs =
              Math.round((performance.now() - start) * 100) / 100;
            debuggerInstance.perf(
              label,
              {
                model: model ?? null,
                operation,
                args: safeSerialize(args),
                durationMs,
              },
              durationMs
            );
            return result;
          } catch (error: unknown) {
            const durationMs =
              Math.round((performance.now() - start) * 100) / 100;
            debuggerInstance.error(label, {
              model: model ?? null,
              operation,
              args: safeSerialize(args),
              error: error instanceof Error ? error.message : String(error),
              durationMs,
            });
            throw error;
          }
        },
      },
    },
  };
}

/**
 * Create a standalone Prisma debug extension with its own debugger.
 * Returns the extension object and collected entries.
 *
 * @example
 * ```ts
 * const { extension, getEntries } = createPrismaDebugExtension("db/prisma");
 * const prisma = new PrismaClient().$extends(extension);
 * // Later: pass getEntries() to DebugPanel
 * ```
 *
 * @param source - Source identifier for entries (default: `"prisma"`)
 * @returns Object with `extension` for `$extends()` and `getEntries()` to retrieve collected entries
 */
export function createPrismaDebugExtension(source: string = "prisma"): {
  extension: ReturnType<typeof withDebugLogging>;
  getEntries: () => DebugEntry[];
} {
  const debuggerInstance = createDebugger(source);
  return {
    extension: withDebugLogging(debuggerInstance),
    getEntries: () => debuggerInstance.entries,
  };
}
