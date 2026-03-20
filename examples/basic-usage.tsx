// app/page.tsx — Minimal Server Component usage
import { createDebugger } from "next-server-debug/server";
import { DebugPanel } from "next-server-debug";

export default async function Page() {
  const debug = createDebugger("app/page.tsx");

  const users = await debug.timed("Fetch users", async () => {
    const res = await fetch("https://api.example.com/users");
    return res.json();
  });

  debug.success("Page loaded", { userCount: users.length });

  return (
    <main>
      <h1>Users</h1>
      {/* Render your page content */}
      <DebugPanel entries={debug.entries} />
    </main>
  );
}
