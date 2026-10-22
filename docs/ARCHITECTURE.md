# BTU AI Skills Digital Passport — Architecture

How the system meets the hackathon brief (_ჰაკათონის დავალების აღწერა_), section by section.

## Folder map

```
src/
├── routes/              pages and HTTP endpoints (TanStack file routing: PDF download, DID, webhook, cron, OAuth)
├── components/passport/ UI pieces shared by pages (app shell, stamps, QR scanner)
├── lib/                 browser-side helpers; lib/api.ts is the only bridge from pages to the server
├── test/                end-to-end server tests (in-memory Postgres) and routing tests
└── server/              everything that runs only on the server
    ├── core/            config, errors, hashing and codes, rate limits, notifications + mailer
    ├── db/              database client, schema (tables), seed from BTU's test workbook
    ├── auth/            accounts (password sign-in, registration, sessions), cookies, Google OAuth
    ├── registry/        read the Google Sheet / Excel, validate rows, sync new skills, write back
    ├── passport/        issue versions, show and download a passport, stamp types, public verification
    ├── blockchain/      Merkle tree, BTU issuer key + DID, anchoring the batch root on-chain
    ├── pdf/             passport PDF generator and its embedded artwork
    └── admin.ts         admin panel actions (sync now, add skill, Excel import, retry anchoring)
```

Data flows top to bottom: **registry** → **passport** (issuance) → **pdf** + **blockchain** → **db**; **auth** guards who can see what, and every route calls the server only through `lib/api.ts` or its own endpoint.

## Overview

```
 Google Sheet ──(Apps Script webhook / daily cron / "Sync now")──┐
 Excel upload ───────────────────────────────────────────────────┤
                                                                  ▼
                          registry/format.ts  parse + validate every row
                                                                  ▼
                          registry/sync.ts    match student → skip processed Record IDs
                                              → skip duplicates → add awards
                                                                  ▼
                          passport/issuance.ts one new version per affected student:
                                              PDF → SHA-256 → Merkle leaf → BTU signature
                                                                  ▼
                          blockchain/          one Merkle root per batch → Ethereum (Sepolia)
                                                                  ▼
                          PostgreSQL          versions become "latest" only once anchored
                                                                  ▼
          Student dashboard (sign-in)      Public /verify (no sign-in)      Sheet write-back (Q–T)
```

| Layer           | Where                                                                   | Swap it by                                                              |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Data source     | `src/server/registry/sources.ts`                                        | Implementing `RegistrySource` (e.g. a BTU student-system API)           |
| Sheet columns   | `src/server/registry/format.ts` → `COLUMNS`                             | Adding header aliases; column order doesn't matter                      |
| PDF design      | `src/server/pdf/` (template + stamps, embedded by `npm run assets:pdf`) | Replacing the asset files and coordinates                               |
| Blockchain      | `src/server/blockchain/anchoring.ts`                                    | `ANCHOR_CHAIN` (any EVM chain), or a new `AnchorProvider`               |
| Issuer identity | `src/server/blockchain/issuer.ts`, `/.well-known/did.json`              | `ISSUER_DID` (e.g. `did:web:btu.edu.ge`) and `ISSUER_PRIVATE_KEY`       |
| Email           | `src/server/core/notifications.ts`                                      | Implementing `Mailer` (for BTU email verification codes, notifications) |
| Database        | `src/server/db/schema.ts`, `drizzle/`                                   | Any PostgreSQL (`DATABASE_URL`)                                         |

## §1 Unique passport

- `students.passport_id` is unique and permanent; `students.issued_at` is the fixed first-issue date. Name, Passport ID and first-issue date never change after creation.
- One Student ID ↔ one passport; the Student ID is the key for every update, so one student's data can never reach another passport.
- Passports are issued from BTU's data (brief stage 1–3): a student listed in the registry gets version 1, with their confirmed skills or none yet.
- Quick registration (a student signing up with their @btu.edu.ge email) only **reserves** the passport: it shows the Passport ID and name at once, but nothing is signed or anchored until BTU's data confirms the student — the registry lists them (matched by email, then Student ID adopted; name must match) or an administrator adds their first skill.

## §2 / §4 Google Sheets integration and automatic updates

- **Two registry layouts are read**, both described by BTU: the combined "Passport Skill Records" sheet of the test workbook, and the brief's three registries — **Students**, **Skills Catalog**, **Verified Skills** (joined by Student ID and Skill ID). Columns are matched by header name, not position.
- **Reading:** a Google service account (JWT → OAuth token, `jose`) reads every tab with the Sheets API v4. The same pipeline accepts an uploaded `.xlsx` (optional feature in the brief).
- **Detecting changes:** an Apps Script `onChange` trigger calls `POST /api/sync/webhook` within seconds; a daily Vercel Cron (`/api/cron/sync`) and the admin "Sync now" button cover missed events. A database lock stops two syncs running at once.
- **Validation:** the workbook's completeness rule (A–M and O–Q populated; Passport ID / First Issued may be empty only for a new student, as the system assigns them), valid IDs, category ∈ {AI Skill, AI Applied Skill, AI Advanced Skill}, badge code consistent with the category (column N is derived), real dates, BTU email domain, characters the PDF font can print. In the three-registry layout an award whose Student ID or Skill ID is not in its registry is stopped. Invalid rows are reported and never processed.
- **Only CONFIRMED awards** reach the passport when a status column exists; PENDING / REJECTED are skipped, and a later change to CONFIRMED is picked up on the next sync. No approval workflow is modeled (workbook note): the registry is the source of verified data.
- **Matching (§4.3):** by Student ID; a name or Passport ID mismatch stops the row ("a wrong ID never updates another student's passport").
- **Idempotency (§4.6):** `import_records` is a ledger keyed by Record ID with a hash of the row's verified content. Re-syncing skips processed records; editing an already-issued record is refused; the same Skill ID is never printed twice for one student.
- **Write-back** (workbook notes): the permanent Passport ID is written to **every** row of the student (or the Students tab), and Sync Status / Version / Synced At / Notes (Q–T) to each record. A record is written as `SYNCED` only after its version is anchored.

## §3 PDF generation

- Generated on the server with `pdf-lib` on BTU's original 4-page template; nobody fills PDFs by hand.
- Artwork lives in `src/server/pdf/assets/`: the template, BTU's three skill stamps and the five cover stickers. `npm run assets:pdf` draws the static artwork (cover sticker cluster, stamp legend on the About page) onto the template once and embeds everything as base64.
- Cover: name, surname, the fixed **first-issue date**, the verification code + QR and "VERSION n · date" of this version.
- Each skill stamp is pressed at a small angle derived from the skill name, so it looks hand-stamped but stays reproducible.
- More than 10 skills → extra card pages; more than 5 → extra detail-table pages (copies of the template pages).
- Long names shrink to fit, then wrap onto two lines.
- Changing the design changes the bytes, so versions issued before the change no longer re-generate to their anchored hash. After a design change, start the demo from a fresh database (locally: delete `.data/pglite`; it migrates and re-seeds on the next start).
- **Byte-for-byte reproducible**: fixed metadata dates and no locale-dependent formatting. An issued PDF is never stored; it is rebuilt on download and served only if its SHA-256 equals the anchored hash.

## §5 Blockchain verification

- Each version's **leaf** = SHA-256(`BTU-AISP-v1 | Passport ID | version | verification code | SHA-256(PDF)`).
- Every sync builds a **Merkle tree** of all new leaves and sends **one transaction**: a zero-value transaction from the BTU issuer address to itself, with calldata `BTU-AISP:<root>`. No smart contract to deploy or maintain.
- Each version stores its Merkle proof. Verification recomputes leaf → proof → root and reads the transaction live from the chain to check the root and the sender.
- **Changed by one byte?** The PDF hash changes → the file check fails (tested, including in the browser).
- Only hashes go on-chain; no personal data.

## §6 Issuer authenticity

- Each version is also signed (EIP-191) by the BTU issuer key; anyone can recover the signer address.
- That address is published in BTU's **W3C `did:web` document** at `https://<BTU domain>/.well-known/did.json` (`blockchainAccountId`). Control of the domain is what ties the key to BTU, which satisfies the requirement that a bare address alone is not enough. For the hackathon the DID is `did:web:<APP_URL host>`; in production it becomes `did:web:btu.edu.ge`.
- The anchoring transaction is sent **from** that same address, so the on-chain record itself is attributable to BTU.

## §7 Verification code

- Per-version code `BTU-XXXX-XXXX-XXXX` (12 random characters ≈ 59 bits, no look-alike letters), different from the permanent Passport ID. Passport IDs are deliberately not public lookup keys, so the sequential `BTU-AI-000125` style IDs can't be used to enumerate students.
- `/verify` needs no account. It shows four separate checks: **official record**, **issuer**, **blockchain**, **PDF file**. The file is hashed in the browser (Web Crypto), so it is never uploaded.
- Only initials, a masked Passport ID, the version, the date and the skill count are shown. Lookups are rate-limited (30/min/IP).

## §8 Versions

- `passport_versions` keeps every version with its snapshot of skill IDs, code, PDF hash, signature and Merkle proof. Earlier versions are never modified.
- A version becomes the latest active one only after anchoring is confirmed (`anchor_status = anchored`). If anchoring fails, the previous version stays current and the new one waits in the retry queue (cron or the admin "Retry pending" button).
- `/verify` distinguishes: authentic + current · authentic + superseded · modified file · unknown code · not issued yet.

## §9 Student access

- Sign-in only with `@btu.edu.ge` accounts: password (scrypt-hashed, rate-limited) or Google Workspace OAuth (PKCE, nonce, signed ID token, `hd` claim checked).
- Password sign-up proves the student owns the mailbox first: a 6-digit code is emailed (10 minutes, 5 tries) and no account exists until it is confirmed, so nobody can claim another student's passport by typing their email. Outside production the code is also shown on screen; in production a mail provider (`RESEND_API_KEY`, `MAIL_FROM`) is required, otherwise sign-up is Google-only.
- Sign-in attempts are limited per IP, per IP+email and per email (across all IPs).
- Pages can't be framed by other sites (`X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'`); expired sessions are deleted by the daily cron.
- `/verify` rebuilds each version's Merkle leaf from the record instead of trusting the stored one, so an edited database value breaks the signature and blockchain checks. It shows initials only.
- Students can only ever load their own passport. The PDF endpoint checks the session itself.
- Admin actions check the role on the server in every function; CSRF protection covers all server functions; SQL is parameterized through Drizzle.

## §10 Scale (≥ 5,000 passports per year)

- **Blockchain cost is flat per sync, not per passport:** 5,000 updates in one sync means one transaction, about 21,000 gas plus calldata. Proofs are log₂(n) hashes (13 for 5,000).
- **Database:** indexed lookups (verification code, PDF hash, Record ID, student). The PDFs themselves are not stored (reproducible), so storage grows by about 1 KB per version.
- **Processing:** sync is idempotent and resumable. The Record ID ledger makes re-runs safe, and the anchoring queue retries failures. For very large bulk loads, `npm run db:sync` runs without a request timeout. In production, issuance could be split into chunks across background jobs (e.g. Vercel Queues) with no change to the data model.
- **Serverless-safe:** rate limits and locks live in Postgres, not in memory.
