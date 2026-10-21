# BTU AI Skills Digital Passport

A permanent, versioned, blockchain-verifiable digital passport of the AI skills BTU confirms for its students. BTU adds verified skills in Google Sheets (or an Excel file). The system updates the right student's passport, builds the official PDF on BTU's design, anchors it on Ethereum, and lets anyone verify it without an account.

Architecture, blockchain design, and how each hackathon requirement is met: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Step-by-step demo of the 14 test scenarios: **[docs/DEMO.md](docs/DEMO.md)**.

This project was built with [Lovable](https://lovable.dev). Continue in the [Lovable editor](https://lovable.dev/projects/020ec0f1-82f4-4b2f-b404-1520a4c9979e); commits to `main` sync back to Lovable.

## How the site works

| Page                    | Who                | What happens                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth`                 | Students, admins   | Sign in with a **@btu.edu.ge** account (password or **Continue with Google**). **Quick registration** (name + BTU email) reserves the student's Passport ID at once; BTU issues the passport once its data confirms the student. Admin accounts can't be self-registered. |
| `/`                     | Signed-in student  | Their own passport: Passport ID, current version, **verification code** (copy / verify / add to LinkedIn), skill stamps, and version history showing what each version added.                                                                                             |
| `/passport/:version`    | Signed-in student  | The official multi-page PDF, rebuilt on the server and served only if it matches the anchored hash.                                                                                                                                                                       |
| `/verify`               | Anyone, no account | Enter the code or scan the QR → four checks: official record, issuer (BTU signature + DID), blockchain anchor (Etherscan link), and optionally the **PDF file itself** (hashed in the browser). Shows current vs superseded.                                              |
| `/admin`                | Admins only        | **Sync from Google Sheets** or **import the Excel workbook**, see failed/skipped rows with reasons, add a skill by hand, watch the blockchain queue and batches.                                                                                                          |
| `/.well-known/did.json` | Public             | BTU's issuer identity (W3C did:web) with the address that signs passports.                                                                                                                                                                                                |

**Registry layouts:** the combined "Passport Skill Records" sheet (test workbook) or the brief's three tabs — Students, Skills Catalog, Verified Skills.

**Lifecycle:** BTU adds a CONFIRMED record to the sheet → sync validates it and matches the student by Student ID → one new version per student (PDF → SHA-256 → BTU signature) → one Merkle root per sync goes on Sepolia → the version becomes current → status is written back to the sheet.

**Passport ID vs verification code:** the Passport ID (`BTU-AI-000125`) is permanent and never changes. Each issued version has its own verification code (`BTU-XXXX-XXXX-XXXX`, on the PDF cover and in the QR). The code is what employers use on `/verify`.

### Security

- **SQL injection:** every query is a parameterized statement through Drizzle ORM. Inputs are validated (zod and the sheet validator) before they reach the database. Tested with injection payloads in every input.
- **BTU accounts only:** sign-in, registration and Google sign-in all refuse emails outside `ALLOWED_EMAIL_DOMAIN` (default `btu.edu.ge`), enforced on the server.
- **Google sign-in:** OpenID Connect with PKCE, `state` and `nonce`. The signature is checked against Google's keys. It requires `email_verified` and the Workspace `hd` claim, so personal Gmail accounts are refused.
- **Passwords:** scrypt with a per-user salt, constant-time comparison, and the same response for unknown emails and wrong passwords.
- **Sessions:** a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only its SHA-256 is stored. Sessions expire after 7 days.
- **Admin:** every admin server function checks the role on the server. The CSRF middleware rejects cross-site calls.
- **Brute force:** rate limits are stored in Postgres (they work on serverless): sign-in 8 per 15 min, verification 30 per minute, registration 10 per hour.
- **Privacy:** the verify page shows initials, a masked Passport ID, the version and the skill count. Passport IDs can't be used for lookups, so nobody can enumerate students. Only hashes go on-chain.
- **Secrets:** stored only in `.env` (git-ignored) or in Vercel's environment variables. See `.env.example`.

## Development

You need Node.js 22 or newer. No database install is needed: locally the app uses an embedded Postgres (PGlite) in `.data/`. On first run it creates its tables and loads BTU's hackathon workbook: 18 students, and their SYNCED records as version 1.

```sh
npm install
cp .env.example .env      # set ADMIN_PASSWORD, SEED_STUDENT_PASSWORD, ISSUER_PRIVATE_KEY (see comments)
npm run dev               # http://localhost:8080
npm test                  # covers the brief's demo scenarios, security and PDFs
```

**Demo script** (spec "MVP demonstration"):

1. Sign in as the admin → **Import Excel** → choose `fixtures/btu-hackathon-test-data.xlsx`. The 44 NOT SYNCED records are added, and each affected student gets a new version.
2. Import it again → nothing changes (idempotent).
3. Sign in as `btu-t-0001@btu.edu.ge` (Giorgi) → v2 with 4 skills, the same Passport ID and the same first-issue date.
4. Click **Verify this version** → all checks pass. Check the downloaded PDF → it matches. Edit the PDF and check it again → "File does not match".
5. Verify the v1 code from the history → authentic but **superseded**.

To start the local database over, delete `.data/` and restart.

Database commands (these need `DATABASE_URL` set):

```sh
npm run db:setup      # apply migrations + seed
npm run db:sync       # sync from Google Sheets with no time limit (bulk loads)
npm run db:generate   # after editing src/server/schema.ts, create a new migration in drizzle/
```

## Set up the blockchain (Ethereum Sepolia)

1. Generate the BTU issuer key, put it in `ISSUER_PRIVATE_KEY`, and note its address (the admin panel shows it):
   `node -e "import('viem/accounts').then(m=>{const k=m.generatePrivateKey();console.log(k, m.privateKeyToAccount(k).address)})"`
2. Send the address free test ETH from a Sepolia faucet, for example [Google Cloud's faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia). 0.05 ETH covers thousands of batches.
3. Set `ANCHOR_PROVIDER=evm` (and optionally `ANCHOR_RPC_URL` for a dedicated RPC), then restart. Every sync now anchors one transaction, shown with an Etherscan link on `/verify` and in the admin panel.
4. To use another network, set `ANCHOR_CHAIN` (`polygonAmoy`, `baseSepolia`, `polygon`, …). To use a different technology, implement `AnchorProvider` in `src/server/anchoring/`.

## Set up Google Sheets sync

1. In Google Cloud: enable the **Google Sheets API**, create a **service account**, and download its JSON key.
2. Share the sheet with the service account's `client_email` as **Editor**, so sync results can be written back to columns G and Q–T.
3. Set `GOOGLE_SHEETS_SPREADSHEET_ID` (from the sheet URL), `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (keep the `\n` sequences).
4. **Instant sync on every edit:** in the sheet, open **Extensions → Apps Script**, paste the script below, set the two values, then add a trigger: **Triggers → Add trigger → onSheetChange → From spreadsheet → On change**.

```js
const URL = "https://<your-domain>/api/sync/webhook";
const SECRET = "<SYNC_WEBHOOK_SECRET>";
function onSheetChange() {
  UrlFetchApp.fetch(URL, {
    method: "post",
    headers: { Authorization: "Bearer " + SECRET },
    muteHttpExceptions: true,
  });
}
```

In the sheet, protect columns Q–T (**Data → Protect sheets and ranges**) so that only the service account can edit them, as the workbook's notes require.

A daily Vercel Cron (`vercel.json`) and the admin **Sync now** button act as a safety net. Columns are matched by header name, so reordering columns is safe. To accept a renamed column, add its header to `COLUMNS` in `src/server/registry/format.ts`.

## Set up Google sign-in

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**. Choose **Internal**, which limits sign-in to the btu.edu.ge Workspace. This needs a BTU Workspace admin.
2. Go to **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**, with these redirect URIs:
   - `http://localhost:8080/api/auth/google/callback`
   - `https://<your-domain>/api/auth/google/callback`
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and restart. Until then, the button explains that Google sign-in isn't connected.

**BTU email verification codes** (planned): the `users.email_verified_at` field and the `Mailer` interface in `src/server/mail.ts` are in place. Add a provider there and a code step to registration. Google sign-in already marks emails as verified.

## Deploy to Vercel

1. In Vercel, import the GitHub repo. `vercel.json` sets the build command and a daily sync cron.
2. Under **Storage**, add a **Neon** Postgres database. This sets `DATABASE_URL`.
3. Under **Settings → Environment Variables**, add everything from `.env.example`. At minimum: `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ISSUER_PRIVATE_KEY`, `ANCHOR_PROVIDER=evm`, `CRON_SECRET`, `SYNC_WEBHOOK_SECRET`. Leave `SEED_STUDENT_PASSWORD` and `EMAIL_DOMAIN_REWRITE` empty in production.
4. Create the tables once from your machine: put the production `DATABASE_URL` and the same settings in `.env`, run `npm run db:setup`, then restore your local `.env`.
5. Deploy. Run `npm run db:migrate` the same way whenever you add a migration.

## Project layout

```
src/server/registry/   sheet format, validation, sync engine, Google Sheets / Excel sources
src/server/pdf/        PDF generator + embedded template and stamp images (npm run assets:pdf)
src/server/anchoring/  blockchain providers (EVM), swappable
src/server/            schema, issuance, Merkle tree, issuer identity, auth, admin, verify
src/lib/api.ts         server functions: the only bridge between pages and the server
src/routes/            pages and HTTP endpoints (PDF, DID, webhook, cron, Google OAuth)
drizzle/               SQL migrations
fixtures/              BTU's hackathon test workbook
scripts/               DB CLI, PDF asset embedding
docs/ARCHITECTURE.md   how each requirement is met
```
