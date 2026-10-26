# BTU AI Skills Digital Passport

**Live:** https://btu-skill-passport.vercel.app · **Verify any passport:** https://btu-skill-passport.vercel.app/verify

A permanent, versioned passport of the AI skills BTU confirms for each student. It is issued as an official PDF and proven on the Ethereum blockchain. Anyone can verify it in seconds, without an account.

## How it works

1. **BTU records a skill** in Google Sheets (or uploads the Excel workbook).
2. **The system syncs it:** checks every row, matches the student by Student ID, and never adds the same record twice.
3. **A new passport version is issued:** an official PDF on BTU's design, with a QR code and a unique verification code.
4. **It is anchored on-chain:** the PDF's fingerprint is signed by BTU and recorded on Ethereum (Sepolia). One transaction covers the whole sync.
5. **Anyone verifies it** at `/verify` by entering the code, scanning the QR, or dropping in the PDF.

## What's built

- **Students:** sign in with a BTU account (Google or email), view and download the passport, see version history, add it to LinkedIn.
- **Admins:** sync or import, see rows that need fixing, approve sign-ups, give a skill to one or many students at once, watch the blockchain queue.
- **Verification:** 4 checks: official record, issuer (BTU), blockchain, and the PDF file itself.
- **Security:** BTU-only accounts, hashed passwords, rate limits, SQL-injection-safe queries, no personal data on-chain.
- **Georgian and English**, works on phones. **57 automated tests.**

## Questions judges may ask

**Why a blockchain and not just a database?**
A database can be edited by whoever runs it. The on-chain record is public and permanent. An employer can confirm the passport without trusting BTU's server, and the proof survives even if the site goes offline.

**What happens if someone edits the PDF?**
Changing even one character changes its fingerprint, and `/verify` shows "File does not match". We can demo this live.

**How do we know it's really BTU?**
Every passport is signed by BTU's key. That key is published on BTU's own website, as a standard W3C `did:web` identity, and the blockchain transaction is sent from that same key.

**What does it cost at 5,000+ passports a year?**
Almost nothing. Cost is per sync, not per passport: one transaction covers 1 or 5,000 passports, thanks to a Merkle tree.

**Is personal data on the blockchain?**
No. Only a hash goes on-chain. Names, emails and skills stay in BTU's database.

**What if BTU staff make a mistake in the sheet?**
The row is stopped, not guessed at. A wrong ID or mismatched name never reaches another student's passport. The admin panel lists the row and the reason, and the reason is written back to the sheet.

**What if the same data is synced twice?**
Nothing changes. Every record is tracked by its Record ID.

**What happens to old versions?**
They stay verifiable forever and show as "superseded", so an employer knows a newer version exists.

**Can a student see someone else's passport?**
No. Students see only their own. Admin actions are checked on the server, not just hidden in the page.

**Can BTU replace Google Sheets later?**
Yes. The data source, the blockchain network and the PDF design are each in their own module. Switching networks is one setting.

## How each part works (in simple words)

**How is a PDF compared to the original?**
1. When BTU issues a passport, the server computes the PDF's **SHA-256 fingerprint**: a 64-character code calculated from every byte of the file. It is saved with that version, signed by BTU and put on-chain.
2. When someone drops a PDF on `/verify`, their **browser** computes the same fingerprint. The file itself is never uploaded.
3. The server looks up that fingerprint. Same fingerprint = the exact same file, byte for byte ("PDF matches"). Any change, even one character, gives a completely different fingerprint ("PDF modified").
4. The stored fingerprint cannot be quietly swapped either: it is part of what BTU signed and what is on the blockchain, so changing it breaks those checks.

**How does the verification code work?**
Each passport version gets its own random code (like `BTU-BEY6-62E7-SAZ5`), printed on the PDF and inside its QR code. Typing it or scanning the QR opens that exact version on `/verify`. It reveals only initials, a masked Passport ID and the skill count, never the email or skill details.

**What are the 4 checks on `/verify`?**
1. **Official record:** the code exists and the version was officially issued.
2. **Issuer:** BTU's digital signature is valid and comes from the key BTU publishes.
3. **Blockchain:** the version is inside the batch recorded on Ethereum, and that transaction was sent by BTU's address.
4. **PDF file** (if one is dropped in): its fingerprint matches the original.

**How does the blockchain part work?**
After a sync, each new passport version becomes one short fingerprint. All of them are combined into one "root" fingerprint (a Merkle tree, like a family tree of fingerprints), and only that root is sent to Ethereum in **one transaction**. Each passport keeps a small "proof" showing it belongs to that root, so it can be checked on its own.

**How does the BTU signature work?**
BTU has a private key, like a digital stamp only BTU holds. Each passport version is stamped with it. Anyone can check the stamp with BTU's public key, which is published in BTU's identity file (`/.well-known/did.json`). A forged passport cannot carry a valid stamp.

**How does the sync from Google Sheets / Excel work?**
The system reads every row and checks it: Student ID exists, name matches, status is CONFIRMED, skill and date are valid. Good rows go onto the right passport and create a new version. Bad rows are stopped and listed with the reason. Each row has a Record ID, so syncing twice never adds it twice.

**How do versions work?**
Every change creates a new version (v1, v2, v3…) with its own code and PDF. The newest is "active". Older ones stay valid but show "superseded", so an employer holding an old PDF learns a newer one exists.

**How do students get access?**
Students sign in with a BTU Google account or a BTU email. Self sign-ups wait in the admin's approval queue, so only real BTU students get a passport.

**What does the admin see?**
Counts, sync results and problem rows, the approval queue, the blockchain queue, and searchable logs of versions, verification checks and activity, with date filters.

## Known limitations

- Runs on Ethereum's **test network** (Sepolia). Moving to mainnet or a cheaper L2 is one setting.
- BTU's identity file currently lives on the app's domain. In production it moves to `btu.edu.ge`.
- Google sign-in is limited to test users until the Google app is published.
- Real email codes need a mail provider key. A testing switch skips the code for now, with admin approval still required.

_More detail: [ARCHITECTURE.md](ARCHITECTURE.md) · [DEMO.md](DEMO.md)_
