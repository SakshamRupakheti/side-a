# Local social preview

This branch adds listening postcards, published listener search, Discover/Following/Saved feeds, direct post pages, and owner post editing. Private diary records and history imports stay separate. A public post requires three current database gates: published profile, shared diary entry and published post. Public moments also require their own sharing switch. The API selects public fields and checks the gates on every request. Blocks apply between signed-in accounts and prevent interactions. Anonymous visitors can still view public content.

## Run locally

Use Node 24 in this checkout. Build assets with `npm.cmd run build`, then run `node scripts/social-local.mjs`. This applies all migrations to the ignored `.wrangler/social-preview` D1 state and serves http://127.0.0.1:8793/feed. The script creates a local-only password-auth secret on first run. It binds the synthetic local database ID. Stop the process normally when finished.

`node scripts/social-demo.mjs` seeds three disposable TEST DATA accounts in that preview once. It prints their shared random local password for manual interaction. The browser can open the feed anonymously before seeding. This seed script is for fresh isolated state. It has no production endpoint or remote D1 command.

To inspect the report queue, run `node scripts/social-local.mjs moderate list`. A report UUID can be acted on with `moderate hide UUID`, `moderate restore UUID`, or `moderate close UUID`. These commands target the same isolated local D1 path. Hiding updates the post or public profile gate immediately. The feature has no automated moderation or external notifications.

## Data and limits

Migration `0008_social.sql` adds post, follow, like, bookmark, block and report tables. Deletes cascade from entries and accounts. Listing and search indexes follow publish state through triggers. Feed pages contain at most 16 posts and use a keyset cursor. Username and media search use FTS5. Unshared notes, private descriptions, history evidence, email, and OAuth data are absent from social responses. A bookmark belongs to its actor and appears only in that actor's saved feed and account export.

The three-account test creates 20 Alice entries, imports 100 more private entries, and checks that no post appears until she explicitly publishes one. It verifies Bob's follow, like and private bookmark, Charlie's unpublished profile, moment revocation, each publication gate, blocks, reports, stale revisions, deletion, and 1,000-post pagination. On local D1, a 1,000-post fixture used 119 rows read for the first Discover page and 240 rows read for the first Following page with two followed authors. Both wrote zero rows. Actual hosted CPU, read counts, and traffic remain to be measured before a release. The account's existing Workers Free and D1 Free quotas are shared with the diary. [Cost guardrails](cost-guardrails.md)

The social branch has no deployment approval. The existing production schema ends at migration 0007. Preserve the separate production backup and migration review before any future rollout.
