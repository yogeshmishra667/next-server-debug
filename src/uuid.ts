// ─── Edge-Compatible ID Generator ──────────────────────────────────────────

/**
 * Generate a unique ID string safely across Node.js, Edge, and Browser runtimes.
 * Avoids importing `node:crypto` which can cause bundler or edge runtime warnings.
 */
export function generateId(): string {
  // Use Web Crypto API if available (Node 19+, Edge Runtime, Browser)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback for older environments or minimal edge runtimes
  return (
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
}
