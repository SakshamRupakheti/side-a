# Release approval checklist

## Local gate

- [ ] Start from the reviewed feature branch, confirm git status and compare against bbbdddb (the local redesign). Keep the lockfile pinned. Run npm ci, npm run setup:local, npm run db:local, npm run check and npm run worker:check.
- [ ] Review migrations 0001 through 0005, D1 row metrics and the synthetic restore result. For an existing target, record counts and restore its encrypted snapshot into a separate local state directory before applying pending migrations there. Check the same counts, private flags, PRAGMA foreign_key_check, exports and consent switches after migration. Large backfills and index rebuilds need enough daily write and storage headroom. [Recovery commands](zero-dollar-operations.md)
- [ ] Confirm one card-free Cloudflare Workers Free account, its free workers.dev subdomain, the desired unique Worker name and the exact database to bind as DB. Preserve the existing database name side-a. Replace the placeholder database_id only with the ID of the approved target.
- [ ] Register a Google Web application client for the exact HTTPS origin, with callback /api/auth/callback/google. Select the correct consent audience and test users. Create a fresh production auth secret of at least 32 random bytes. Use a private password manager and local secret file. Configure GitHub or Facebook only after their own callbacks and consent policies are checked.
- [ ] In an ignored .env.production set BETTER_AUTH_URL to the full HTTPS origin and supply BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Omit LOCAL_PASSWORD_AUTH, paid keys and optional rich metadata keys. Leave publisher lookups disabled unless permissions have been verified. Review app contact, published privacy text, encrypted backup retention, provider terms, and the frontend's artwork permissions for this audience.
- [ ] Confirm the account has no paid Worker subscription, custom domain, paid observability or external billing dependency. Inspect wrangler.jsonc and check Dashboard usage across the entire account. [Cost thresholds](cost-guardrails.md)

## Remote commands for explicit owner approval

Run these **only after approval** in the repository root. The initial login and whoami identify the account. For a new database, run the create command once, decline a duplicate generated binding and enter the returned ID in the existing DB binding. For an existing database, skip creation and first capture the bookmark, encrypted export and restore verification described in operations.

~~~powershell
npx.cmd --no-install wrangler login
npx.cmd --no-install wrangler whoami
npx.cmd --no-install wrangler d1 create side-a
~~~

Review the Worker name, account and real D1 ID again. Apply pending migrations, check constraints, build and review the final bundle. Publish assets, Worker code and secrets together when the owner approves the target and cutover.

~~~powershell
npx.cmd --no-install wrangler d1 migrations list side-a --remote
npx.cmd --no-install wrangler d1 migrations apply side-a --remote
npx.cmd --no-install wrangler d1 execute side-a --remote --command "PRAGMA foreign_key_check"
npm.cmd run build
npm.cmd run worker:check
npx.cmd --no-install wrangler deploy --secrets-file .env.production
~~~

## Hosted acceptance before announcing launch

- [ ] On the actual workers.dev origin, use a disposable Google identity. Complete consent, create a private profile, save a private entry with a description, sign out and sign back in. Confirm the same archive returns. Inspect Secure, HttpOnly, SameSite and callback behavior.
- [ ] Share a second entry and one of two moments, publish the profile, then open its public URL signed out. Check the API response as well as the page. Turn off the moment, entry and profile gates in turn. Check a second account's isolation. Confirm public access ends after unpublishing.
- [ ] Force a metadata failure, save manual details, reopen and edit the entry, export it, then delete the disposable account. Verify its public page and old session stop working. Check daily rows, CPU and request usage after the journey.
- [ ] If code needs to revert, inspect versions with npx.cmd --no-install wrangler deployments list and, after owner approval, run npx.cmd --no-install wrangler rollback <previous-version-id>. Leave compatible additive schema in place. Coordinate a separate approved recovery if data needs restoration. [D1 recovery procedure](zero-dollar-operations.md)

Live provider acceptance, the real account's Free entitlement and CPU on Cloudflare require this hosted verification.

