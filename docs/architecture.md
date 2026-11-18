# Architecture

Side A serves a Vite-built React client and a same-origin Hono API from one Cloudflare Worker. Static files and SPA deep links use Workers Static Assets. API requests use a D1 binding. Better Auth uses Drizzle's SQLite adapter. Parameterized D1 batches handle multi-table diary writes atomically. See [service limits](services.md) and the [deployment runbook](deployment.md).

## Storage and ownership

| Table | Purpose and invariants |
| --- | --- |
| user, session, account, verification | Better Auth identity, sessions, provider associations and expiring verification state. Session and account rows cascade on user deletion. |
| profile | One profile per account. Unique lowercase username. Publication, statistics and badge switches default to private. |
| media | Canonical media identity, independent of URLs. |
| source | Provider plus external identifier is unique. Many sources may point to one canonical item. |
| entry | One listener and canonical item per row. Stores the listener's editable metadata, status, first completion, absolute replay count, rating, private note, public takeaway, visibility, revision and provenance. |
 
Titles and corrections belong to the listener. No editable shared catalog field can reveal another listener's input. Entries always reference a chosen source. Records without a publisher URL have a randomly generated manual source. A manual title alone cannot reliably identify an existing edition.

A finished podcast episode contributes once to episode milestones even if subsequently revisited. Audiobooks are supported and excluded from episode milestones. Shows explored are distinct normalized show names for podcasts started or finished. The show field is separate from the creator because a channel can publish multiple shows. Replays count additional full listens across both formats. Editing the absolute replay count avoids double increments on retry. Badges are calculated from surviving completed entries at 1, 5, 10, 50 and 100. Deleting an entry removes its contribution.

Only explicitly shared entries feed public aggregates and public history. The public response uses a dedicated projection with no private note, email or internal user ID. Authentication comes from the server session. Mutations scope records to its owner. Revision checks prevent stale edits. Account deletion cascades to diary data and prunes unused media and source rows. Responses with account or profile data disable caching.

## Provenance and future imports

A future importer can attach additional source links to a canonical item, submit a source kind and a stable per-owner import key, and repeat an import idempotently. The MVP only writes manual entries. Automatic cross-provider matching would need a user-confirmed reconciliation step. The system does not read provider histories or retrieve audio.

## Deployment shape

One workers.dev hostname serves the site and authentication callbacks. Local Wrangler uses a separate SQLite-backed D1 database. Production uses OAuth without an email delivery service. Email/password sign-up is available only in local development on loopback for end-to-end testing. Third-party timeouts allow manual metadata entry, and directory search can switch providers independently of saving an entry.

