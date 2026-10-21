# BTU AI Skills Digital Passport — Architecture

How the system meets the hackathon brief (_ჰაკათონის დავალების აღწერა_), section by section.

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
                          issuance.ts         one new version per affected student:
                                              PDF → SHA-256 → Merkle leaf → BTU signature
                                                                  ▼
                          anchoring/          one Merkle root per batch → Ethereum (Sepolia)
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
| Blockchain      | `src/server/anchoring/`                                                 | `ANCHOR_CHAIN` (any EVM chain), or a new `AnchorProvider`               |
| Issuer identity | `src/server/issuer.ts`, `/.well-known/did.json`                         | `ISSUER_DID` (e.g. `did:web:btu.edu.ge`) and `ISSUER_PRIVATE_KEY`       |
| Email           | `src/server/mail.ts`                                                    | Implementing `Mailer` (for BTU email verification codes, notifications) |
| Database        | `src/server/schema.ts`, `drizzle/`                                      | Any PostgreSQL (`DATABASE_URL`)                                         |

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
- More than 10 skills → extra card pages; more than 5 → extra detail-table pages (copies of the template pages).
- Long names shrink to fit, then wrap onto two lines.
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
- Students can only ever load their own passport. The PDF endpoint checks the session itself.
- Admin actions check the role on the server in every function; CSRF protection covers all server functions; SQL is parameterized through Drizzle.

## §10 Scale (≥ 5,000 passports per year)

- **Blockchain cost is flat per sync, not per passport:** 5,000 updates in one sync means one transaction, about 21,000 gas plus calldata. Proofs are log₂(n) hashes (13 for 5,000).
- **Database:** indexed lookups (verification code, PDF hash, Record ID, student). The PDFs themselves are not stored (reproducible), so storage grows by about 1 KB per version.
- **Processing:** sync is idempotent and resumable. The Record ID ledger makes re-runs safe, and the anchoring queue retries failures. For very large bulk loads, `npm run db:sync` runs without a request timeout. In production, issuance could be split into chunks across background jobs (e.g. Vercel Queues) with no change to the data model.
- **Serverless-safe:** rate limits and locks live in Postgres, not in memory.
