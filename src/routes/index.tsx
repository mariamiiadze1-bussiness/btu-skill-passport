import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/passport/AppShell";
import { Asterisks, BrandTag, Stamp } from "@/components/passport/Stamp";
import { dismissNotifications, getMyPassport } from "@/lib/api";
import { formatDate, TYPE_LABEL } from "@/lib/passport-data";
import { passportSkillType, useSession } from "@/lib/passport-session";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My AI Skills Passport — BTU" },
      { name: "description", content: "View your BTU AI skills passport." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: () => getMyPassport(),
  component: Dashboard,
});

/** LinkedIn "Add licence or certification" with the public verification link. */
function linkedInUrl(code: string, issuedAt: string, passportId: string) {
  const [year, month] = issuedAt.split("-");
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: "BTU AI Skills Digital Passport",
    organizationName: "Business and Technology University (BTU)",
    issueYear: year ?? "",
    issueMonth: String(Number(month)),
    certUrl: `${window.location.origin}/verify?code=${code}`,
    certId: passportId,
  });
  return `https://www.linkedin.com/profile/add?${params}`;
}

function Dashboard() {
  const { t, language } = useI18n();
  const profile = Route.useLoaderData();
  const session = useSession();
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const latest = profile?.versions[0];
  const skills = latest?.skills ?? [];

  // While a version is being recorded on the blockchain, refresh until it lands.
  useEffect(() => {
    if (!profile?.issuing) return;
    const timer = window.setTimeout(() => void router.invalidate(), 8000);
    return () => window.clearTimeout(timer);
  }, [profile, router]);

  async function copyCode(code: string) {
    await navigator.clipboard?.writeText(code).catch(() => null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!profile) {
    return (
      <AppShell>
        <section className="panel relative overflow-hidden p-6 sm:p-10">
          <div className="absolute right-6 top-6 hidden sm:block"><Asterisks vertical /></div>
          <h1 className="text-4xl leading-none sm:text-6xl">{t("AI Skills")}</h1>
          <p className="font-sans text-3xl font-light uppercase leading-none tracking-tight sm:text-5xl">{t("Digital Passport")}</p>
          <div className="my-6 h-px bg-border" />
          <p className="max-w-xl text-sm text-muted-foreground">
            {session ? t("This account is not linked to a student passport.") : t("Sign in with your BTU account to see your passport, or verify someone else's.")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!session && <Link to="/auth" search={{}} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background hover:opacity-90">{t("Sign in or register")}</Link>}
            <Link to="/verify" search={{ code: undefined }} className="rounded-full border-2 border-foreground px-5 py-2 text-sm font-bold uppercase hover:bg-secondary">{t("Verify a passport")}</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {profile.notifications.length > 0 && (
        <div role="status" className="mb-4 rounded-xl border-2 border-success bg-card px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <ul className="space-y-1 text-sm">
              {profile.notifications.map((n) => (
                <li key={n.id}><span className="font-bold">{t(n.title)}</span> <span className="text-muted-foreground">{n.body}</span></li>
              ))}
            </ul>
            <button type="button" onClick={() => void dismissNotifications().then(() => router.invalidate())} className="shrink-0 text-xs font-bold uppercase underline">{t("Dismiss")}</button>
          </div>
        </div>
      )}
      {!latest && !profile.issuing && (
        <p role="status" className="mb-4 rounded-xl border-2 border-primary bg-card px-4 py-3 text-sm font-semibold">
          {profile.student.pendingApproval
            ? t("Your account is waiting for BTU's approval. Once BTU confirms you, your verified skills are added to this passport.")
            : t("Your Passport ID is reserved. BTU issues your passport officially once your student record is confirmed in BTU's registry.")}
        </p>
      )}
      {profile.issuing && (
        <p role="status" className="mb-4 rounded-xl border-2 border-primary bg-card px-4 py-3 text-sm font-semibold">
          {t("A new version of your passport is being recorded on the blockchain. It will appear here in a moment.")}
        </p>
      )}
      <section className="panel relative overflow-hidden p-6 sm:p-10">
        <div className="absolute right-6 top-6 hidden sm:block"><Asterisks vertical /></div>
        <h1 className="text-4xl leading-none sm:text-6xl">{t("AI Skills")}</h1>
        <p className="font-sans text-3xl font-light uppercase leading-none tracking-tight sm:text-5xl">{t("Digital Passport")}</p>
        <div className="my-6 h-px bg-border" />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" value={`${profile.student.firstName} ${profile.student.lastName}`} />
          <Field label="Passport ID" value={profile.student.passportId} mono />
          <Field label="Current version" value={latest ? `v${latest.version} · ${formatDate(latest.issuedAt, language)}` : t(profile.issuing ? "Being issued…" : "Not issued yet")} />
          <Field label="Original issue" value={latest ? formatDate(profile.student.originalIssueDate, language) : "—"} />
        </dl>

        {latest && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-secondary px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-muted-foreground">{t("Verification code (share this with employers)")}</p>
              <p className="font-mono text-lg font-bold">{latest.verificationCode}</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyCode(latest.verificationCode)} className="rounded-full border-2 border-foreground px-4 py-1.5 text-xs font-bold uppercase hover:bg-card">
                {copied ? t("Copied") : t("Copy")}
              </button>
              <Link to="/verify" search={{ code: latest.verificationCode }} className="rounded-full bg-foreground px-4 py-2 text-xs font-bold uppercase text-background hover:opacity-90">{t("Verify this version")}</Link>
              <a href={linkedInUrl(latest.verificationCode, latest.issuedAt, profile.student.passportId)} target="_blank" rel="noreferrer" className="rounded-full bg-[#0a66c2] px-4 py-2 text-xs font-bold uppercase text-white hover:opacity-90">{t("Add to LinkedIn")}</a>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {latest && <Link to="/passport/$version" params={{ version: String(latest.version) }} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background hover:opacity-90">{t("View passport PDF")}</Link>}
          {latest && <a href={`/api/passport/${latest.version}/pdf?download`} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold uppercase text-primary-foreground hover:opacity-90">{t("Download PDF")}</a>}
          {profile.versions.length > 1 && (
            <button onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className="rounded-full border-2 border-foreground px-5 py-2 text-sm font-bold uppercase hover:bg-secondary">
              {showHistory ? t("Hide versions") : t("Previous versions")}
            </button>
          )}
          <BrandTag className="ml-auto hidden md:inline-block" />
        </div>

        {showHistory && (
          <ul className="mt-6 divide-y rounded-xl border">
            {profile.versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-xl">v{v.version}</span>
                    <span className="text-sm text-muted-foreground">{formatDate(v.issuedAt, language)} · {t("{count} skills", { count: v.skills.length })}</span>
                    {v.isCurrent ? (
                      <span className="rounded-sm bg-success px-2 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">{t("Latest · Active")}</span>
                    ) : (
                      <span className="rounded-sm bg-muted px-2 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">{t("Superseded")}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {v.added.length ? `${t("Added")}: ${v.added.map((name) => t(name)).join(", ")}` : t("First issue")}
                    {" · "}
                    <span className="font-mono">{v.verificationCode}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <Link to="/verify" search={{ code: v.verificationCode }} className="text-sm font-bold uppercase underline underline-offset-4">{t("Verify")}</Link>
                  <Link to="/passport/$version" params={{ version: String(v.version) }} className="text-sm font-bold uppercase underline underline-offset-4">{t("Open")}</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl sm:text-3xl">{t("Verified AI Skillset")}</h2>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">{t("Collection of BTU-verified AI Skill Stamps")}</p>
        {skills.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => {
              const type = passportSkillType(skill.category);
              return (
                <article key={skill.id} className="panel flex flex-col p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="text-xs font-bold text-muted-foreground">{formatDate(skill.dateEarned, language)}</span>
                    <Stamp type={type} />
                  </div>
                  <h3 className="text-lg leading-tight">{t(skill.name)}</h3>
                  <p className="mt-1 text-xs font-bold uppercase text-primary">{t(TYPE_LABEL[type])}</p>
                  <p className="mt-3 flex-1 text-sm text-muted-foreground">{t(skill.description)}</p>
                  {skill.earnedThrough && <p className="mt-3 text-xs"><span className="font-bold">{t("Earned through:")}</span> {t(skill.earnedThrough)}</p>}
                  <p className="mt-4 border-t pt-3 text-xs font-semibold">{t("Badge code:")} <span className="font-mono">{skill.badgeCode}</span></p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="panel p-6 text-sm text-muted-foreground">{latest ? t("No verified skills yet. They appear here as BTU confirms them.") : t("Skills appear here once BTU issues your passport.")}</p>
        )}
      </section>
    </AppShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <dt className="font-display text-xs uppercase text-muted-foreground">{t(label)}:</dt>
      <dd className={`mt-1 break-words text-lg font-bold ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
