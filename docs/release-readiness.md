# suni. local release gate · November 25, 2026

**GO for local review. NO-GO for production rollout.** The Listening Wall passed the local gate. Hosted Worker CPU remains an open P1. This audit used disposable synthetic accounts, local D1 and a local Wrangler bundle. The current production schema, quota headroom, consent flow and candidate CPU have yet to be verified.

Branch `feature/suni-social-local`. Tested application commit `4847be225f806ae36acba0d4fda184cba97b1dc7`. Starting commit `ff52e673197f3f878622998fdfab3534879a5531`. A subsequent documentation-only commit records these results.

## Open the preview

Open [People](http://127.0.0.1:8793/people). To restart, run `npm run build` to completion, then `node scripts/social-local.mjs`. The launcher applies pending migrations only to `.wrangler/social-preview` and binds loopback. On a **fresh** preview database, run `node scripts/social-demo.mjs` once. The existing preview already contains labelled test accounts. Run focused tests with `node --test tests/social.test.mjs tests/formats.test.mjs`.

## Product and verification

| Area | Implementation and local evidence |
| --- | --- |
| Discovery | `src/ListeningWall.tsx`, `src/Social.tsx`, `src/social.css` and `shared/social.ts`. People opens with ranked listeners and Fresh Voices. Search and block management remain available. Ranking uses descending unique sharing badges and ascending unique public handle. Fresh Voices uses latest public postcard and handle. Both paginate by key, 12 listeners per page, and exclude self and blocks in either direction. |
| Consent and badges | `migrations/0009_listening_wall.sql`, `server/diary.ts`, `shared/diary.ts`, `src/Forms.tsx`. Ranking requires a published profile, a visible postcard and independent opt-in, initially off for everyone. Public podcast postcards earn First Signal at one, Deep Dive at three from one named show, Explorer at three named shows, Thought Collector at three with a caption or included nonempty takeaway, and Sound Collector at ten. Each source-backed entry contributes once per owner. Show names are trimmed and case-normalized. Finished-listen milestones keep their existing controls. |
| Access and consistency | `server/social.ts` and `server/social-feed.ts`. Indexed summaries update in the writing transaction. Tests cover three interacting accounts, 100 private imports, multiple publication gates, moderation hide/restore, revocation, self exclusion, bidirectional blocks, follow/like/bookmark retries, unauthorized and stale edits, deletion and owner export. A 1,001-ranked-account fixture traversed every page and checked equal-score ordering, unique handles, and index selection. Empty, single-listener and ten-listener cases passed. See `tests/social.test.mjs`. |
| Browser | Real headless Chrome at 375, 768 and 1440 CSS px with reduced motion. Each width showed both section headings, a ranked test listener with an initial, the First Signal stamp and the Ten Thousand Years cover. The follow target measured 44 px high and document width equalled viewport width. Keyboard Enter opened guest sign-in and submitted a follow. Both cards reflected the pending change, reverted on an injected 503, and retained a successful follow after refresh. Unfollow reached D1. The linked profile survived refresh. No page exception during the successful run. |
| Diary and sharing | Existing journey, experience, collection and deck tests passed for onboarding, returning sessions, the three formats, private moments, editing, saving, deleting, export, metadata fallback, 0/1/2/1,025-item rendering, foreground handoffs and reversals. Carousel, entrance and swipe files have no diff from the starting commit. Local HTTPS OAuth used a test provider. `index.html` and the post document supply OG/X metadata. Post previews use the public projection, escaped text and private no-store responses. Generic profile previews contain only site copy. |
| Private import | History parser and Worker tests passed on synthetic Spotify and Takeout fixtures, including JSON, HTML, ZIP handling, deduplication, evidence labels, bounded retries and private persistence. A 1,000-entry import took 63 local requests. No personal archive was used. |
| Moderation and privacy | `scripts/social-local.mjs` now lists report target review paths. Open the target, review the reason, hide or restore by report UUID, then close it. See `docs/social-local.md`. `server/index.ts` includes the reporting listener’s own reports in export. Deletion cascades to social rows. `public/privacy/index.html` explains discovery, ranking consent, report retention and unpublishing. The small sample in `scripts/social-demo.mjs` opts in only its synthetic author. |
| Recovery and controls | `tests/formats.test.mjs` migrates populated historical fixtures through 0001–0009, including a public post already present at 0008. Existing private moments, default opt-out, badge backfill, deletion and foreign keys passed. The isolated D1 suite also passed foreign-key checks after scale tests. Origin rejection, scoped SQL bindings, ownership, session cookies, rate limiting, permitted source links and cache boundaries were reviewed against existing tests. A simulated D1 quota exception through the actual wall handler returned 503 and a 60-second retry header. |

`npm run check` passed typecheck, lint, Vite production build and **29/29 tests**. `npm run worker:check` passed locally in dry-run mode. The first typecheck caught an HTMLRewriter callback return-type error, corrected before the passing run. An overlapping local preview initially returned 404 for assets during the rebuild. Restarting one preview after the completed build resolved it and the browser checks passed.

## D1 and Worker measurements

Large-fixture local D1 measures the complete data query, excluding session lookup. Discover read 119 rows and Following read 240 for a 16-post page over 1,000 posts and two followed authors. For wall pages, Ranked read 91 rows initially and 92 deep in the index. Fresh Voices read 90 initially and 92 deep. All four reads wrote zero. EXPLAIN selected `wall_rank` and `wall_fresh`. The 13 projected SQL rows including lookahead used 3,030–3,342 JSON characters in this fixture. A direct caption-only update read 7 rows and wrote 3. Production API edits also update revision and listing indexes.

Small-preview **complete request** measurements follow. These sum local Wrangler D1 span counters by request trace, including session reads where applicable. The preview had one ranked and two fresh listeners. Writes vary with prior state and affected relationships.

| Route or operation | Rows read / written |
| --- | ---: |
| Session, guest / signed in | 0/0 · 5/0 |
| Ranked, guest / signed in | 7/0 · 9/0 |
| Fresh, guest / signed in | 13/0 · 15/0 |
| Listener search / direct post / public profile, signed in | 6/0 · 8/0 · 10/0 |
| Discover / Following / Saved, signed in | 25/0 · 19/0 · 17/0 |
| Fetch editor / save public postcard | 8/0 · 36/24 |
| Follow / like / bookmark | 4/3 · 10/3 · 10/3 |
| Repeat existing report / block / list blocks / unblock | 10/0 · 21/6 · 5/0 · 4/1 |

The local Worker bundle measured 2,004.81 KiB raw and 370.64 KiB gzip. Main client JS was 92.79 kB gzip and lazy social JS 5.28 kB gzip. A cookie-free session request now skips Better Auth initialization. Signed-in profile and linked-provider reads run concurrently. In the integrated local harness the first guest session round trip took 81.3 ms. Ten subsequent requests per path had medians of 20.5 ms guest and 27.9 ms authenticated. These are elapsed times including the harness. Only a hosted CPU sample can resolve the earlier 34.15 ms p95 finding.

## Decision and later release gates

- **P0** — No open P0 found in the exercised local flows.
- **P1** — The last recorded hosted p95 CPU was 34.15 ms in a 35-request auth-heavy sample against the documented 10 ms/request Free budget. Before broad release, obtain authorization for a controlled hosted verification, segment guest, authenticated read and OAuth callback CPU, and repeat with representative traffic. Hold rollout if the budget is exceeded.
- **P2** — Following fans out across followed authors. The scale fixture measures two followed authors. Measure higher fan-out, block-heavy pages and worst-case caption/moment sizes before forecasting capacity. Screen-reader and physical-device testing remain outstanding.
- **Operations** — At an authorized cutover, confirm Workers Free and D1 Free in the owner dashboard. Match Worker `suni`, the account ID in the production stanza of `wrangler.jsonc`, binding `DB`, database `side-a` and database ID `ef1a1e2b-8007-4ad0-8549-55ca0bf49dd5`. Verify the applied migration ledger. Capture a recovery bookmark and an encrypted private export, prove it restores in isolation with clean foreign keys, and apply only pending migrations in order. Retain a compatible Worker rollback version. [Deployment procedure](deployment.md)
- **OAuth and smoke** — Confirm the production HTTPS base URL, existing secret bindings, password auth disabled, Google External audience and redirect URI ending in `/api/auth/callback/google`. Use a disposable account for sign-in, return, private entry, publish, follow, block, opt-out, export and deletion. Verify headers, deep links, actual compressed bundle, CPU, errors, D1 totals and account-wide free quota headroom before inviting users. [Launch checklist](launch-checklist.md) · [Cost guardrails](cost-guardrails.md)
- **Announcement draft, held locally** — “Meet the listeners behind the postcards. Fresh Voices shows who shared recently, and you can choose to join the Listening Wall in your profile settings.” Demo with two synthetic diaries, show a follow, then opt out and reload the ranking.

