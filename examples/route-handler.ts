// app/api/users/route.ts — Route Handler usage
//
// Note: DebugPanel cannot render in a Route Handler (no JSX output).
// Use dbg() for structured terminal logging. To see entries in the browser,
// return them in the response body during development.

import { NextResponse } from "next/server";
import { dbg, timed, inspectHeaders } from "next-server-debug/server";

export async function GET() {
  const headerEntry = await inspectHeaders("api/users");

  const { result: users, entry: queryEntry } = await timed(
    "Query users table",
    async () => {
      // Simulated DB query
      return [
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ];
    },
    "api/users"
  );

  dbg("Response prepared", { count: users.length }, "api/users", "success");

  // In development, you can include debug entries in the response
  // for a custom client-side debug viewer
  return NextResponse.json({
    data: users,
    ...(process.env.NODE_ENV === "development" && {
      _debug: [headerEntry, queryEntry],
    }),
  });
}
