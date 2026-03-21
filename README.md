# next-server-debug

Floating debug panel for Next.js App Router. Inspect server data — DB queries, API calls, headers, cache status, timing — directly in the browser during development. Zero production cost.

[![npm version](https://img.shields.io/npm/v/next-server-debug)](https://www.npmjs.com/package/next-server-debug)
[![license](https://img.shields.io/npm/l/next-server-debug)](https://github.com/yogeshmishra667/next-server-debug/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

## The problem

Server Components don't have a browser console. `console.log` in a Server Component prints to the terminal, not the browser. When you're debugging database queries, API responses, headers, or timing in the App Router, you're constantly switching between your browser and terminal. `next-server-debug` gives you a floating panel that displays all of that server-side data directly in the browser.

## Quick start

```bash
npm install next-server-debug
```

```tsx
// app/page.tsx
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
      <DebugPanel entries={debug.entries} />
    </main>
  );
}
```

The panel renders only in development. In production, `DebugPanel` returns `null`.

## API Reference

### Server utilities (`next-server-debug/server`)

#### `dbg(label, data, source, level?, tags?): DebugEntry`

Create a single debug entry. Logs to the terminal and returns a serializable entry.

```ts
import { dbg } from "next-server-debug/server";

const entry = dbg("User fetched", userData, "app/page.tsx", "info", ["db"]);
```

#### `timed<T>(label, fn, source, level?): Promise<{ result: T; entry: DebugEntry }>`

Time an async operation. Returns both the result and the timing entry.

```ts
import { timed } from "next-server-debug/server";

const { result, entry } = await timed(
  "Query users",
  () => db.query("SELECT * FROM users"),
  "app/page.tsx"
);
```

If `fn` throws, an error entry is created and the error is re-thrown.

#### `createDebugger(source): Debugger`

Create a scoped debugger that collects entries.

```ts
import { createDebugger } from "next-server-debug/server";

const debug = createDebugger("app/page.tsx");

debug.log("Info message", { key: "value" });
debug.warn("Warning", { threshold: 100 });
debug.error("Error occurred", error);
debug.success("Operation complete", result);
debug.perf("Manual timing", {}, 42.5);

const result = await debug.timed("Async op", () => fetchData());
const snapshot = debug.snapshot("after-queries");

debug.entries;  // DebugEntry[]
debug.count;    // number
debug.clear();  // reset
```

#### `inspectHeaders(source?): Promise<DebugEntry>`

Inspect request headers. Sensitive headers (`Authorization`, `Cookie`, `x-api-key`) are redacted.

```ts
import { inspectHeaders } from "next-server-debug/server";

const entry = await inspectHeaders("app/page.tsx");
```

Returns an error-level entry if called outside a request context (does not throw).

#### `inspectEnv(keys, source?): DebugEntry`

Inspect specific environment variables. Values containing "secret", "key", "password", or "token" (case-insensitive) are redacted.

```ts
import { inspectEnv } from "next-server-debug/server";

const entry = inspectEnv(
  ["NODE_ENV", "DATABASE_URL", "API_SECRET_KEY"],
  "app/page.tsx"
);
// API_SECRET_KEY will show as "[redacted]"
```

#### `inspectSearchParams(searchParams, source?): DebugEntry`

Create an entry for URL search parameters.

```ts
import { inspectSearchParams } from "next-server-debug/server";

const entry = inspectSearchParams(
  { page: "1", sort: "name" },
  "app/page.tsx"
);
```

#### `inspectCache(label, url, init?, source?): Promise<{ response: Response; entry: DebugEntry }>`

Fetch a URL and inspect its cache status. Shows a colored **HIT / MISS / STALE / REVALIDATE / SKIP** pill in the panel by reading `x-nextjs-cache`, `x-vercel-cache`, and `cf-cache-status` response headers.

```ts
import { inspectCache } from "next-server-debug/server";

const { response, entry } = await inspectCache(
  "JSONPlaceholder API",
  "https://jsonplaceholder.typicode.com/posts/1",
  undefined,         // optional RequestInit
  "app/page.tsx"
);
const data = await response.json();
```

#### `debugRedirect(url, options?): never`

Log a warn-level entry before calling Next.js `redirect()`. Useful for tracing which redirect fired and why.

```ts
import { debugRedirect } from "next-server-debug/server";

if (!session) {
  debugRedirect("/login", {
    reason: "No active session",
    source: "app/dashboard/page.tsx",
    type: "replace",          // "replace" | "push" (default "replace")
  });
}
```

#### `safeSerialize(data): unknown`

Safely serialize data, handling circular references and truncating values over 50KB.

#### `normalizeForBoundary(data): unknown`

Normalize data for the server-to-client boundary. Converts `Date` to ISO string, `BigInt` to string with `n` suffix, `undefined` to `null`, and class instances to plain objects.

### Client components (`next-server-debug`)

#### `<DebugPanel>`

Floating debug panel component. Must be used in a client-compatible context.

```tsx
import { DebugPanel } from "next-server-debug";

<DebugPanel
  entries={debug.entries}
  position="bottom-right"     // "bottom-right" | "bottom-left" | "top-right" | "top-left"
  defaultCollapsed={false}
  title="server debug"
  theme="dark"                // "dark" | "light" | "auto"
  maxHeight={360}             // initial panel height in px (resizable)
  opacity={0.97}
  editorScheme="vscode"       // "vscode" | "cursor" | "webstorm" | false
  projectRoot="/Users/you/my-app"  // used to resolve relative source paths
/>
```

Returns `null` in production (`NODE_ENV === 'production'`).

**Keyboard shortcuts:**
- `Ctrl+Shift+D` / `Cmd+Shift+D` — toggle panel visibility
- `Ctrl+K` / `Cmd+K` — focus search input
- `Escape` — clear search, then collapse panel

**Interactions:**
- Drag the header to reposition (snaps to viewport edges)
- Drag the resize grip (bottom-right corner) to resize width and height
- Click the green traffic light dot to copy all entries as JSON
- Right-click an entry row to copy that entry's data
- Click a timestamp to toggle between absolute and relative time
- Click a source filename to open it in your editor (requires `editorScheme` prop)

#### `<DebugProvider>`

Context provider for accumulating entries from multiple components.

```tsx
import { DebugProvider } from "next-server-debug";

<DebugProvider
  initialEntries={serverEntries}
  panelProps={{ position: "bottom-right", theme: "auto" }}
>
  {children}
</DebugProvider>
```

#### `useDebug()`

Hook for adding entries from client components. Must be used within a `<DebugProvider>`.

```tsx
"use client";
import { useDebug } from "next-server-debug";

function MyComponent() {
  const { log, warn, error, success } = useDebug();

  useEffect(() => {
    log("Component hydrated", { timestamp: Date.now() });
  }, [log]);
}
```

### Prisma plugin (`next-server-debug/prisma`)

Auto-log all Prisma queries with timing as `perf` entries. Errors create `error` entries.

```ts
import { withDebugLogging } from "next-server-debug/prisma";
import { createDebugger } from "next-server-debug/server";

const debug = createDebugger("app/page.tsx");
const prismaWithDebug = prisma.$extends(withDebugLogging(debug));

// All queries are now logged automatically
const users = await prismaWithDebug.user.findMany();
```

Or use the standalone helper that manages its own debugger:

```ts
import { createPrismaDebugExtension } from "next-server-debug/prisma";

const { extension, getEntries } = createPrismaDebugExtension("db");
const prismaWithDebug = prisma.$extends(extension);

const users = await prismaWithDebug.user.findMany();

// In your component:
<DebugPanel entries={getEntries()} />
```

### Drizzle plugin (`next-server-debug/drizzle`)

Auto-log all Drizzle SQL queries as `info` entries with `drizzle` and `sql` tags.

```ts
import { createDrizzleDebugLogger } from "next-server-debug/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";

const { logger, getEntries } = createDrizzleDebugLogger("db");
const db = drizzle(pool, { logger });

const users = await db.select().from(usersTable);

// In your component:
<DebugPanel entries={getEntries()} />
```

Or pass a `DebugLogger` instance directly:

```ts
import { DebugLogger } from "next-server-debug/drizzle";
import { createDebugger } from "next-server-debug/server";

const debug = createDebugger("app/page.tsx");
const db = drizzle(pool, { logger: new DebugLogger(debug) });
```

## Patterns

### Timed database queries

```tsx
const debug = createDebugger("app/page.tsx");

const users = await debug.timed("SELECT users", () =>
  prisma.user.findMany({ take: 50 })
);

const posts = await debug.timed("SELECT posts", () =>
  prisma.post.findMany({ where: { published: true } })
);
```

### Inspecting headers

```tsx
const headersEntry = await inspectHeaders("app/page.tsx");
// Authorization, Cookie, x-api-key values are automatically redacted
```

### Cache inspection

```tsx
import { inspectCache } from "next-server-debug/server";

const { response, entry } = await inspectCache(
  "Products API",
  "https://api.example.com/products",
  { next: { revalidate: 60 } },
  "app/page.tsx"
);
const products = await response.json();
// entry shows HIT/MISS/STALE pill in the panel
```

### Redirect interception

```tsx
import { debugRedirect } from "next-server-debug/server";

export default async function Page() {
  const session = await getSession();
  if (!session) {
    debugRedirect("/login", {
      reason: "No active session",
      source: "app/dashboard/page.tsx",
    });
  }
  // ...
}
```

### Editor deep links

Click any source filename in the panel to open that file directly in your editor:

```tsx
<DebugPanel
  entries={allEntries}
  editorScheme="vscode"    // or "cursor" | "webstorm"
  projectRoot={process.cwd()}
/>
```

### Conditional warnings

```tsx
const debug = createDebugger("app/page.tsx");
const users = await debug.timed("Fetch users", fetchUsers);

if (users.length > 1000) {
  debug.warn("Large result set", {
    count: users.length,
    hint: "Consider pagination",
  });
}
```

### Multiple panels at different positions

```tsx
<DebugPanel entries={dbEntries} position="bottom-right" title="database" />
<DebugPanel entries={apiEntries} position="bottom-left" title="api calls" />
```

### DebugProvider for nested components

```tsx
// layout.tsx (Server Component)
export default async function Layout({ children }) {
  const debug = createDebugger("layout.tsx");
  debug.log("Layout rendered", { timestamp: Date.now() });

  return (
    <DebugProvider initialEntries={debug.entries}>
      {children}
    </DebugProvider>
  );
}

// components/Widget.tsx (Client Component)
"use client";
export function Widget() {
  const { log, success } = useDebug();

  useEffect(() => {
    fetch("/api/data")
      .then(res => res.json())
      .then(data => success("Widget data loaded", data));
  }, [success]);
}
```

### Route Handlers (terminal logging)

```ts
// app/api/users/route.ts
import { dbg, timed } from "next-server-debug/server";

export async function GET() {
  const { result, entry } = await timed(
    "Query users",
    () => db.query("SELECT * FROM users"),
    "api/users"
  );

  // DebugPanel can't render here — entries log to terminal.
  // Optionally include in response body during development:
  return Response.json({
    data: result,
    ...(process.env.NODE_ENV === "development" && { _debug: [entry] }),
  });
}
```

### Server Actions

```ts
"use server";
import { dbg, timed } from "next-server-debug/server";

export async function createUser(formData: FormData) {
  dbg("Action input", Object.fromEntries(formData), "createUser");

  const { result } = await timed(
    "Insert user",
    () => db.insert(users).values({ name: formData.get("name") }),
    "createUser"
  );

  return result;
}
```

### Snapshots for before/after comparison

```tsx
const debug = createDebugger("migration.tsx");

// ... run queries ...
const before = debug.snapshot("before-migration");

// ... run migration ...
const after = debug.snapshot("after-migration");

debug.log("Migration complete", {
  beforeCount: before.entries.length,
  afterCount: after.entries.length,
});
```

## Monorepo usage

In a Turborepo or pnpm workspace:

```
packages/
  next-server-debug/
    src/
    package.json          # name: "next-server-debug"
    tsconfig.json
apps/
  web/
    package.json          # "next-server-debug": "workspace:*"
```

In `turbo.json`:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"]
    }
  }
}
```

Turborepo will build `next-server-debug` before any app that depends on it.

In the consuming app's `next.config.js`, you may need to transpile the package:

```js
const nextConfig = {
  transpilePackages: ["next-server-debug"],
};
```

## Security

**Environment variables**: `inspectEnv` requires you to explicitly list which env vars to expose. It never auto-exposes `process.env`. Values whose key names contain "secret", "key", "password", or "token" (case-insensitive) are replaced with `[redacted]`.

**Headers**: `inspectHeaders` redacts `Authorization`, `Cookie`, and `x-api-key` header values.

**Production guard**: `DebugPanel` checks `process.env.NODE_ENV === 'production'` and returns `null`. No debug UI, no debug data, no bundle cost in production. The panel code is tree-shaken out of production builds.

## How it works

1. Server utilities (`createDebugger`, `dbg`, etc.) run on the server and produce plain JSON objects (`DebugEntry[]`).
2. These entries are passed as props from Server Components to the `DebugPanel` client component.
3. Next.js serializes the props across the server-to-client boundary (RSC payload).
4. `DebugPanel` renders the entries in a floating panel on the client.

There is no API route, no WebSocket, no polling. The data flows through React's built-in server-to-client serialization. This means:

- Zero additional network requests
- Entries are available on first render (no loading state)
- Works with streaming and Suspense
- No server-side state or cleanup needed

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/yogeshmishra667/next-server-debug
cd next-server-debug
pnpm install
pnpm dev    # watch mode
pnpm build  # production build
pnpm typecheck
```

## License

MIT
