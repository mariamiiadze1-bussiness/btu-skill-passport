import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — BTU AI Skills Passport" },
      { name: "description", content: "What the BTU AI Skills Digital Passport stores and who can see it." },
    ],
  }),
  component: Privacy,
});

const SECTIONS: [string, string[]][] = [
  ["What we store", [
    "Your name, BTU email address and Student ID, as recorded by Business and Technology University (BTU).",
    "The AI skills BTU has confirmed for you, with their dates and descriptions, and every version of your passport.",
    "For sign-in: your Google account ID (if you use Google) or a scrypt-hashed password. We never see your Google password.",
  ]],
  ["Who can see it", [
    "You, after signing in, and BTU administrators who manage passports.",
    "Anyone you give a verification code or passport PDF to can check that it is authentic. The public check shows only initials, a masked Passport ID, the version, the date and the number of skills.",
  ]],
  ["Blockchain", [
    "Only cryptographic fingerprints (SHA-256 hashes) of passport versions are recorded on a public blockchain. No names, emails or skills are written there.",
  ]],
  ["Google sign-in", [
    "We request only your name and email address (scopes: openid, email, profile), and accept only @btu.edu.ge accounts.",
  ]],
  ["Your choices", [
    "Participation is voluntary. To correct your data or remove your account, contact BTU's passport administrators.",
  ]],
];

function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <Link to="/auth" className="text-xs font-bold uppercase tracking-wide underline underline-offset-4 hover:opacity-70">
        ← BTU AI Skills Passport
      </Link>
      <h1 className="mt-6 text-4xl">Privacy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        How the BTU AI Skills Digital Passport handles your information.
      </p>
      {SECTIONS.map(([title, items]) => (
        <section key={title} className="mt-8">
          <h2 className="text-xl">{title}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </main>
  );
}
