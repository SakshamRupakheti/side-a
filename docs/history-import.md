# Private listening history import

Open **Import listening history** from My Archive, profile settings or an empty personal collection. Sign in, select the export files, review the results, then confirm once. The initial selection includes high-confidence episodes. The default listening status is **Saved for later**. The review can filter by provider and last activity date, exclude creators and individual episodes, and include uncertain matches.

## Accepted files

| Export | Supported evidence |
| --- | --- |
| Spotify Extended Streaming History | Episode URI, exported episode/show name, stream timestamp and milliseconds played. Select individual JSON arrays, multiple files, or a ZIP. Music tracks count as other media. |
| YouTube Takeout watch history | Video ID from a watch link, exported title, channel and activity time in JSON or Takeout HTML. The HTML reader parses text and links without rendering them. |
| YouTube playlists and saved videos | Playlist video CSVs with a Video ID column or exported JSON rows. Playlist membership, watch-later/liked/saved membership and actual watches have separate counters. An ID-only row can supply evidence for a titled video elsewhere in the same selection. |

YouTube recognition combines episode titles, channels, known creator aliases and repeated episode patterns within the selected export. Duration supports weak podcast signals. Shorts, music and ordinary videos are excluded. Titles or stable IDs missing from all selected files can leave records unrecognized. Dates and duration stay empty when unavailable. A stream or watch event alone cannot establish completion.

The four initial creator families are Raj Shamani / Figuring Out, Ranveer Allahbadia / BeerBiceps / The Ranveer Show, Sushant Pradhan, and Sanjay Silwal Gupta / ON AIR. Takeout structures and localized filenames vary. The MVP recognizes English filenames and episode cues. Spotify files without stable episode IDs and playlist IDs without titles need corroborating data. There are no per-item metadata lookups, inferred artwork or paid classifiers.

## Storage and limits

A dedicated browser worker reads archives one member at a time. Selected history JSON is parsed one row at a time from a bounded member buffer. The ZIP reader checks paths, size, expansion, overlap and checksums. Unsupported split/ZIP64 archives can be extracted locally and their individual history files selected. One review accepts up to 128 files, 512 MiB selected, 48 MiB per history member, 256 MiB of decoded history, 500,000 activity rows and 50,000 unique IDs. When receiving an exceptionally large export, select separate original history files in groups.

Only selected titles, creators, provider identities and activity summaries go to suni. after confirmation. The browser retains normalized drafts when explicitly saved and checkpoints confirmed jobs in account-scoped IndexedDB. Discard unfinished imports on shared devices or clear site data. Confirmed entries remain in the account after discarding a partially completed job. Account export includes the summaries. Entry and account deletion remove the corresponding private evidence. Private activity summaries are excluded from the public profile projection.

The API derives ownership from Better Auth and checks a matching account scope. It validates individual items in batches of up to 16 within a 64 KiB request limit. Four bound D1 statements form one transaction. Retries use the same job identifier. An existing diary entry keeps its personal fields, and the server reports individual invalid or previously saved items. Progress advances only on confirmed outcomes. Reopening the collection loads its existing paginated carousel.

## Measured local workload

| Synthetic workload | Result |
| --- | --- |
| 10,000 distinct Spotify rows, 2,100,001 bytes | 349 ms to organize in the Node parser test during the full suite |
| 1,000 confirmed new private records | 63 sequential local HTTP requests in 2.26 seconds, including authentication and D1 |
| 16 new private records, default status | D1 reported 288 rows read and 256 written across the four import statements |
| Same 16 records and job replayed | 192 rows read, zero written across those statements |

The D1 samples exclude session lookup, fetching prior identities, and subsequent diary reads. Indices, triggers, source reuse and status affect row counts. Hosted Worker CPU, network latency and account-wide traffic require measurement on the target. Free-plan capacity is shared by all listeners. Applying the sample write rate to 1,000 fresh records gives approximately 16,000 D1 row writes. Existing thresholds and account-wide monitoring apply. Set the Worker variable **DISABLE_HISTORY_IMPORT=true** to pause new import batches while retaining resumable selections and normal diary access. [Cost guardrails](cost-guardrails.md)

## Release

1. Verify the target Worker, D1 ID, available quota, recovery bookmark and encrypted backup according to the launch checklist. Restore the backup to disposable local state and compare entry counts, private flags, notes, moments and foreign keys.
2. Apply **0007_history_import.sql** before serving the new Worker. It adds two nullable columns to the entry table. Previously saved records require no backfill. The migration test exercises existing notes, shared flags and private moments.
3. Build, dry-run the production configuration and deploy the reviewed commit when authorized. Smoke-test with a dedicated diary and synthetic fixture. Check default privacy, duplicate detection, export and collection refresh.
4. If imports need pausing, use the import switch. If code rollback is necessary, restore the previous Worker version and retain the additive columns and user data. [Launch checklist](launch-checklist.md) · [Recovery procedure](zero-dollar-operations.md)
