import {
  createDebugger,
  inspectHeaders,
  inspectEnv,
  inspectSearchParams,
  inspectCache,
} from "next-server-debug/server";
import { DebugPanel } from "next-server-debug";

interface Props {
  searchParams: Promise<Record<string, string | string[]>>;
}

export default async function Page({ searchParams }: Props) {
  const debug = createDebugger("app/page.tsx");
  const params = await searchParams;

  // Inspect request context
  const headersEntry = await inspectHeaders("app/page.tsx");
  const envEntry = inspectEnv(
    ["NODE_ENV", "PATH", "DATABASE_SECRET_KEY"],
    "app/page.tsx"
  );
  const paramsEntry = inspectSearchParams(params, "app/page.tsx");

  // Simulate timed operations
  const users = await debug.timed("Fetch users from DB", async () => {
    await new Promise((r) => setTimeout(r, 45));
    return [
      { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
      { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
      { id: 3, name: "Charlie", email: "charlie@example.com", role: "user" },
    ];
  });

  const posts = await debug.timed("Fetch recent posts", async () => {
    await new Promise((r) => setTimeout(r, 22));
    return [
      { id: 1, title: "Getting started with Next.js", authorId: 1, published: true },
      { id: 2, title: "Server Components deep dive", authorId: 2, published: false },
    ];
  });

  debug.success("Page data loaded", {
    userCount: users.length,
    postCount: posts.length,
    publishedPosts: posts.filter((p) => p.published).length,
  });

  debug.warn("Unpublished posts found", {
    count: posts.filter((p) => !p.published).length,
    hint: "These posts are not visible to users",
  });

  debug.log("Complex nested data", {
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

  // Feature 1: Cache Inspector — fetch a real URL and inspect cache headers
  const { entry: cacheEntry } = await inspectCache(
    "JSONPlaceholder API",
    "https://jsonplaceholder.typicode.com/posts/1",
    undefined,
    "app/page.tsx"
  );

  const allEntries = [headersEntry, envEntry, paramsEntry, cacheEntry, ...debug.entries];

  return (
    <main>
      <h1>next-server-debug test</h1>
      <p>
        {users.length} users, {posts.length} posts loaded from server.
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>
        Check the debug panel. New features to try:
      </p>
      <ul style={{ color: "#666", fontSize: 14, lineHeight: 1.8 }}>
        <li>🟢 <strong>Cache pill</strong> — see HIT/MISS badge on &quot;JSONPlaceholder API&quot; entry</li>
        <li>🔗 <strong>Deep link</strong> — click any <code>page.tsx</code> source link to open in VS Code</li>
        <li>Click entries to expand JSON data</li>
        <li>Use filter tabs (info, warn, error, success, perf)</li>
        <li>Press Cmd+Shift+D to toggle visibility</li>
        <li>Right-click an entry to copy its data</li>
        <li>Click a timestamp to toggle relative time</li>
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
