import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/passport/AppShell";
import { Asterisks, BrandTag, Stamp } from "@/components/passport/Stamp";
import { formatDate, TYPE_LABEL } from "@/lib/passport-data";
import { passportSkillType, passportVersions, usePassportSession } from "@/lib/passport-session";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My AI Skills Passport — BTU" },
      { name: "description", content: "View your BTU AI skills passport." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, language } = useI18n();
  const { ready, profile } = usePassportSession();
  const [showHistory, setShowHistory] = useState(false);
  const syncedSkills = profile?.skills ?? [];
  const versionNumber = profile ? (passportVersions(profile).at(-1) ?? 1) : 1;
  const issuedAt = profile?.issuedAt ?? "";

  return (
    <AppShell>
      {!ready ? (
        <section className="panel relative overflow-hidden p-6 sm:p-10">
          <div className="absolute right-6 top-6 hidden sm:block"><Asterisks vertical /></div>
          <h1 className="text-4xl leading-none sm:text-6xl">{t("AI Skills")}</h1>
          <p className="font-sans text-3xl font-light uppercase leading-none tracking-tight sm:text-5xl">{t("Digital Passport")}</p>
          <div className="my-6 h-px bg-border" />
          <p className="py-8 text-sm text-muted-foreground">{t("Checking your account…")}</p>
        </section>
      ) : !profile ? (
        <>
          <section className="panel relative overflow-hidden p-6 sm:p-10">
            <div className="absolute right-6 top-6 hidden sm:block"><Asterisks vertical /></div>
            <h1 className="text-4xl leading-none sm:text-6xl">{t("AI Skills")}</h1>
            <p className="font-sans text-3xl font-light uppercase leading-none tracking-tight sm:text-5xl">{t("Digital Passport")}</p>
            <div className="my-6 h-px bg-border" />
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" value="" /><Field label="Passport ID" value="" mono />
              <Field label="Current version" value="" /><Field label="Original issue" value="" />
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/passport/$version" params={{ version: "1" }} search={{ print: undefined }} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background hover:opacity-90">{t("View passport PDF")}</Link>
              <Link to="/passport/$version" params={{ version: "1" }} search={{ print: true }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold uppercase text-primary-foreground hover:opacity-90">{t("Download PDF")}</Link>
              <Link to="/auth" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background hover:opacity-90">{t("Sign in or register")}</Link>
              <button type="button" disabled className="rounded-full border-2 border-foreground/30 px-5 py-2 text-sm font-bold uppercase text-muted-foreground">{t("Previous versions")}</button>
              <BrandTag className="ml-auto hidden md:inline-block" />
            </div>
          </section>
          <section className="mt-10">
            <h2 className="text-2xl sm:text-3xl">{t("Verified AI Skillset")}</h2>
            <p className="mb-5 text-sm font-semibold text-muted-foreground">{t("Collection of BTU-verified AI Skill Stamps")}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 5 }).map((_, index) => <article key={index} aria-hidden="true" className="panel grid min-h-44 place-items-center"><span className="text-4xl text-muted-foreground/25">✱</span></article>)}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t("No synced skills are currently on this passport.")}</p>
          </section>
        </>
      ) : (
        <>
          <section className="panel relative overflow-hidden p-6 sm:p-10">
            <div className="absolute right-6 top-6 hidden sm:block"><Asterisks vertical /></div>
            <h1 className="text-4xl leading-none sm:text-6xl">{t("AI Skills")}</h1>
            <p className="font-sans text-3xl font-light uppercase leading-none tracking-tight sm:text-5xl">{t("Digital Passport")}</p>
            <div className="my-6 h-px bg-border" />
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" value={`${profile.firstName} ${profile.lastName}`} />
              <Field label="Passport ID" value={profile.passportId} mono />
              <Field label="Current version" value={`v${versionNumber} · ${formatDate(issuedAt, language)}`} />
              <Field label="Original issue" value={formatDate(issuedAt, language)} />
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/passport/$version" params={{ version: String(versionNumber) }} search={{ print: undefined }} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background hover:opacity-90">{t("View passport PDF")}</Link>
              <Link to="/passport/$version" params={{ version: String(versionNumber) }} search={{ print: true }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold uppercase text-primary-foreground hover:opacity-90">{t("Download PDF")}</Link>
              {syncedSkills.length > 0 && <button onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className="rounded-full border-2 border-foreground px-5 py-2 text-sm font-bold uppercase hover:bg-secondary">{showHistory ? t("Hide versions") : t("Previous versions")}</button>}
              <BrandTag className="ml-auto hidden md:inline-block" />
            </div>
            {showHistory && <ul className="mt-6 divide-y rounded-xl border">{[...passportVersions(profile)].reverse().map((version) => {
              const count = syncedSkills.filter((skill) => Number(skill.version.replace(/^V/i, "")) === version).length;
              return <li key={version} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><span className="font-display text-xl">v{version}</span><span className="text-sm text-muted-foreground">{t("{count} skills", { count })}</span>{version === versionNumber && <span className="rounded-sm bg-success px-2 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">{t("Latest · Active")}</span>}</div><Link to="/passport/$version" params={{ version: String(version) }} search={{ print: undefined }} className="text-sm font-bold uppercase underline underline-offset-4">{t("Open")}</Link></li>;
            })}</ul>}
          </section>
          <section className="mt-10">
            <h2 className="text-2xl sm:text-3xl">{t("Verified AI Skillset")}</h2>
            <p className="mb-5 text-sm font-semibold text-muted-foreground">{t("Collection of BTU-verified AI Skill Stamps")}</p>
            {syncedSkills.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {syncedSkills.map((skill) => {
                const type = passportSkillType(skill.category);
                return <article key={skill.id} className="panel flex flex-col p-5">
                  <div className="mb-4 flex items-start justify-between gap-3"><span className="text-xs font-bold text-muted-foreground">{formatDate(skill.dateEarned, language)}</span><Stamp type={type} /></div>
                  <h3 className="text-lg leading-tight">{t(skill.name)}</h3>
                  <p className="mt-1 text-xs font-bold uppercase text-primary">{t(TYPE_LABEL[type])} · {t(skill.category)}</p>
                  <p className="mt-3 flex-1 text-sm text-muted-foreground">{t(skill.description)}</p>
                  <p className="mt-4 border-t pt-3 text-xs font-semibold">{t("Badge code:")} <span className="font-mono">{skill.badgeCode}</span></p>
                </article>;
              })}
            </div> : <p className="panel p-6 text-sm text-muted-foreground">{t("No synced skills are currently on this passport.")}</p>}
          </section>
        </>
      )}
    </AppShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { t } = useI18n();
  return <div className="min-w-0"><dt className="font-display text-xs uppercase text-muted-foreground">{t(label)}:</dt><dd className={`mt-1 truncate text-lg font-bold ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}
