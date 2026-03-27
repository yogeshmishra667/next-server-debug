// ─── Shared Span Tree Builder ───────────────────────────────────────────────
// Pure function with no server deps — safe for both client and server imports.

import type { DebugEntry, DebugSpanNode } from "./types";

/**
 * Build a hierarchical tree of spans from a flat list of entries.
 * Entries with `parentId` are nested under their parent.
 */
export function buildSpanTree(entries: DebugEntry[]): DebugSpanNode[] {
  const nodeMap = new Map<string, DebugSpanNode>();
  const roots: DebugSpanNode[] = [];

  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [], depth: 0 });
  }

  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (entry.parentId && nodeMap.has(entry.parentId)) {
      const parent = nodeMap.get(entry.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
