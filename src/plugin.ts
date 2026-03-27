import type { DebugConfig, PerformanceThresholds } from "./types";
import { debugStore } from "./store";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Options for `withServerDebug()` Next.js config wrapper.
 */
export interface ServerDebugOptions {
  /** Whether debug tracking is enabled. Default: `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean;
  /** Performance thresholds for smart highlighting. */
  thresholds?: Partial<PerformanceThresholds>;
  /** Whether to auto-instrument fetch calls. Default: `true`. */
  autoInstrumentFetch?: boolean;
  /** Whether to log entries to the terminal. Default: `true`. */
  terminalLogging?: boolean;
  /** Maximum number of entries to retain per request. Default: `500`. */
  maxEntriesPerRequest?: number;
}

// ─── Next.js Config Plugin ──────────────────────────────────────────────────

/**
 * Wrap your `next.config.js` to enable next-server-debug with zero-config.
 * Configures the global debug store and sets up instrumentation.
 *
 * @example
 * ```js
 * // next.config.js
 * import { withServerDebug } from "next-server-debug/plugin";
 *
 * const nextConfig = { /* your config *\/ };
 * export default withServerDebug(nextConfig);
 *
 * // With options:
 * export default withServerDebug(nextConfig, {
 *   thresholds: { slow: 300, critical: 2000 },
 *   autoInstrumentFetch: true,
 * });
 * ```
 *
 * @param nextConfig - Your existing Next.js configuration object
 * @param options    - Optional debug configuration overrides
 * @returns The augmented Next.js configuration
 */
export function withServerDebug<T extends Record<string, unknown>>(
  nextConfig: T,
  options?: ServerDebugOptions
): T {
  // Skip in production
  if (process.env.NODE_ENV === "production") {
    return nextConfig;
  }

  // Apply configuration to global store
  const configUpdate: Partial<DebugConfig> = {};

  if (options?.enabled !== undefined) {
    configUpdate.enabled = options.enabled;
  }
  if (options?.thresholds) {
    configUpdate.thresholds = options.thresholds as PerformanceThresholds;
  }
  if (options?.autoInstrumentFetch !== undefined) {
    configUpdate.autoInstrumentFetch = options.autoInstrumentFetch;
  }
  if (options?.terminalLogging !== undefined) {
    configUpdate.terminalLogging = options.terminalLogging;
  }
  if (options?.maxEntriesPerRequest !== undefined) {
    configUpdate.maxEntriesPerRequest = options.maxEntriesPerRequest;
  }

  if (Object.keys(configUpdate).length > 0) {
    debugStore.configure(configUpdate);
  }

  return nextConfig;
}
