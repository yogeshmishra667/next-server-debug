import {
  createDebugger,
  inspectHeaders,
  inspectEnv,
  inspectSearchParams,
  inspectCache,
  debug,
  debugTimed,
  debugStore,
} from "next-server-debug/server";
import { DebugPanel } from "next-server-debug";

interface Props {
  searchParams: Promise<Record<string, string | string[]>>;
}

export default async function Page({ searchParams }: Props) {
  // ─── NEW: Unified debug() API (auto-registers in global store) ────────
  debug("Page render started", { route: "/" }, "info", ["page"]);

  const params = await searchParams;

  // ─── Legacy API still works (backward compatible) ─────────────────────
  const legacyDebug = createDebugger("app/page.tsx");

  // Inspect request context
  const headersEntry = await inspectHeaders("app/page.tsx");
  const envEntry = inspectEnv(
    ["NODE_ENV", "PATH", "DATABASE_SECRET_KEY"],
    "app/page.tsx"
  );
  const paramsEntry = inspectSearchParams(params, "app/page.tsx");

  // ─── NEW: debugTimed() — timed operations with auto-store ─────────────
  const users = await debugTimed("Fetch users from DB", async () => {
    await new Promise((r) => setTimeout(r, 45));
    return [
      { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
      { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
      { id: 3, name: "Charlie", email: "charlie@example.com", role: "user" },
    ];
  }, ["db"]);

  const posts = await debugTimed("Fetch recent posts", async () => {
    await new Promise((r) => setTimeout(r, 22));
    return [
      { id: 1, title: "Getting started with Next.js", authorId: 1, published: true },
      { id: 2, title: "Server Components deep dive", authorId: 2, published: false },
    ];
  }, ["db"]);

  // ─── Mixed old + new API ──────────────────────────────────────────────
  debug("Page data loaded", {
    userCount: users.length,
    postCount: posts.length,
    publishedPosts: posts.filter((p) => p.published).length,
  }, "success");

  debug("Unpublished posts found", {
    count: posts.filter((p) => !p.published).length,
    hint: "These posts are not visible to users",
  }, "warn");

  legacyDebug.log("Complex nested data", {
    config: {
      database: { host: "localhost", port: 5432, pool: { min: 2, max: 10 } },
      cache: { ttl: 3600, strategy: "lru" },
      features: ["auth", "billing", "analytics"],
    },
    metadata: {
      version: "1.0.0",
      buildTime: new Date().toISOString(),
    },
  });

  // Simulate a slow operation
  await debugTimed("Slow analytics query", async () => {
    await new Promise((r) => setTimeout(r, 150));
    return { rows: 1500 };
  }, ["db", "analytics"]);

  // Cache Inspector
  const { entry: cacheEntry } = await inspectCache(
    "JSONPlaceholder API",
    "https://jsonplaceholder.typicode.com/posts/1",
    undefined,
    "app/page.tsx"
  );

  debug("Page render complete", { totalEntries: debugStore.getEntries().length }, "success");

  // Deduplicate: legacy entries may also appear in global store
  const entryMap = new Map<string, typeof headersEntry>();
  for (const e of [headersEntry, envEntry, paramsEntry, cacheEntry, ...legacyDebug.entries, ...debugStore.getEntries()]) {
    entryMap.set(e.id, e);
  }
  const allEntries = Array.from(entryMap.values());

  return (
    <main>
      <h1>next-server-debug test</h1>
      <p>
        {users.length} users, {posts.length} posts loaded from server.
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>
        Check the debug panel — new features to try:
      </p>
      <ul style={{ color: "#666", fontSize: 14, lineHeight: 1.8 }}>
        <li>🌲 <strong>Tree View</strong> — toggle LIST / TREE button in toolbar to see parent-child spans</li>
        <li>⚡ <strong>Performance badges</strong> — see green/yellow/red duration badges in tree view</li>
        <li>🏷️ <strong>Tags</strong> — entries tagged with [db], [page], [analytics]</li>
        <li>🔗 <strong>Unified API</strong> — using new <code>debug()</code> and <code>debugTimed()</code></li>
        <li>🟢 <strong>Cache pill</strong> — see HIT/MISS badge on &quot;JSONPlaceholder API&quot;</li>
        <li>🔗 <strong>Deep link</strong> — click source links to open in VS Code</li>
        <li>Use filter tabs (info, warn, error, success, perf)</li>
        <li>Press Cmd+Shift+D to toggle visibility</li>
      </ul>
      <DebugPanel
        entries={allEntries}
        theme="auto"
        editorScheme="vscode"
        projectRoot={process.cwd()}
      />
    </main>
  );
}
