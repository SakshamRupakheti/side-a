# Release verification

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

During the November 17 local checks, Spotify returned the episode title and image for its “My Path to Spotify” example. YouTube returned a title in the iframe's accessible label. Side A extracts that label server-side and renders plain text. Apple returned eight directory results for “99% Invisible.” The browser check covered the landing page, signup dialog and narrow-screen layout.

Live Google, Facebook and GitHub consent callbacks, keyed Podcast Index traffic, hosted CPU usage, and production D1 migration require owner-managed accounts. Follow the deployment runbook for those checks. CI runs on GitHub after the owner publishes the repository.
