# Local backend audit, 23 November 2026

Baseline was a clean checkout of design/pofolio-listening-universe at bbbdddb. Local main was ea63c77. The feature branch starts at the former.

| State at baseline | Evidence and finding |
|---|---|
| Implemented | server/auth.ts and server/index.ts restrict password auth to HTTP loopback, validate write origins and social redirect destinations, require a session for /api/me/*, encrypt provider tokens and require explicit linking. public/_headers supplies CSP. |
| Implemented | migrations/0001_initial.sql and migrations/0002_documentaries.sql cover identity, canonical sources, owner-local edits, all three formats, revisions, uniqueness and deletion triggers. server/diary.ts computes podcast milestones from logged finishes. |
| Partial | migrations/0003_entry_experience.sql, shared/experience.ts and src/EntryComposer.tsx store private descriptions, reflections, durations and ordered moments in JSON. Duration provenance and public consent per moment were absent. |
| Partial | server/providers.ts and server/media-details.ts use fixed provider endpoints, limited publisher hosts, manual redirects, timeouts and manual fallback. Discovery was anonymous. |
| Missing | server/index.ts returned complete histories, with no cursor or application quota protection. Manual create retries could create extra sources. Closing src/EntryComposer.tsx discarded edits. |
| Risky | wrangler.jsonc uses a placeholder D1 ID. Actual production OAuth consent, Free account state and deployed CPU usage cannot be established locally. No real secrets are tracked. package-lock.json pins the existing stack. |
| Test baseline | tests/journeys.test.mjs exercises two local identities, OAuth initiation, profile visibility, export and deletion. tests/formats.test.mjs exercises an old schema. External OAuth consent is a separate owner acceptance step. |
