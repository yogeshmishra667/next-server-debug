"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { DebugEntry, DebugLevel, DebugPanelProps } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

const FONT_FAMILY =
  "'Geist Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const PANEL_WIDTH = 480;
const SNAP_THRESHOLD = 20;
const STORAGE_KEY = "next-server-debug-position";

const LEVEL_COLORS: Record<DebugLevel, string> = {
  info: "#3b82f6",
  warn: "#f59e0b",
  error: "#ef4444",
  success: "#22c55e",
  perf: "#a78bfa",
};

const LEVEL_ORDER: DebugLevel[] = ["info", "warn", "error", "success", "perf"];

interface ThemeColors {
  panelBg: string;
  headerBg: string;
  rowHover: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  jsonString: string;
  jsonKey: string;
  jsonNumber: string;
  jsonBoolean: string;
  jsonNull: string;
  shadow: string;
}

const DARK_THEME: ThemeColors = {
  panelBg: "#0a0a0b",
  headerBg: "#111114",
  rowHover: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.08)",
  textPrimary: "rgba(255,255,255,0.88)",
  textSecondary: "rgba(255,255,255,0.45)",
  textMuted: "rgba(255,255,255,0.22)",
  jsonString: "#6ee7b7",
  jsonKey: "#93c5fd",
  jsonNumber: "#fbbf24",
  jsonBoolean: "#f472b6",
  jsonNull: "rgba(255,255,255,0.3)",
  shadow:
    "0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
};

const LIGHT_THEME: ThemeColors = {
  panelBg: "#ffffff",
  headerBg: "#f8f9fa",
  rowHover: "rgba(0,0,0,0.03)",
  border: "rgba(0,0,0,0.1)",
  textPrimary: "rgba(0,0,0,0.88)",
  textSecondary: "rgba(0,0,0,0.45)",
  textMuted: "rgba(0,0,0,0.22)",
  jsonString: "#059669",
  jsonKey: "#2563eb",
  jsonNumber: "#d97706",
  jsonBoolean: "#db2777",
  jsonNull: "rgba(0,0,0,0.3)",
  shadow:
    "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.06)",
};

const EXPANDED_TINTS: Partial<Record<DebugLevel, string>> = {
  warn: "rgba(245,158,11,0.04)",
  error: "rgba(239,68,68,0.05)",
};

// Static CSS for animations and scrollbar styling.
// This string contains NO user input — it is a compile-time constant.
const STATIC_PANEL_CSS = `
@keyframes nsd-slideIn {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes nsd-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}
.nsd-scrollbar::-webkit-scrollbar { width: 6px; }
.nsd-scrollbar::-webkit-scrollbar-track { background: transparent; }
.nsd-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(128,128,128,0.25);
  border-radius: 3px;
}
.nsd-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(128,128,128,0.45);
}
`;

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getFilename(source: string): string {
  const segments = source.split("/");
  return segments[segments.length - 1] || source;
}

function copyToClipboard(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      /* silently fail */
    });
  }
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function ChevronDown({ size = 12, color = "currentColor" }: { size?: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRight({ size = 10, color = "currentColor" }: { size?: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TrashIcon({ size = 12, color = "currentColor" }: { size?: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CopyIcon({ size = 12, color = "currentColor" }: { size?: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TerminalIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function SearchIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ─── JSON Renderer ───────────────────────────────────────────────────────────

interface JsonRendererProps {
  data: unknown;
  theme: ThemeColors;
  depth?: number;
  maxDepth?: number;
}

function JsonRenderer({
  data,
  theme,
  depth = 0,
  maxDepth = 8,
}: JsonRendererProps): ReactNode {
  if (depth > maxDepth) {
    return (
      <span style={{ color: theme.textMuted, fontStyle: "italic" }}>
        [max depth reached]
      </span>
    );
  }

  if (data === null) {
    return <span style={{ color: theme.jsonNull }}>null</span>;
  }

  if (data === undefined) {
    return <span style={{ color: theme.jsonNull }}>undefined</span>;
  }

  if (typeof data === "boolean") {
    return (
      <span style={{ color: theme.jsonBoolean }}>
        {data ? "true" : "false"}
      </span>
    );
  }

  if (typeof data === "number") {
    return <span style={{ color: theme.jsonNumber }}>{data}</span>;
  }

  if (typeof data === "string") {
    return <JsonString value={data} theme={theme} />;
  }

  if (Array.isArray(data)) {
    return (
      <JsonArray data={data} theme={theme} depth={depth} maxDepth={maxDepth} />
    );
  }

  if (typeof data === "object") {
    return (
      <JsonObject
        data={data as Record<string, unknown>}
        theme={theme}
        depth={depth}
        maxDepth={maxDepth}
      />
    );
  }

  return <span style={{ color: theme.textPrimary }}>{String(data)}</span>;
}

function JsonString({
  value,
  theme,
}: {
  value: string;
  theme: ThemeColors;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const isLong = value.length > 100;
  const display = isLong && !expanded ? value.slice(0, 100) : value;

  return (
    <span style={{ color: theme.jsonString }}>
      &quot;{display}
      {isLong && !expanded && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          style={{
            color: theme.textSecondary,
            cursor: "pointer",
            textDecoration: "underline",
            marginLeft: 2,
          }}
        >
          ...show more ({value.length} chars)
        </span>
      )}
      {isLong && expanded && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          style={{
            color: theme.textSecondary,
            cursor: "pointer",
            textDecoration: "underline",
            marginLeft: 2,
          }}
        >
          {" "}
          show less
        </span>
      )}
      &quot;
    </span>
  );
}

function JsonArray({
  data,
  theme,
  depth,
  maxDepth,
}: {
  data: unknown[];
  theme: ThemeColors;
  depth: number;
  maxDepth: number;
}): ReactNode {
  const [showAll, setShowAll] = useState(false);
  const limit = 20;
  const hasMore = data.length > limit;
  const visibleItems = hasMore && !showAll ? data.slice(0, limit) : data;
  const indent = "  ".repeat(depth + 1);
  const closingIndent = "  ".repeat(depth);

  if (data.length === 0) {
    return <span style={{ color: theme.textMuted }}>[]</span>;
  }

  return (
    <span>
      <span style={{ color: theme.textSecondary }}>[</span>
      {"\n"}
      {visibleItems.map((item, i) => (
        <span key={i}>
          {indent}
          <JsonRenderer data={item} theme={theme} depth={depth + 1} maxDepth={maxDepth} />
          {i < visibleItems.length - 1 && (
            <span style={{ color: theme.textSecondary }}>,</span>
          )}
          {"\n"}
        </span>
      ))}
      {hasMore && !showAll && (
        <span>
          {indent}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            style={{
              color: theme.textSecondary,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ...{data.length - limit} more items
          </span>
          {"\n"}
        </span>
      )}
      {closingIndent}
      <span style={{ color: theme.textSecondary }}>]</span>
    </span>
  );
}

function JsonObject({
  data,
  theme,
  depth,
  maxDepth,
}: {
  data: Record<string, unknown>;
  theme: ThemeColors;
  depth: number;
  maxDepth: number;
}): ReactNode {
  const [showAll, setShowAll] = useState(false);
  const keys = Object.keys(data);
  const limit = 20;
  const hasMore = keys.length > limit;
  const visibleKeys = hasMore && !showAll ? keys.slice(0, limit) : keys;
  const indent = "  ".repeat(depth + 1);
  const closingIndent = "  ".repeat(depth);

  if (keys.length === 0) {
    return <span style={{ color: theme.textMuted }}>{"{}"}</span>;
  }

  return (
    <span>
      <span style={{ color: theme.textSecondary }}>{"{"}</span>
      {"\n"}
      {visibleKeys.map((key, i) => (
        <span key={key}>
          {indent}
          <span style={{ color: theme.jsonKey }}>&quot;{key}&quot;</span>
          <span style={{ color: theme.textSecondary }}>: </span>
          <JsonRenderer
            data={data[key]}
            theme={theme}
            depth={depth + 1}
            maxDepth={maxDepth}
          />
          {i < visibleKeys.length - 1 && (
            <span style={{ color: theme.textSecondary }}>,</span>
          )}
          {"\n"}
        </span>
      ))}
      {hasMore && !showAll && (
        <span>
          {indent}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            style={{
              color: theme.textSecondary,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ...{keys.length - limit} more keys
          </span>
          {"\n"}
        </span>
      )}
      {closingIndent}
      <span style={{ color: theme.textSecondary }}>{"}"}</span>
    </span>
  );
}

// ─── Entry Row ───────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: DebugEntry;
  theme: ThemeColors;
  showRelativeTime: boolean;
  onToggleTimeFormat: () => void;
}

function EntryRow({
  entry,
  theme,
  showRelativeTime,
  onToggleTimeFormat,
}: EntryRowProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const levelColor = LEVEL_COLORS[entry.level];
  const tint = expanded ? EXPANDED_TINTS[entry.level] : undefined;

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      copyToClipboard(JSON.stringify(entry.data, null, 2));
    },
    [entry.data]
  );

  return (
    <div
      onContextMenu={handleContextMenu}
      style={{
        borderBottom: `1px solid ${theme.border}`,
        background: hovered && !expanded ? theme.rowHover : tint || "transparent",
        animation: "nsd-slideIn 0.15s ease-out",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          cursor: "pointer",
          userSelect: "none",
          fontFamily: FONT_FAMILY,
          fontSize: 11,
          lineHeight: "18px",
        }}
      >
        {/* Expand arrow */}
        <span
          style={{
            color: theme.textMuted,
            flexShrink: 0,
            transition: "transform 0.15s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-flex",
          }}
        >
          <ChevronRight size={10} color={theme.textMuted} />
        </span>

        {/* Level badge */}
        <span
          style={{
            background: levelColor,
            color: "#fff",
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            padding: "1px 5px",
            borderRadius: 3,
            letterSpacing: "0.5px",
            flexShrink: 0,
          }}
        >
          {entry.level}
        </span>

        {/* Label */}
        <span
          style={{
            color: theme.textPrimary,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.label}
        </span>

        {/* Source filename */}
        <span
          style={{
            color: theme.textMuted,
            fontSize: 9,
            flexShrink: 0,
          }}
        >
          {getFilename(entry.source)}
        </span>

        {/* Duration */}
        {entry.durationMs != null && (
          <span
            style={{
              color: theme.textSecondary,
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            {entry.durationMs}ms
          </span>
        )}

        {/* Timestamp */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleTimeFormat();
          }}
          style={{
            color: theme.textMuted,
            fontSize: 9,
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          {showRelativeTime
            ? formatRelativeTime(entry.timestamp)
            : formatTime(entry.timestamp)}
        </span>
      </div>

      {/* Expanded JSON view */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: expanded ? 600 : 0,
          transition: "max-height 0.2s ease",
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: "8px 12px 8px 36px",
            fontFamily: FONT_FAMILY,
            fontSize: 11,
            lineHeight: "16px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: tint || "transparent",
          }}
        >
          <JsonRenderer data={entry.data} theme={theme} />
        </pre>
      </div>
    </div>
  );
}

// ─── Main DebugPanel ─────────────────────────────────────────────────────────

export function DebugPanel({
  entries,
  position = "bottom-right",
  defaultCollapsed = false,
  title = "server debug",
  theme: themeProp = "dark",
  maxHeight = 360,
  opacity = 0.97,
}: DebugPanelProps): ReactNode {
  // Production guard
  if (process.env.NODE_ENV === "production") return null;

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState<DebugLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [showRelativeTime, setShowRelativeTime] = useState(false);
  const [copiedGreen, setCopiedGreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(
    themeProp === "auto" ? "dark" : themeProp
  );
  const [internalEntries, setInternalEntries] = useState<DebugEntry[]>(entries);
  const [styleInjected, setStyleInjected] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const autoScroll = useRef(true);

  // Inject styles once via DOM API (avoids dangerouslySetInnerHTML)
  useEffect(() => {
    if (styleInjected || typeof document === "undefined") return;
    const id = "nsd-panel-styles";
    if (document.getElementById(id)) {
      setStyleInjected(true);
      return;
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = STATIC_PANEL_CSS;
    document.head.appendChild(style);
    setStyleInjected(true);
  }, [styleInjected]);

  // Sync external entries
  useEffect(() => {
    setInternalEntries(entries);
  }, [entries]);

  // Auto-scroll on new entries
  useEffect(() => {
    if (autoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [internalEntries]);

  // Resolve auto theme
  useEffect(() => {
    if (themeProp !== "auto") {
      setResolvedTheme(themeProp);
      return;
    }
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    setResolvedTheme(mq.matches ? "light" : "dark");
    const handler = (e: MediaQueryListEvent) =>
      setResolvedTheme(e.matches ? "light" : "dark");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeProp]);

  // Load persisted position
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPanelPos(JSON.parse(stored) as { x: number; y: number });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Relative time updater
  useEffect(() => {
    if (!showRelativeTime) return;
    const interval = setInterval(() => {
      setInternalEntries((prev) => [...prev]);
    }, 1000);
    return () => clearInterval(interval);
  }, [showRelativeTime]);

  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;

  // Keyboard shortcuts
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setHidden((h) => !h);
        return;
      }

      if (meta && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (document.activeElement === searchRef.current) {
          setSearch("");
          searchRef.current?.blur();
        } else if (!collapsed) {
          setCollapsed(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [collapsed]);

  // Drag handlers
  const onDragStart = useCallback(
    (e: ReactMouseEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        px: rect.left,
        py: rect.top,
      };

      const onMove = (me: globalThis.MouseEvent) => {
        if (!dragStart.current) return;
        const dx = me.clientX - dragStart.current.x;
        const dy = me.clientY - dragStart.current.y;
        let nx = dragStart.current.px + dx;
        let ny = dragStart.current.py + dy;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (nx < SNAP_THRESHOLD) nx = 0;
        if (ny < SNAP_THRESHOLD) ny = 0;
        if (nx + PANEL_WIDTH > vw - SNAP_THRESHOLD) nx = vw - PANEL_WIDTH;
        if (ny + 40 > vh - SNAP_THRESHOLD) ny = vh - 40;

        const pos = { x: nx, y: ny };
        setPanelPos(pos);
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
        } catch {
          /* ignore */
        }
      };

      const onUp = () => {
        setIsDragging(false);
        dragStart.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    []
  );

  const onListScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScroll.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  // Filter entries
  const filteredEntries = internalEntries.filter((e) => {
    if (filter !== "all" && e.level !== filter) return false;
    if (search && !e.label.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  // Level counts
  const levelCounts = internalEntries.reduce(
    (acc, e) => {
      acc[e.level] = (acc[e.level] || 0) + 1;
      return acc;
    },
    {} as Partial<Record<DebugLevel, number>>
  );

  const totalSize = internalEntries.reduce((sum, e) => sum + (e.size || 0), 0);

  const copyAll = useCallback(
    (entriesToCopy: DebugEntry[]) => {
      copyToClipboard(JSON.stringify(entriesToCopy, null, 2));
    },
    []
  );

  const clearEntries = useCallback(() => {
    setInternalEntries([]);
  }, []);

  if (hidden) return null;

  const positionStyle: CSSProperties = panelPos
    ? { position: "fixed", left: panelPos.x, top: panelPos.y, zIndex: 99999 }
    : {
        position: "fixed",
        zIndex: 99999,
        ...(position.includes("bottom") ? { bottom: 16 } : { top: 16 }),
        ...(position.includes("right") ? { right: 16 } : { left: 16 }),
      };

  const lastTimestamp =
    internalEntries.length > 0
      ? formatTime(internalEntries[internalEntries.length - 1].timestamp)
      : "--:--:--";

  return (
    <div
      ref={panelRef}
      style={{
        ...positionStyle,
        width: PANEL_WIDTH,
        maxWidth: "calc(100vw - 32px)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: theme.shadow,
        opacity,
        fontFamily: FONT_FAMILY,
        fontSize: 11,
        color: theme.textPrimary,
        background: theme.panelBg,
        border: `1px solid ${theme.border}`,
        cursor: isDragging ? "grabbing" : "default",
        userSelect: isDragging ? "none" : "auto",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={onDragStart}
        onClick={() => !isDragging && setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          background: theme.headerBg,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6, marginRight: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#ff5f57",
              display: "inline-block",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#febc2e",
              display: "inline-block",
            }}
          />
          <span
            onClick={(e) => {
              e.stopPropagation();
              copyAll(internalEntries);
              setCopiedGreen(true);
              setTimeout(() => setCopiedGreen(false), 1200);
            }}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#28c840",
              display: "inline-block",
              cursor: "pointer",
              position: "relative",
            }}
            title="Copy all entries as JSON"
          >
            {copiedGreen && (
              <span
                style={{
                  position: "absolute",
                  top: -18,
                  left: -8,
                  fontSize: 9,
                  color: "#28c840",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                Copied!
              </span>
            )}
          </span>
        </div>

        {/* Title */}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 11,
            fontWeight: 500,
            color: theme.textSecondary,
            letterSpacing: "0.5px",
          }}
        >
          {title}
        </span>

        {/* Level count badges */}
        <div style={{ display: "flex", gap: 4, marginRight: 8 }}>
          {LEVEL_ORDER.filter((l) => (levelCounts[l] || 0) > 0).map((l) => (
            <span
              key={l}
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: LEVEL_COLORS[l],
                background: `${LEVEL_COLORS[l]}18`,
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              {levelCounts[l]}
            </span>
          ))}
        </div>

        {/* Collapse chevron */}
        <span
          style={{
            transition: "transform 0.2s ease",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            display: "inline-flex",
            color: theme.textSecondary,
          }}
        >
          <ChevronDown size={12} color={theme.textSecondary} />
        </span>
      </div>

      {/* Collapsible content */}
      <div
        style={{
          maxHeight: collapsed ? 0 : maxHeight + 80,
          overflow: "hidden",
          transition: "max-height 0.2s ease",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 12px",
            borderBottom: `1px solid ${theme.border}`,
            flexWrap: "wrap",
          }}
        >
          {(["all", ...LEVEL_ORDER] as const).map((level) => {
            const count =
              level === "all"
                ? internalEntries.length
                : levelCounts[level] || 0;
            const isActive = filter === level;
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                style={{
                  border: "none",
                  background: isActive
                    ? level === "all"
                      ? theme.textMuted
                      : `${LEVEL_COLORS[level]}25`
                    : "transparent",
                  color: isActive
                    ? level === "all"
                      ? theme.textPrimary
                      : LEVEL_COLORS[level]
                    : theme.textSecondary,
                  fontSize: 9,
                  fontFamily: FONT_FAMILY,
                  padding: "2px 6px",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontWeight: isActive ? 600 : 400,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                }}
              >
                {level} {count > 0 ? count : ""}
              </button>
            );
          })}

          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter entries..."
            style={{
              flex: 1,
              minWidth: 80,
              border: `1px solid ${theme.border}`,
              background: "transparent",
              color: theme.textPrimary,
              fontSize: 10,
              fontFamily: FONT_FAMILY,
              padding: "2px 6px",
              borderRadius: 3,
              outline: "none",
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                setSearch("");
                searchRef.current?.blur();
              }
            }}
          />

          <span style={{ color: theme.textMuted, fontSize: 9 }}>
            {filteredEntries.length}/{internalEntries.length}
          </span>

          <button
            onClick={clearEntries}
            title="Clear all entries"
            style={{
              border: "none",
              background: "transparent",
              color: theme.textSecondary,
              cursor: "pointer",
              padding: 2,
              display: "inline-flex",
              borderRadius: 3,
            }}
          >
            <TrashIcon size={12} color={theme.textSecondary} />
          </button>

          <button
            onClick={() => copyAll(filteredEntries)}
            title="Copy filtered entries as JSON"
            style={{
              border: "none",
              background: "transparent",
              color: theme.textSecondary,
              cursor: "pointer",
              padding: 2,
              display: "inline-flex",
              borderRadius: 3,
            }}
          >
            <CopyIcon size={12} color={theme.textSecondary} />
          </button>
        </div>

        {/* Entries list */}
        <div
          ref={listRef}
          className="nsd-scrollbar"
          onScroll={onListScroll}
          style={{
            maxHeight,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {filteredEntries.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 16px",
                color: theme.textMuted,
                gap: 8,
              }}
            >
              {search ? (
                <SearchIcon size={24} color={theme.textMuted} />
              ) : (
                <TerminalIcon size={24} color={theme.textMuted} />
              )}
              <span style={{ fontSize: 11 }}>no entries</span>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                theme={theme}
                showRelativeTime={showRelativeTime}
                onToggleTimeFormat={() => setShowRelativeTime((v) => !v)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 12px",
            borderTop: `1px solid ${theme.border}`,
            fontSize: 9,
            color: theme.textMuted,
          }}
        >
          <span>
            NODE_ENV: {process.env.NODE_ENV} · Next.js · {lastTimestamp}
          </span>
          <span>{formatBytes(totalSize)}</span>
        </div>
      </div>
    </div>
  );
}
