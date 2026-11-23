# Release verification

## Backend release, 23 November 2026

| Check | Observed locally |
|---|---|
| npm run check | TypeScript, ESLint, Vite build and all 16 Node tests passed. The Worker suites use the production app handler, real Better Auth and isolated D1 databases. |
| npm run worker:check | Wrangler completed its deployment dry run. Worker gzip size was 363.07 KiB with 33 static assets and one D1 binding. |
| OAuth | A test-only Google token endpoint and signing key exercised the HTTPS callback, creation, private profile, secure cookies, sign-out, returning sign-in, retained entry and deletion. Live consent on the actual workers.dev hostname remains a launch gate. |
| Visibility and ownership | Two listeners, owner export, explicit sharing, moment revocation, entry revocation, unpublishing, stale updates, concurrent manual retries and account deletion passed. Local fixture had 103 owner entries and 100 published entries across four pages. |
| Query cost | EXPLAIN selected entry_history and public_history. Isolated D1 index probes for each read 26 rows (25 plus lookahead) and wrote zero. These are index probes, not entire HTTP request costs. Public endpoints also read consent, totals, sources and shared moments. |
| Migration and recovery | The historical fixture preserved existing rows, identities and private moments. A failed child update rolled back the revision. A fresh Wrangler export restored unmodified into another local D1 with one synthetic user, one entry, one private moment, correct public/private totals, five migration records and zero foreign-key errors. An earlier rehearsal exposed trigger/view export ordering, which was corrected before applying to the development database. |
| Existing local DB | Both new migrations applied. A read-only check found five applied migrations, zero foreign-key violations and zero difference between legacy-document and normalized moment counts. |
| Browser | Opened the running Liner Notes composer, entered a temporary title and moment, confirmed default-private consent, closed and chose Keep editing, verified the moment text, then discarded the temporary draft. |
| Production | Hosted CPU and actual Free account entitlement, provider consent and production smoke checks remain pending owner approval. No production database changes were run. |

The local tests run the production Hono handler, Better Auth and the checked-in migration against an isolated Wrangler D1 database. Run `npm run check` to reproduce them. The harness creates its own accounts and credentials.

| Journey | Assertion |
| --- | --- |
| Account and profile | Local signup and returning sign-in produce valid sessions. A second listener cannot claim an existing username. |
| Saving and editing | Two YouTube URL forms resolve to the same item. A different listener can save an independent entry. Unauthorized writes and stale revisions are rejected. |
| Completion and replays | A completed podcast counts once, an audiobook contributes no podcast milestone, and additional listens increment only the replay total. |
| Sharing | A private profile returns 404. The published projection contains the shared takeaway, omits private notes and private records, and honors hidden statistics. Tests open the public SPA deep link and its backing API. |
| Badges | Checks immediately below and at 5, 10, 50 and 100 completions complement the first-completion check. |
| Export and removal | The JSON export contains the listener's own entries. Account deletion invalidates the session and public page while preserving another owner's copy of a shared media item. |
| Provider adapters | Isolated provider fixtures check request signing, scoped headers, canonical URLs, refusal of redirects and manual fallback. Google, Facebook and GitHub generate authorization URLs. For Google and Facebook, the tests check scopes, client IDs, redirect URIs and state, then cancel consent and check that no session was created. |

During the November 17 local checks, Spotify returned the episode title and image for its “My Path to Spotify” example. YouTube returned a title in the iframe's accessible label. suni. extracts that label server-side and renders plain text. Apple returned eight directory results for “99% Invisible.” The browser check covered the landing page, signup dialog and narrow-screen layout.

Live Google, Facebook and GitHub consent callbacks, keyed Podcast Index traffic, hosted CPU usage, and production D1 migration require owner-managed accounts. Follow the deployment runbook for those checks. CI runs on GitHub after the owner publishes the repository.
