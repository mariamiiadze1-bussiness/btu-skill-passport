# Demo Day checklist

Each row of the brief's scenario table (_სცენარი → მოსალოდნელი შედეგი_), and how to show it live. Every scenario is also covered by an automated test in `src/test/server.test.ts`.

**Before the demo:** fund the issuer wallet and set `ANCHOR_PROVIDER=evm` (README → "Set up the blockchain"), delete `.data/`, then run `npm run dev`. Sign in as the admin in one browser window and as `btu-t-0001@btu.edu.ge` (Giorgi) in a private window.

| #   | Scenario                              | Expected result                                          | How to show it                                                                                                                                                                                                                          |
| --- | ------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Add a new student                     | One passport with a permanent ID                         | Add a row (or a Students-tab entry) for a new Student ID and sync → one passport with a new permanent Passport ID, written back to the sheet. A student who registers first sees their reserved Passport ID; BTU's data then issues it. |
| 2   | First passport generation             | Multi-page PDF on BTU's design                           | Giorgi → **View passport PDF** (4 pages, name, date, QR, stamps).                                                                                                                                                                       |
| 3   | New verified skill added to the sheet | Detected and processed automatically                     | Admin → **Import Excel** with `fixtures/btu-hackathon-test-data.xlsx` (or edit the Google Sheet; the Apps Script webhook syncs within seconds).                                                                                         |
| 4   | New skill appears on the passport     | The student's existing passport is updated               | Giorgi's dashboard → v2, "Added: AI Data Analysis, AI Business Decision Support", plus a notification.                                                                                                                                  |
| 5   | Same data synced again                | Nothing is added twice                                   | Import the same file again → "0 new records … 60 already on passports".                                                                                                                                                                 |
| 6   | Wrong student ID                      | The row is stopped                                       | Change a row's name (or Student ID) so it doesn't match the registry → sync → the admin panel lists it under "Records that need attention" with its row number; the sheet's column T gets the reason.                                   |
| 7   | Passport update                       | Same Passport ID, same first-issue date, old skills kept | Compare v1 and v2 on Giorgi's dashboard.                                                                                                                                                                                                |
| 8   | New version issued                    | New official PDF and verification record                 | v2 has its own code; the admin panel → Blockchain shows the batch transaction (Etherscan link).                                                                                                                                         |
| 9   | Unchanged PDF checked                 | Passes blockchain verification                           | `/verify` → enter the code → **Check a PDF file** → the downloaded PDF → all checks pass.                                                                                                                                               |
| 10  | Modified PDF checked                  | Mismatch detected                                        | Edit the PDF (any PDF editor, even one character) → check it → "✕ File does not match".                                                                                                                                                 |
| 11  | Issuer identity                       | BTU's (test) identity confirmed                          | The "Issuer: BTU" check links to `/.well-known/did.json`; its address equals the sender of the Etherscan transaction.                                                                                                                   |
| 12  | Old version checked                   | Authentic, but not the latest                            | Giorgi → Previous versions → **Verify** on v1 → "Valid · superseded version".                                                                                                                                                           |
| 13  | Student access                        | View and download own passport                           | Giorgi: View / Download PDF. Signed out, `/api/passport/1/pdf` returns 401, and `/admin` redirects.                                                                                                                                     |
| 14  | Public verification                   | Works without an account                                 | Open `/verify?code=…` (or scan the PDF's QR code) in a private window.                                                                                                                                                                  |

**Also worth showing:**

- Typing the Passport ID on `/verify` explains that the verification code is needed. The Passport ID can't be looked up, for privacy.
- **Add to LinkedIn**, and the Georgian/English toggle.

**Talking points for the jury:**

- **Architecture:** `docs/ARCHITECTURE.md`.
- **Scale:** one blockchain transaction per sync, whether it holds 1 passport or 5,000.
- **Swappable parts:** chain, data source, PDF design and mail, each in its own module.
