# Cloudflare deployment runbook

The owner needs a Cloudflare Free account and a client for each sign-in method they want to offer. suni. supports Google, Facebook and GitHub. A free workers.dev hostname is sufficient. Podcast Index credentials are optional. The GitHub Actions workflow only runs checks.

## 1. Check the release locally

Use the Node and npm versions in the README. Run `npm ci`, `npm run setup:local`, `npm run db:local`, `npm run check` and `npm run worker:check`. Review the reported Worker gzip size against the current Free limit and check migrations against a local copy of existing data before an upgrade. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## 2. Configure hosting and identity

The production origin is [suni.](https://suni.ngo-social-studio.workers.dev). Sign in with Wrangler and use `wrangler whoami` to confirm the account. The named `production` environment in `wrangler.jsonc` selects Worker `suni` and binds `DB` to the existing `side-a` database. Keep the default local binding separate. Use dedicated OAuth clients for local and hosted sign-in. [D1 setup](https://developers.cloudflare.com/d1/get-started/)

- **GitHub**. Register an OAuth App in developer settings. Use the site origin as its homepage and append `/api/auth/callback/github` for the authorization callback. Obtain its client ID and secret. The diary needs identity and email access. [Provider configuration](https://better-auth.com/docs/authentication/github)
- **Google**. Set up the Google Auth Platform branding and audience. Create an OAuth client of type Web application. Register the exact site origin and authorized redirect URI ending in `/api/auth/callback/google`. Add test users while the consent configuration is in testing and publish the audience when ready for general access. [Provider configuration](https://better-auth.com/docs/authentication/google)
- **Facebook**. Create a Meta app with the Facebook Login use case. Enable web OAuth login, register the site's HTTPS origin and add the exact redirect URI ending in `/api/auth/callback/facebook` to **Valid OAuth Redirect URIs**. Use the App ID as `FACEBOOK_CLIENT_ID` and the App Secret as `FACEBOOK_CLIENT_SECRET`. The app requests `public_profile` and `email`. In the dashboard, supply your operator contact, the site's `/privacy/` page, and `/privacy/#delete-account` as the data deletion instructions URL. Review the published text for your deployment. Test with an app-role account in development mode, then complete the access and publication steps Meta displays for your app before testing a non-role account. [Facebook provider setup](https://better-auth.com/docs/authentication/facebook) · [Meta login permissions](https://developers.facebook.com/docs/graph-api/get-started/)
- **Podcast Index**. To enable primary discovery, obtain a key and secret from the provider and supply both bindings. Leaving them empty selects Apple’s keyless podcast search. [API registration](https://api.podcastindex.org/)

## 3. Supply Worker secrets

For a local Google sign-in test, select the diary project in Google Auth Platform, create a **Web application** client, and register `http://127.0.0.1:8787/api/auth/callback/google` as an authorized redirect URI. Save its client ID and secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.dev.vars`. Restart `npm run dev`, visit `http://127.0.0.1:8787/`, and select Google. After completing consent, verify that you return to suni. signed in. Keep the downloaded client JSON outside the checkout.

Create an ignored `.env.production` containing the following names. Fill values using a password manager. Generate a distinct cryptographically random secret of at least 32 bytes. Use an HTTPS production URL and omit `LOCAL_PASSWORD_AUTH`. Local credentials and test accounts belong only to local D1.

```dotenv
BETTER_AUTH_URL=https://suni.ngo-social-studio.workers.dev
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_PRODUCTION_VALUE
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_WEB_CLIENT_SECRET
```

Each complete pair enables its button. For Facebook, supply FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET when ready. To offer GitHub as well, supply `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. For Podcast Index, add `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET`. Use Worker secrets for provider credentials. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 4. Apply and publish

The following commands change production. Confirm the account, database, Worker name and owner approval first.

```sh
npx wrangler d1 migrations list DB --env production --remote
npx wrangler d1 migrations apply DB --env production --remote
npm run build
npx wrangler deploy --env production --secrets-file .env.production
```

After deploying, complete consent on each enabled provider. Select a username, save an episode, save the same URL again and confirm the duplicate message. Mark the original finished, add a private note and public takeaway, then publish only that entry and the desired statistics. Open the profile URL in a signed-out browser and check its contents. Unpublish it and reload the URL. Test export and deletion with a disposable account. Watch auth callback errors, Worker CPU and D1 usage in the dashboard. [Free-tier budget](services.md)

## Operations and recovery

An OAuth redirect mismatch usually means the registered callback differs in protocol, host or path. A local sign-in failure can result from using localhost instead of the configured 127.0.0.1. A missing title or thumbnail can reflect upstream availability. The manual entry form remains usable. If search is unavailable from both providers, the interface reports that failure.

Before a schema change, record a D1 recovery point and export a backup to an owner-controlled private location. The database contains private notes and auth state. Use compatible additive migrations when old and new versions can overlap. Worker deployment rollback restores code only. Review migration compatibility before reverting a Worker, and use D1 Time Travel separately only when coordinated data restoration is necessary. [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/) · [Worker rollback](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)

Owner exports contain personal listening data. Account deletion removes live account records and their dependent diary records. Infrastructure backups age out according to Cloudflare’s retention window. The MVP reads one listener’s history at a time. Monitor query volume, storage and response size as individual diaries grow.

