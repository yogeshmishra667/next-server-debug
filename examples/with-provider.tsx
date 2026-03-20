// app/layout.tsx — DebugProvider with client-side entries
//
// Wrap your layout with DebugProvider to allow any nested client component
// to add debug entries via the useDebug() hook.

// --- Layout (Server Component) ---
// app/layout.tsx
import { createDebugger } from "next-server-debug/server";
import { DebugProvider } from "next-server-debug";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const debug = createDebugger("app/layout.tsx");
  debug.log("Layout rendered", { timestamp: Date.now() });

  return (
    <html lang="en">
      <body>
        <DebugProvider
          initialEntries={debug.entries}
          panelProps={{ position: "bottom-right", theme: "auto" }}
        >
          {children}
        </DebugProvider>
      </body>
    </html>
  );
}

// --- Client Component ---
// app/components/UserList.tsx
// "use client";
//
// import { useDebug } from "next-server-debug";
// import { useEffect, useState } from "react";
//
// export function UserList() {
//   const { log, error, success } = useDebug();
//   const [users, setUsers] = useState([]);
//
//   useEffect(() => {
//     log("Hydration complete", { component: "UserList" });
//
//     fetch("/api/users")
//       .then((res) => res.json())
//       .then((data) => {
//         setUsers(data);
//         success("Client fetch complete", { count: data.length });
//       })
//       .catch((err) => {
//         error("Client fetch failed", { message: err.message });
//       });
//   }, [log, error, success]);
//
//   return <ul>{users.map((u: any) => <li key={u.id}>{u.name}</li>)}</ul>;
// }
