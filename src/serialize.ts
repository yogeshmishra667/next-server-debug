// ─── Shared Serialization Utilities ─────────────────────────────────────────
// Single source of truth — imported by store.ts and debug.server.ts.
// NO imports from store or debug.server to avoid circular deps.

const MAX_SERIALIZABLE_SIZE = 50 * 1024; // 50KB

/**
 * Safely serialize data, handling circular references, BigInt, Date,
 * RegExp, Error, Symbol, and functions. Returns a JSON-safe value.
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

/**
 * Serialize + compute byte size in a single pass.
 * Avoids double JSON.stringify.
 */
export function safeSerializeWithSize(data: unknown): { value: unknown; size: number } {
  try {
    const json = JSON.stringify(data);
    if (json.length > MAX_SERIALIZABLE_SIZE) {
      return { value: `[truncated: ${json.length} bytes]`, size: json.length };
    }
    return { value: JSON.parse(json) as unknown, size: json.length };
  } catch {
    const value = walkAndSerialize(data, new WeakSet());
    return { value, size: computeSize(value) };
  }
}

function walkAndSerialize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return `[function: ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return `[symbol: ${value.toString()}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) {
    return { __type: "Error", name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular reference]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => walkAndSerialize(item, seen));
  }

  const result: Record<string, unknown> = {};
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== null && proto !== Object.prototype && proto.constructor?.name) {
    result.__type = proto.constructor.name;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    result[key] = walkAndSerialize((value as Record<string, unknown>)[key], seen);
  }
  return result;
}

/**
 * Compute the byte size of a serialized value.
 * Prefer `safeSerializeWithSize` to avoid double-stringify.
 */
export function computeSize(data: unknown): number {
  try { return JSON.stringify(data).length; } catch { return 0; }
}
