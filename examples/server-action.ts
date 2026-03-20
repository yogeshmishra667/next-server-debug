// app/actions.ts — Server Action usage
//
// Server Actions run on the server but are triggered from the client.
// Use dbg() for terminal logging. To surface entries in the browser,
// return them alongside your action result.

"use server";

import { dbg, timed } from "next-server-debug/server";
import type { DebugEntry } from "next-server-debug/server";

interface CreateUserResult {
  success: boolean;
  userId?: number;
  _debug?: DebugEntry[];
}

export async function createUser(
  formData: FormData
): Promise<CreateUserResult> {
  const entries: DebugEntry[] = [];

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;

  entries.push(
    dbg("Action input", { name, email }, "actions/createUser", "info")
  );

  const { result: user, entry } = await timed(
    "Insert user",
    async () => {
      // Simulated DB insert
      return { id: Math.floor(Math.random() * 10000), name, email };
    },
    "actions/createUser"
  );
  entries.push(entry);

  entries.push(
    dbg("User created", { userId: user.id }, "actions/createUser", "success")
  );

  return {
    success: true,
    userId: user.id,
    ...(process.env.NODE_ENV === "development" && { _debug: entries }),
  };
}
