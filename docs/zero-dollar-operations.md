# Operating suni. on Free

## Local setup

Use Node 24.14 or newer in the 24 series. Run these commands from the directory containing package.json. Wrangler's ordinary local state lives in .wrangler/state/v3/d1. Keep .dev.vars, OAuth client files, local state, session exports and SQL snapshots outside version control. Only dist/ is served as static content. public/_headers constrains frames, scripts, connections, fonts and image origins.

~~~powershell
npm.cmd ci
npm.cmd run setup:local
npm.cmd run db:local
npm.cmd run check
npm.cmd run worker:check
npm.cmd run dev
~~~

The local site uses http://127.0.0.1:8787. Local password auth requires HTTP loopback and LOCAL_PASSWORD_AUTH=true. The production auth origin must be the exact HTTPS origin. Session cookies are host-scoped, HttpOnly, SameSite=Lax and Secure on HTTPS. Sessions have a seven-day rolling lifetime. Account deletion requires a session created within ten minutes. Local and production clients use separate OAuth secrets and redirect registrations.

## API and database behavior

- POST /api/me/entries supports an optional UUID import_key. Identical retries by the owner return the original id. Reusing that key with changed validated data returns 409. An independent canonical duplicate also returns 409. PUT and DELETE require the current revision.
- The owner document stores the private description, publisher summary, reflection, duration and ordered moments. A missing legacy duration_origin means unknown. Positive seconds can carry manual or provider provenance. Manual input can correct duration before saving.
- Migration 0004 adds an ordered favorite_moment projection and a request fingerprint. Database triggers replace the projection atomically with the owner document. Failed edits roll back both. The public query sees only explicitly shared moments on shared entries under a published profile. Owner exports include private fields. Changing a username or unpublishing takes effect on the next request.
- Migration 0005 backfills separate owner/public totals and qualifying show counts. Entry writes update only the affected listener and scopes. Switching visibility, deleting and logging replays adjust totals. Historical completions remain completions. Source duration never counts as hours listened.
- GET /api/me/diary and GET /api/u/{username} return 25 entries and next_cursor. Send the returned value as a URL-encoded cursor. Ordering is updated_at and entry id descending. Page boundaries are deterministic for unchanged data. Refresh to see concurrent edits at the head. The optional bounded featured query on the owner route resolves shelf actions beyond the first page. Owner export currently materializes the complete diary. Test with representative archive sizes before opening large imports.
- Every /api/me/* route and directory lookup needs a real same-origin session. The public profile has a dedicated SQL projection. Authenticated responses are never shared-cacheable. Lookup inputs are size-bounded and upstreams have finite deadlines. Rich metadata credentials are optional. Unapproved publishers are saveable as manual links. DISABLE_LOOKUPS=true pauses discovery and metadata traffic.
- Public reads are limited to 60 per IP/minute per isolate. Signed-in metadata and search share 10 per listener/minute, with a directory ceiling of 18 per isolate/minute. Mutations allow 180 per listener/minute. Better Auth limits auth traffic separately. [Quota monitoring and limitations](cost-guardrails.md)

## Encrypted snapshots and recovery

D1 Free Time Travel retains seven days. A Worker rollback changes code only. Keep a separate encrypted snapshot before schema changes. Store the decryption key in an owner-controlled password manager or offline key store. Use a private encrypted volume for all plaintext, including local restore state. Never store backups in the checkout, a shared folder or GitHub. Restrict access because SQL includes private entries, session material and OAuth records. Use a seven-day rotation for manual snapshots unless the operator publishes a different retention policy. Before reopening a restored database, reconcile account deletions and revoke sessions affected by the recovery. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) · [Export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

The following pre-migration commands require approval for the named remote DB. In PowerShell, set $vault to an existing private, encrypted directory and $recipient to the verified fingerprint of the owner's GPG encryption key. GPG is an operator-side tool, not a project dependency. Use a fresh directory per snapshot. The bookmark itself belongs in the private recovery record.

~~~powershell
npx.cmd --no-install wrangler d1 time-travel info DB --env production
npx.cmd --no-install wrangler d1 export DB --env production --remote --output "$vault/before.sql"
if ($LASTEXITCODE) { throw 'Snapshot export failed' }
gpg --output "$vault/before.sql.gpg" --encrypt --recipient $recipient "$vault/before.sql"
if ($LASTEXITCODE) { throw 'Encryption failed' }
gpg --output "$vault/check.sql" --decrypt "$vault/before.sql.gpg"
if ($LASTEXITCODE) { throw 'Decryption failed' }
if ((Get-FileHash "$vault/before.sql").Hash -ne (Get-FileHash "$vault/check.sql").Hash) { throw 'Snapshot mismatch' }
~~~

Restore to a fresh local D1 state directory on that encrypted volume. The target must be empty. The export contains schema, migrations, indexes, triggers and content. Do not preapply migrations to an empty restore target. Use a separate fresh path for every rehearsal. Check account, source and entry counts against pre-export counts, plus any moment and summary totals present in that schema.

~~~powershell
npx.cmd --no-install wrangler d1 execute side-a --local --persist-to "$vault/restore-state" --file "$vault/check.sql"
npx.cmd --no-install wrangler d1 execute side-a --local --persist-to "$vault/restore-state" --command "PRAGMA foreign_key_check"
npx.cmd --no-install wrangler d1 execute side-a --local --persist-to "$vault/restore-state" --command "SELECT (SELECT count(*) FROM user) users,(SELECT count(*) FROM entry) entries,(SELECT count(*) FROM source) sources"
npx.cmd --no-install wrangler d1 migrations apply side-a --local --persist-to "$vault/restore-state"
npx.cmd --no-install wrangler d1 execute side-a --local --persist-to "$vault/restore-state" --command "SELECT (SELECT count(*) FROM favorite_moment) moments,(SELECT count(*) FROM entry_moment_input) expected,(SELECT count(*) FROM pragma_foreign_key_check) fk_errors"
~~~

Verify representative owner/public entries and compare counts before and after the rehearsal. For a pre-0004 snapshot, the moment-count check applies after migration. Remove the temporary plaintext files and restored state under the owner's retention policy after recording verification. An unverified encrypted file is insufficient. During a production incident, stop writes, capture a new snapshot and assess writes and deletions after the target bookmark. Obtain separate owner approval for any live Time Travel restore. Prefer rolling forward with a corrected additive migration.

