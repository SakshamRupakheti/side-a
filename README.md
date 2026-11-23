# suni.

A personal listening diary for podcasts, audiobooks and documentaries. Save an episode link, record what stayed with you, and share selected entries at `/u/username`. Editors' picks link to real publisher pages. Every diary starts empty.

## Run locally

Use Node.js 24.14 or later in the 24.x line and npm. From the project directory run:

```sh
npm ci
npm run setup:local
npm run db:local
npm run dev
```

Open **http://127.0.0.1:8787**. Choose **Sign in** and **Create a new diary** to create a local account and select a username. The setup script generates a fresh secret in ignored `.dev.vars`. Local data persists under `.wrangler/state`. Rebuild with `npm run build` after changing client files. Wrangler watches Worker code.

## Use the diary

Open the [local swipe lab](http://127.0.0.1:8787/swipe-lab) to try the homepage carousel with adjustable sensitivity, momentum and damping. Each release reports launch speed, distance from the release point and elapsed time. Lab adjustments apply to the current lab visit.

1. Choose **Add a listen** and save a title, or paste a source link and select **Import details**. Review the cover, creator, category, original description and duration. You can supply any missing details.
2. Use **Reflection** to describe the listen in your own words and record what stayed with you. **Moments** accepts optional timestamps in HH:MM:SS. Open the saved title in your archive to revisit it. Descriptions, reflections, moments and notes are private. A public takeaway appears when you share the entry and publish your profile.
3. Mark a podcast episode finished to count it toward milestones. Record additional full listens in the replay field. The same provider item can occur once per listener.
4. Use **Profile settings** to publish the profile, select individual statistics and badges, export JSON, or delete the account. Sign in again if deletion requires a fresh session.

The hosted edition supports Google, Facebook and GitHub sign-in. Each button appears when its server credentials are configured. To add another sign-in method, sign in to the existing diary, open Profile settings, and connect a provider that uses the same email address. Local password sign-up is loopback-only. Discovery searches Podcast Index with configured keys and falls back to Apple’s directory. Directory results open the show page so listeners can select a specific episode.

## Repository

| Path | Purpose |
| --- | --- |
| `src/`, `public/` | React interface, locally served fonts and visual assets |
| `server/` | Hono endpoints, Better Auth, metadata adapters, diary persistence |
| `shared/` | Client/server types, statuses and milestone thresholds |
| `migrations/` | Ordered D1 migrations |
| `tests/` | HTTP integration checks using Wrangler’s isolated local runtime |
| `.github/workflows/check.yml` | Checks for pushes and pull requests |

## Verify

```sh
npm run check
npm run worker:check
```

The first command type-checks, lints, builds the client and exercises a temporary D1 database. The second produces a local Worker bundle and reports its compressed size. See the [verification record](docs/verification.md), [architecture and schema](docs/architecture.md), [service limits and official references](docs/services.md), and [Cloudflare deployment runbook](docs/deployment.md).

## License

Application source and original visuals are available under the [MIT license](LICENSE). Third-party packages retain their own licenses. Anybody, DM Sans and IBM Plex Mono use the SIL Open Font License. Podcast names and editorial links identify their respective publishers.

