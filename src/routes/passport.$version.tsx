import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getMyPassport } from "@/lib/api";
import { LanguageToggle, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/passport/$version")({
  loader: async ({ params }) => {
    const version = Number(params.version);
    if (!Number.isInteger(version) || version < 1) throw notFound();
    const profile = await getMyPassport();
    if (profile && !profile.versions.some((v) => v.version === version)) throw notFound();
    return { version, profile };
  },
  head: ({ params }) => ({
    meta: [
      { title: `AI Skills Passport v${params.version} — BTU` },
      { name: "description", content: "Official BTU AI Skills Digital Passport document." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportDoc,
});

/** Shows the official PDF exactly as issued: the server rebuilds it and checks it against the anchored hash. */
function PassportDoc() {
  const { t } = useI18n();
  const { version, profile } = Route.useLoaderData();

  if (!profile) {
    return (
      <main className="min-h-screen bg-canvas p-6">
        <div className="panel mx-auto max-w-2xl p-8">
          <h1 className="text-3xl">{t("Your passport is private")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("Sign in with your BTU student account to view and download your passport.")}</p>
          <Link to="/auth" search={{}} className="mt-5 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background">{t("Sign in or register")}</Link>
        </div>
      </main>
    );
  }

  const src = `/api/passport/${version}/pdf`;
  return (
    <main className="flex min-h-screen flex-col bg-[#29292c] p-4 text-white sm:p-6">
      <div className="mx-auto mb-4 flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm font-bold uppercase underline underline-offset-4">{t("← Back to dashboard")}</Link>
          <LanguageToggle />
        </div>
        <a href={`${src}?download`} className="rounded-full bg-primary px-5 py-2 text-sm font-bold uppercase text-primary-foreground">{t("Download / Save as PDF")}</a>
      </div>
      <section aria-label={t("Passport PDF preview")} className="mx-auto flex w-full max-w-[1400px] flex-1 overflow-hidden rounded-xl bg-[#39393c]">
        <object data={src} type="application/pdf" className="min-h-[75vh] w-full flex-1">
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-lg">
              <p className="text-sm leading-6 text-white/70">{t("Your browser cannot show PDFs inline.")}</p>
              <a href={src} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-full border border-white/30 px-5 py-2 text-sm font-bold uppercase text-white hover:bg-white/10">{t("Open filled PDF in new tab")}</a>
            </div>
          </div>
        </object>
      </section>
    </main>
  );
}
