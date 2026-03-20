"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { DebugEntry, DebugLevel, DebugPanelProps } from "./types";
import { DebugPanel } from "./DebugPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebugContextValue {
  entries: DebugEntry[];
  addEntry: (entry: DebugEntry) => void;
}

interface UseDebugReturn {
  /** Add an info-level entry from the client side. */
  log: (label: string, data: unknown) => void;
  /** Add a warn-level entry from the client side. */
  warn: (label: string, data: unknown) => void;
  /** Add an error-level entry from the client side. */
  error: (label: string, data: unknown) => void;
  /** Add a success-level entry from the client side. */
  success: (label: string, data: unknown) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const DebugContext = createContext<DebugContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

let counter = 0;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  counter += 1;
  return `nsd-${Date.now()}-${counter}`;
}

function computeSize(data: unknown): number {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

function createEntry(
  label: string,
  data: unknown,
  level: DebugLevel
): DebugEntry {
  return {
    id: generateId(),
    label,
    data,
    level,
    source: "client",
    timestamp: new Date().toISOString(),
    size: computeSize(data),
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * Context provider that accumulates debug entries from anywhere in the React tree.
 * Server-side entries are passed via `initialEntries`. Client-side entries can be
 * added via the `useDebug()` hook.
 *
 * Renders a `DebugPanel` automatically with all accumulated entries.
 */
export function DebugProvider({
  children,
  initialEntries = [],
  panelProps = {},
}: {
  children: ReactNode;
  initialEntries?: DebugEntry[];
  panelProps?: Omit<DebugPanelProps, "entries">;
}): ReactNode {
  const [clientEntries, setClientEntries] = useState<DebugEntry[]>([]);

  const addEntry = useCallback((entry: DebugEntry) => {
    setClientEntries((prev) => [...prev, entry]);
  }, []);

  const allEntries = [...initialEntries, ...clientEntries];

  return (
    <DebugContext.Provider value={{ entries: allEntries, addEntry }}>
      {children}
      <DebugPanel entries={allEntries} {...panelProps} />
    </DebugContext.Provider>
  );
}

/**
 * Hook to add debug entries from any client component within a `DebugProvider`.
 * Useful for logging hydration results, client-side fetch responses, etc.
 *
 * @throws If used outside a `DebugProvider`
 */
export function useDebug(): UseDebugReturn {
  const ctx = useContext(DebugContext);
  if (!ctx) {
    throw new Error(
      "useDebug() must be used within a <DebugProvider>. " +
        "Wrap your component tree with <DebugProvider> to use this hook."
    );
  }

  const { addEntry } = ctx;

  return {
    log: useCallback(
      (label: string, data: unknown) => addEntry(createEntry(label, data, "info")),
      [addEntry]
    ),
    warn: useCallback(
      (label: string, data: unknown) => addEntry(createEntry(label, data, "warn")),
      [addEntry]
    ),
    error: useCallback(
      (label: string, data: unknown) => addEntry(createEntry(label, data, "error")),
      [addEntry]
    ),
    success: useCallback(
      (label: string, data: unknown) => addEntry(createEntry(label, data, "success")),
      [addEntry]
    ),
  };
}
