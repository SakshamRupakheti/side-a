# Cloudflare deployment runbook

The owner needs a Cloudflare Free account and at least one Google or GitHub OAuth client. A free workers.dev hostname is sufficient. Podcast Index credentials are optional. The GitHub Actions workflow only runs checks.

## 1. Check the release locally

Use the Node and npm versions in the README. Run `npm ci`, `npm run setup:local`, `npm run db:local`, `npm run check` and `npm run worker:check`. Review the reported Worker gzip size against the current Free limit and check migrations against a local copy of existing data before an upgrade. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## 2. Configure hosting and identity

After approving the production release, sign in with `npx wrangler login` and choose the intended account. Set up its workers.dev subdomain in Workers & Pages. Use `npx wrangler d1 create side-a` to create a database. Keep the `DB` binding and `migrations_dir` in `wrangler.jsonc` and replace the local placeholder database ID with the returned ID. If Wrangler offers to append a binding, decline and edit the existing one. Set the Worker name to a unique name in the account. [D1 setup](https://developers.cloudflare.com/d1/get-started/)

The origin will be `https://WORKER_NAME.ACCOUNT_SUBDOMAIN.workers.dev`. Use separate provider clients for local and hosted deployments.

- **GitHub**. Register an OAuth App in developer settings. Use the site origin as its homepage and append `/api/auth/callback/github` for the authorization callback. Obtain its client ID and secret. The diary needs identity and email access. [Provider configuration](https://better-auth.com/docs/authentication/github)
- **Google**. Set up the Google Auth Platform branding and audience. Create an OAuth client of type Web application. Register the exact site origin and authorized redirect URI ending in `/api/auth/callback/google`. Add test users while the consent configuration is in testing and publish the audience when ready for general access. [Provider configuration](https://better-auth.com/docs/authentication/google)
- **Podcast Index**. To enable primary discovery, obtain a key and secret from the provider and supply both bindings. Leaving them empty selects Apple’s keyless podcast search. [API registration](https://api.podcastindex.org/)

## 3. Supply Worker secrets

Create an ignored `.env.production` containing the following names. Fill values using a password manager. Generate a distinct cryptographically random secret of at least 32 bytes. Use an HTTPS production URL and omit `LOCAL_PASSWORD_AUTH`. Local credentials and test accounts belong only to local D1.

```dotenv
BETTER_AUTH_URL=https://WORKER_NAME.ACCOUNT_SUBDOMAIN.workers.dev
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_PRODUCTION_VALUE
GITHUB_CLIENT_ID=YOUR_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_CLIENT_SECRET
```

For Google, supply `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. At least one complete provider pair is required. For Podcast Index, add `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET`. Vite-prefixed variables are public and must never contain credentials. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 4. Apply and publish

The following commands change production. Confirm the account, database, Worker name and owner approval first.

```sh
npx wrangler d1 migrations list side-a --remote
npx wrangler d1 migrations apply side-a --remote
npm run build
npx wrangler deploy --secrets-file .env.production
```

After deploying, complete consent on each enabled provider. Select a username, save an episode, save the same URL again and confirm the duplicate message. Mark the original finished, add a private note and public takeaway, then publish only that entry and the desired statistics. Open the profile URL in a signed-out browser and check its contents. Unpublish it and reload the URL. Test export and deletion with a disposable account. Watch auth callback errors, Worker CPU and D1 usage in the dashboard. [Free-tier budget](services.md)

## Operations and recovery

An OAuth redirect mismatch usually means the registered callback differs in protocol, host or path. A local sign-in failure can result from using localhost instead of the configured 127.0.0.1. A missing title or thumbnail can reflect upstream availability. The manual entry form remains usable. If search is unavailable from both providers, the interface reports that failure.

Before a schema change, record a D1 recovery point and export a backup to an owner-controlled private location. The database contains private notes and auth state. Use compatible additive migrations when old and new versions can overlap. Worker deployment rollback restores code only. Review migration compatibility before reverting a Worker, and use D1 Time Travel separately only when coordinated data restoration is necessary. [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/) · [Worker rollback](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)

Owner exports contain personal listening data. Account deletion removes live account records and their dependent diary records. Infrastructure backups age out according to Cloudflare’s retention window. The MVP reads one listener’s history at a time. Monitor query volume, storage and response size as individual diaries grow.

