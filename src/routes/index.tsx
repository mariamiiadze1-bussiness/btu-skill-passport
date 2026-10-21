import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/passport/AppShell";
import { Asterisks, BrandTag, Stamp } from "@/components/passport/Stamp";
import { formatDate, latestVersion, skills, student, TYPE_LABEL, versions } from "@/lib/passport-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My AI Skills Passport — BTU" },
      { name: "description", content: "View your verified BTU AI skills, passport versions and download the latest passport PDF." },
      { property: "og:title", content: "My AI Skills Passport — BTU" },
      { property: "og:description", content: "Your verified BTU AI skills and passport history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <AppShell>
      <section className="panel relative overflow-hidden p-6 sm:p-10">
        <div className="absolute right-6 top-6 hidden sm:block"><Asterisks vertical /></div>
        <h1 className="text-4xl leading-none sm:text-6xl">AI Skills</h1>
        <p className="font-sans text-3xl font-light uppercase leading-none tracking-tight sm:text-5xl">Digital Passport</p>
        <div className="my-6 h-px bg-border" />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" value={`${student.firstName} ${student.lastName}`} />
          <Field label="Passport ID" value={student.passportId} mono />
          <Field label="Current version" value={`v${latestVersion.version} · ${formatDate(latestVersion.issuedAt)}`} />
          <Field label="Original issue" value={formatDate(student.originalIssueDate)} />
        </dl>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/passport/$version" params={{ version: String(latestVersion.version) }}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background hover:opacity-90">
            View passport PDF
          </Link>
          <Link to="/passport/$version" params={{ version: String(latestVersion.version) }} search={{ print: true }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold uppercase text-primary-foreground hover:opacity-90">
            Download PDF
          </Link>
          <button onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}
            className="rounded-full border-2 border-foreground px-5 py-2 text-sm font-bold uppercase hover:bg-secondary">
            {showHistory ? "Hide" : "Previous"} versions
          </button>
          <BrandTag className="ml-auto hidden md:inline-block" />
        </div>

        {showHistory && (
          <ul className="mt-6 divide-y rounded-xl border">
            {[...versions].reverse().map((v) => (
              <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl">v{v.version}</span>
                  <span className="text-sm text-muted-foreground">{formatDate(v.issuedAt)} · {v.skillIds.length} skills</span>
                  {v.status === "active"
                    ? <span className="rounded-sm bg-success px-2 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">Latest · Active</span>
                    : <span className="rounded-sm bg-muted px-2 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">Superseded</span>}
                </div>
                <Link to="/passport/$version" params={{ version: String(v.version) }} className="text-sm font-bold uppercase underline underline-offset-4">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl sm:text-3xl">Verified AI Skillset</h2>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">Collection of BTU-verified AI Skill Stamps</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((s) => (
            <article key={s.id} className="panel flex flex-col p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <span className="text-xs font-bold text-muted-foreground">{formatDate(s.dateEarned)}</span>
                <Stamp type={s.type} />
              </div>
              <h3 className="text-lg leading-tight">{s.name}</h3>
              <p className="mt-1 text-xs font-bold uppercase text-primary">{TYPE_LABEL[s.type]} · {s.category}</p>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{s.description}</p>
              <p className="mt-4 border-t pt-3 text-xs font-semibold">Earned through: {s.earnedThrough}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-display text-xs uppercase text-muted-foreground">{label}:</dt>
      <dd className={`mt-1 truncate text-lg font-bold ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
