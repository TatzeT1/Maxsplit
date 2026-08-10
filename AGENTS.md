<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Split — working agreement

## Definition of Done

All four must be green before you commit:

```
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

`pnpm test:rules` needs the emulator suite and is not part of the default gate.
`pnpm format:check` currently fails on pre-existing files — run Prettier on the
files you touch, and leave the rest alone rather than reformatting the repo.

## Data access (ADR-001, docs/DECISIONS.md)

Writes go through Server Actions using firebase-admin, authorized by an
HTTP-only session cookie. Reads go through the client Firestore SDK with
`onSnapshot`, authorized by `firestore.rules`. Client writes are denied by
rules as a backstop — never add one.

**There are two independent auth states**, and conflating them has burned a
full debugging session:

|         | server session cookie               | client Firebase Auth        |
| ------- | ----------------------------------- | --------------------------- |
| set by  | `POST /api/auth/session`            | `signInWithPopup`           |
| read by | `getSession()` in Server Components | `useCurrentUser()`          |
| gates   | route access, the app header        | every `onSnapshot` listener |

A correct display name in the header proves only that the _cookie_ is good. It
says nothing about whether client Firestore reads work. Diagnose the two
separately.

## Never swallow a Firestore listener error

`onSnapshot` error callbacks must always report. They used to drop
`permission-denied` to keep sign-out races out of the console, which made a
genuine failure pixel-identical to "still loading" — silent skeleton, empty
console. That hid a wrong project id in production for an entire session. Use
`reportSnapshotError` (src/lib/firebase/snapshot-error.ts) and render a visible
error state; suppress sign-out noise by gating the _render_ on a current user,
never by discarding the error.

The same rule generalizes: a failure state must never be indistinguishable from
a loading state.

## NEXT_PUBLIC_* vars are inlined at build time

They are baked into the client bundle by `next build`, not read at runtime.
Consequences:

- Changing one in Vercel requires a **rebuild with build cache disabled**. A
  cached redeploy silently keeps the old value.
- A well-formed but _wrong_ value fails far from its cause. `config.ts`
  format-checks all six Firebase vars from `next.config.ts` so a bad one fails
  the build instead of shipping. Extend those checks rather than removing them.
- To find out what production is actually running, read the deployed bundle —
  do not infer it from the Vercel dashboard:

  ```sh
  curl -s https://maxsplit-ten.vercel.app/ \
    | grep -oE 'src="/_next/static/[^"]*\.js"'   # then curl a chunk and grep
  ```

## Debugging production

Get signal before forming theories. In order: read the deployed bundle for
inlined config, `get_runtime_errors` / `get_deployment_build_logs` for
server-side failures, and only then reason about the client. Note that runtime
errors stay attributed to the deployment that produced them, so check
`lastDeployment` before assuming an error is current.
