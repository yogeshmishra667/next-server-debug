// app/dashboard/page.tsx — All features
import {
  createDebugger,
  inspectHeaders,
  inspectEnv,
  inspectSearchParams,
} from "next-server-debug/server";
import { DebugPanel } from "next-server-debug";

interface Props {
  searchParams: Promise<Record<string, string | string[]>>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const debug = createDebugger("app/dashboard/page.tsx");
  const params = await searchParams;

  // Inspect request context
  const headersEntry = await inspectHeaders("dashboard");
  const envEntry = inspectEnv(
    ["NODE_ENV", "DATABASE_URL", "API_SECRET_KEY", "NEXT_PUBLIC_APP_URL"],
    "dashboard"
  );
  const paramsEntry = inspectSearchParams(params, "dashboard");

  // Timed database queries
  const users = await debug.timed("Fetch users", async () => {
    // Simulated DB query
    return [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
  });

  const posts = await debug.timed("Fetch posts", async () => {
    return [{ id: 1, title: "Hello World", authorId: 1 }];
  });

  // Conditional warnings
  if (users.length > 1000) {
    debug.warn("Large user set", {
      count: users.length,
      hint: "Consider pagination",
    });
  }

  // Capture a snapshot for comparison
  const snapshot = debug.snapshot("after-queries");
  debug.log("Snapshot captured", { name: snapshot.name, entryCount: snapshot.entries.length });

  // Combine all entries
  const allEntries = [headersEntry, envEntry, paramsEntry, ...debug.entries];

  return (
    <main>
      <h1>Dashboard</h1>
      <p>{users.length} users, {posts.length} posts</p>

      {/* Primary panel — bottom right */}
      <DebugPanel
        entries={allEntries}
        position="bottom-right"
        title="dashboard debug"
        theme="auto"
      />
    </main>
  );
}
