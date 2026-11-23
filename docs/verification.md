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

## Production smoke test, November 23, 2026

The application from commit `cd40d9c` runs on [suni.](https://suni.ngo-social-studio.workers.dev) as Worker version `d8c0ae17-f4d8-4435-9d30-14a325962b64`. All 16 local tests, typecheck, lint, production asset build and Wrangler bundle checks passed. The production dependency audit reported zero known advisories.

| Check | Hosted result |
| --- | --- |
| Authentication | Google lists the External audience as In production. Initial sign-in, sign-out and returning sign-in passed in Edge. The OAuth state cookie carried Secure, HttpOnly and SameSite=Lax. Password sign-in was disabled. |
| Diary | First-time profile setup preserved the entry draft. A private description, reflection and timestamped moment survived a reload. The same entry returned after signing in again and appeared in the owner JSON export. |
| Public access | Signed-out diary and export requests returned 401. The private profile returned 404. A separate synthetic profile exposed only its shared entry and selected moment. Disabling moment, entry and profile sharing removed each from the public API. The public page became unavailable after unpublishing. Cross-origin writes returned 403. |
| Database | The new side-a D1 was empty before migration. Five migrations applied. After removing the synthetic listener, its media and moments were gone and the foreign-key check returned zero violations. The real account and private diary were retained. |
| Cost and capacity | Workers Free and D1 Free on workers.dev cost $0/month within quotas. During the initial analytics sample Cloudflare reported 35 requests, zero Worker errors, 1,008 D1 rows read and 240 written. Worker p95 CPU of 34.15 ms exceeded the Free plan's 10 ms CPU budget. This small sign-in-heavy sample warrants investigation before increasing traffic. |

Destructive account deletion and cross-account write isolation were tested against isolated D1 locally. The hosted release enables Google sign-in. Facebook, GitHub and keyed Podcast Index were outside this deployment.
