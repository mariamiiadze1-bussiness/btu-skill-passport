# BTU AI Skills Digital Passport — Briefing for the Jury

What was built, how it works, and answers to the questions judges are most likely to ask.

- **Live site:** https://btu-skill-passport.vercel.app
- **Deeper reading:** [ARCHITECTURE.md](ARCHITECTURE.md) (design, section by section against the brief) · [DEMO.md](DEMO.md) (the 14 test scenarios, step by step)

## The system in one paragraph

BTU confirms AI skills in a Google Sheet (or an Excel workbook). The system reads the sheet, validates every row, matches it to the right student by Student ID, and issues a new **version** of that student's passport: an official multi-page PDF on BTU's design. It hashes the PDF, signs it with BTU's issuer key, and records one Merkle root per sync on the **Ethereum Sepolia** blockchain. Students sign in with their `@btu.edu.ge` account to view, download, and share their passport. Anyone (an employer, for example) can verify a passport on `/verify` without an account by typing the code, scanning the QR, or dropping in the PDF file itself.

## Technical work completed

### Stack

| Part        | Technology                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Web app     | React 19 + TanStack Start (server functions, file routing), Tailwind CSS 4                       |
| Database    | PostgreSQL through Drizzle ORM: Neon (Frankfurt) in production, embedded PGlite for local dev |
| PDF         | `pdf-lib` on BTU's original 4-page template, with BTU's stamp and sticker artwork embedded      |
| Blockchain  | `viem` on Ethereum Sepolia: one transaction per sync, Merkle proofs per passport version        |
| Identity    | W3C `did:web` document at `/.well-known/did.json` + EIP-191 signatures                          |
| Auth        | BTU-domain password accounts (scrypt) and Google Workspace OpenID Connect (PKCE, `hd` claim)    |
| Hosting     | Vercel (serverless functions + daily cron)                                                      |
| Tests       | Vitest: 57 end-to-end server tests against an in-memory Postgres                                |

### Features delivered

1. **Registry sync.** The app reads both layouts BTU described: the combined "Passport Skill Records" sheet and the three-tab version (Students, Skills Catalog, Verified Skills). Changes arrive through an Apps Script webhook within seconds, a daily cron, or the admin's **Sync now** button. Excel upload runs through the same pipeline.
2. **Validation and safety.** Every row is checked: required columns, valid IDs, a real category, a badge code that matches it, real dates, the BTU email domain, and characters the PDF font can print. A row whose name doesn't match its Student ID is stopped. Bad rows are listed in the admin panel with their row number, and the reason is written back to the sheet.
3. **Idempotency.** A ledger keyed by Record ID means re-syncing the same data never adds a skill twice. A skill already on a passport is never printed twice.
4. **Versioned passports.** The Passport ID and first-issue date are permanent. Each update creates a new version with its own verification code (`BTU-XXXX-XXXX-XXXX`). Old versions stay verifiable and are shown as "superseded".
5. **Official PDF.** Generated on the server on BTU's template: name, first-issue date, version, verification code, QR code, and tilted skill stamps. More skills add more pages. The PDF is **byte-for-byte reproducible**, so it isn't stored: it is rebuilt on download and served only if its hash equals the anchored one.
6. **Blockchain anchoring.** One Merkle root per sync goes on-chain as a zero-value transaction from BTU's issuer address to itself. There is no smart contract to deploy, audit, or maintain.
7. **Public verification (`/verify`).** Four separate checks: official record, issuer (BTU signature + DID), blockchain anchor (with an Etherscan link), and the PDF file itself, hashed in the browser so it is never uploaded.
8. **Student dashboard.** Passport details, copy/verify code, **Add to LinkedIn**, PDF view and download, version history showing what each version added, and the skill stamp collection.
9. **Admin panel.** Sync and Excel import, records that need attention, a sign-up approval queue, **adding a skill to one or many students at once** (one blockchain transaction for the whole group), the blockchain queue with a retry button, and recent verification checks.
10. **Bilingual UI.** Georgian and English, switchable on every page.

### Security work

- **BTU accounts only**, enforced on the server for password sign-in, registration, and Google sign-in. Google sign-in requires `email_verified` and the Workspace `hd` claim, so personal Gmail accounts are refused.
- **Email ownership:** password sign-up sends a 6-digit code (10 minutes, 5 tries) before any account exists, so nobody can claim another student's passport by typing their email. Self sign-ups also wait in an admin approval queue.
- **Passwords:** scrypt with a per-user salt and constant-time comparison. Unknown email and wrong password give the same response.
- **Sessions:** random 256-bit token in an `httpOnly`, `SameSite=Lax`, `Secure` cookie. Only its SHA-256 is stored.
- **Rate limits** stored in Postgres (they work on serverless): sign-in, registration, and verification.
- **SQL injection:** every query is parameterized through Drizzle. Inputs are validated with zod. Tests send injection payloads into every input.
- **CSRF** protection on all server functions. **Clickjacking** blocked with `X-Frame-Options` and CSP `frame-ancestors`.
- **Privacy:** only hashes go on-chain. `/verify` shows initials and a masked Passport ID. Passport IDs can't be used for lookups, so students can't be enumerated.

## Likely questions and answers

### Blockchain

**Why use a blockchain at all? Wouldn't a database be enough?**
A database is controlled by whoever runs it, so an employer has to trust BTU's server. The blockchain record is public and can't be changed after the fact, even by BTU. Anyone can check that a passport's fingerprint was recorded by BTU's address on a specific date, without trusting our server. If our site went offline, the on-chain proof would still exist.

**Why Ethereum Sepolia and not mainnet?**
Sepolia is Ethereum's official test network: same software and security model, but free test ETH. It is the right choice for a pilot. Moving to mainnet or a cheaper production chain (Polygon, Base) is one environment variable, `ANCHOR_CHAIN`. Nothing in the code changes.

**How much would this cost at BTU's scale (5,000+ passports a year)?**
Very little, because cost is per **sync**, not per passport. Each sync sends one transaction holding a Merkle root, whether it covers 1 passport or 5,000. About 21,000 gas plus a small amount of calldata. Even one sync a day on a production L2 is a few dollars a year.

**What is a Merkle tree and why use one?**
It combines many fingerprints into one root hash. Each passport version keeps a short proof (13 hashes for 5,000 passports) that shows its fingerprint is part of that root. One transaction can then prove thousands of passports individually.

**Is any personal data on the blockchain?**
No. Only a root hash goes on-chain. Each passport's leaf is a SHA-256 hash of the Passport ID, version, verification code, and the PDF's hash. Names, emails, and skills never leave BTU's database.

**Why no smart contract?**
A contract adds deployment, auditing, and upgrade risk, and buys nothing here. A transaction from BTU's address carrying the root is already public, timestamped, and attributable to BTU.

### Trust and verification

**How does an employer know a passport is really from BTU and not someone with their own wallet?**
Three things line up. (1) Each version is signed by BTU's issuer key. (2) That key's address is published in BTU's `did:web` document on BTU's own domain, so control of the domain ties the key to BTU. (3) The blockchain transaction is sent from that same address. A bare wallet address alone wouldn't prove anything; the domain link does.

**What happens if someone edits the PDF?**
Changing even one character changes the file's SHA-256, so the "PDF file" check on `/verify` fails with "File does not match". We demo this live.

**What if someone edits the database directly?**
`/verify` rebuilds each version's fingerprint from the stored record instead of trusting a stored value. An edited record no longer matches the BTU signature or the on-chain root, so those checks fail.

**What's the difference between the Passport ID and the verification code?**
The Passport ID (`BTU-AI-000125`) is permanent and identifies the student's passport. Each issued version gets its own random verification code (`BTU-XXXX-XXXX-XXXX`, about 59 bits). Employers verify with the code. Passport IDs are sequential, so they are deliberately not accepted as lookups; otherwise anyone could list every student.

**How do you handle old versions?**
Every version stays verifiable forever. `/verify` says whether a code is the **current** version or an authentic but **superseded** one, so an employer holding an old PDF knows a newer one exists.

### Data and the Google Sheet

**What if BTU staff make a mistake in the sheet?**
The row is stopped, not guessed at. Wrong Student ID, name mismatch, missing columns, an invalid category or date: the row appears in the admin panel under "Records that need attention" with its row number, and the reason is written back to the sheet. A wrong ID can never update another student's passport.

**What if the same data is synced twice?**
Nothing happens. A ledger keyed by Record ID skips anything already processed, and the same skill is never added twice to one passport. Tested by importing the same workbook twice.

**How fast does a new skill appear?**
A few seconds when the Apps Script trigger is installed: the sheet calls our webhook on every change. Otherwise on the daily cron or when an admin clicks **Sync now**.

**Can BTU switch from Google Sheets to its own student system later?**
Yes. The data source sits behind one interface (`RegistrySource` in `src/server/registry/sources.ts`). A BTU API would be one new implementation. Validation, issuance, PDF, and blockchain stay the same.

**Can an admin give the same skill to a whole group, e.g. everyone in a bootcamp?**
Yes. In the admin panel, search and tick any number of students (or "Select all shown"), pick the skill, and issue. Every passport is updated in one blockchain transaction. Students who already have that skill are skipped and listed.

### Accounts and security

**Can a student see someone else's passport?**
No. A student can only load their own passport. The PDF endpoint checks the session itself, and every admin action checks the role on the server, not just in the page.

**How do you stop someone registering with another student's email?**
Password sign-up emails a 6-digit code first; no account exists until it is entered. Google sign-in proves ownership through Google. Self sign-ups also go into an approval queue: no skills are added until BTU approves them.

**Why do you only allow `@btu.edu.ge` emails?**
The passport certifies BTU students. The domain check runs on the server for every sign-in path, and Google sign-in checks the Workspace `hd` claim, which personal Gmail accounts don't have.

**What about brute-force attacks?**
Rate limits per IP, per IP+email, and per email (across all IPs), stored in Postgres so they hold across serverless instances. Sign-in is limited to 8 attempts per 15 minutes.

### PDF

**Why not store the PDFs?**
The generator is byte-for-byte reproducible: fixed metadata and no locale-dependent formatting. The server rebuilds the PDF on demand and serves it only if its hash equals the anchored one. That saves storage (about 1 KB per version instead of a file) and guarantees the downloaded file is exactly the one on the blockchain.

**What if a student has many skills?**
Extra pages are added automatically: more card pages after 10 skills, more detail-table pages after 5. Long names shrink to fit, then wrap.

### Scale and operations

**Will it handle 5,000+ passports a year?**
Yes. Blockchain cost is flat per sync. Database lookups are indexed. Storage grows about 1 KB per version. Sync is resumable and safe to re-run, and failed anchoring goes into a retry queue. For very large bulk loads, `npm run db:sync` runs without a request time limit.

**What if the blockchain is down or the wallet runs out of test ETH?**
The previous version stays current; a new version only becomes "latest" once its anchor is confirmed. Pending versions wait in a queue that the cron and the admin's **Retry pending** button process. The admin panel shows the wallet balance and warns when it needs funding.

**How is it tested?**
57 automated end-to-end tests run against a real (in-memory) Postgres. They cover each scenario in the brief, the security rules (injection, access control, sign-up), PDF reproducibility, tamper detection, and multi-student issuing.

### Honest limitations (say these before you're asked)

- **Testnet.** Anchoring is on Sepolia. Production would move to mainnet or an L2 with one setting.
- **Hackathon identity.** The DID currently lives on the app's own domain. In production it moves to `did:web:btu.edu.ge`, which needs BTU to host one small JSON file.
- **Email codes.** Real mail delivery needs a mail provider key (Resend). For testing, a switch (`ALLOW_UNVERIFIED_SIGNUP`) lets email sign-up skip the code; those accounts still go through the admin approval queue. It must be off in production.
- **Google sign-in** is limited to listed test users until the Google Cloud app is published.
