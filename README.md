# Btu Skill Passport

Build a responsive web app for BTU AI Skills Digital Passport, a university service for students to view their AI skills and for the public to verify a passport’s authenticity.

Visual reference: Use the picture I provide as the design source. Match its visual style, including the colors, typography, spacing, shapes, layout, and overall feel. Apply that style consistently across all screens. Treat the picture as a visual reference; do not copy any text or personal information from it unless it is relevant to the passport app.

Create these connected screens:

Student dashboard

Show the student’s name, permanent Passport ID, current version, and original issue date.

Display earned AI skills as cards with skill name, category, badge, date earned, and a short description.

Include actions to view or download the latest passport PDF and see previous versions.

Clearly mark the latest active version.

Public verification page

Let an employer or visitor enter a Verification Code or scan a QR code.

Show whether the passport is valid, BTU is the verified issuer, and the document matches the issued version.

Indicate whether the checked version is current or has been superseded.

Protect student privacy: show only information needed to confirm authenticity.

BTU administrator dashboard

Show recent passport activity, pending or failed updates, and processing status.

Let an administrator review confirmed skills before generating an updated passport.

Show passport version history and verification status.

Use fictional sample student data. Make the layouts responsive for desktop and mobile, with readable typography and accessible contrast. Keep the app visually consistent with the picture I provide.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/020ec0f1-82f4-4b2f-b404-1520a4c9979e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
