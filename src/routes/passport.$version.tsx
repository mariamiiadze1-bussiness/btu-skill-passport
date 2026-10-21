import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { Asterisks, BrandTag, Stamp } from "@/components/passport/Stamp";
import { formatDate, latestVersion, skills, student, TYPE_LABEL, versions } from "@/lib/passport-data";

export const Route = createFileRoute("/passport/$version")({
  validateSearch: (s: Record<string, unknown>) => ({ print: s.print === true || s.print === "true" ? true : undefined }),
  loader: ({ params }) => {
    const v = versions.find((x) => String(x.version) === params.version);
    if (!v) throw notFound();
    return v;
  },
  head: ({ params }) => ({
    meta: [
      { title: `AI Skills Passport v${params.version} — BTU` },
      { name: "description", content: "Printable BTU AI Skills Digital Passport document." },
      { property: "og:title", content: `AI Skills Passport v${params.version} — BTU` },
      { property: "og:description", content: "Printable BTU AI Skills Digital Passport document." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportDoc,
});

function PassportDoc() {
  const v = Route.useLoaderData();
  const { print } = Route.useSearch();
  useEffect(() => { if (print) setTimeout(() => window.print(), 400); }, [print]);
  const list = skills.filter((s) => v.skillIds.includes(s.id));

  return (
    <div className="min-h-screen bg-canvas p-4 sm:p-8 print:bg-card print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm font-bold uppercase text-background underline underline-offset-4">← Back to dashboard</Link>
        <button onClick={() => window.print()} className="rounded-full bg-primary px-5 py-2 text-sm font-bold uppercase text-primary-foreground">Download / Save as PDF</button>
      </div>
      {v.status === "superseded" && (
        <p className="no-print mx-auto mb-4 max-w-4xl rounded-lg bg-primary px-4 py-2 text-sm font-bold">
          This is version {v.version}, superseded by v{latestVersion.version}.
        </p>
      )}
      <article className="panel mx-auto max-w-4xl p-6 sm:p-10">
        <div className="flex justify-between gap-4">
          <div>
            <h1 className="text-4xl leading-none sm:text-5xl">AI Skills</h1>
            <p className="text-3xl font-light uppercase leading-none sm:text-4xl">Digital Passport</p>
          </div>
          <Asterisks vertical />
        </div>
        <div className="my-6 h-px bg-border" />
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p><b className="font-display uppercase">Name:</b> {student.firstName}</p>
          <p><b className="font-display uppercase">Date of issue:</b> {formatDate(v.issuedAt)}</p>
          <p><b className="font-display uppercase">Surname:</b> {student.lastName}</p>
          <p><b className="font-display uppercase">Version:</b> v{v.version} {v.status === "active" ? "(active)" : "(superseded)"}</p>
        </div>
        <h2 className="mt-8 text-xl">AI Skills Detailed Information</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary font-display text-xs uppercase">
              <tr><th className="p-3">Stamp</th><th className="p-3">Skill</th><th className="p-3">Earned through</th><th className="p-3">Date</th></tr>
            </thead>
            <tbody className="divide-y">
              {list.map((s) => (
                <tr key={s.id} className="break-inside-avoid">
                  <td className="p-3"><Stamp type={s.type} size="sm" /></td>
                  <td className="p-3 font-bold uppercase">{s.name}<div className="text-xs font-normal normal-case text-muted-foreground">{TYPE_LABEL[s.type]}</div></td>
                  <td className="p-3">{s.earnedThrough}</td>
                  <td className="p-3 whitespace-nowrap">{formatDate(s.dateEarned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <BrandTag />
          <div className="text-right text-xs">
            <p className="font-display uppercase">Passport ID: {student.passportId}</p>
            <p className="mt-1">Verification code: <b className="font-mono">{v.verificationCode}</b></p>
            <p className="text-muted-foreground">Verify at /verify</p>
          </div>
        </div>
      </article>
    </div>
  );
}
