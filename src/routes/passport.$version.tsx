import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFilledPassportPdf, downloadFilledPassport } from "@/lib/fill-passport-template";
import { usePassportSession } from "@/lib/passport-session";
import { LanguageToggle, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/passport/$version")({
  validateSearch: (s: Record<string, unknown>) => ({ print: s["print"] === true || s["print"] === "true" ? true : undefined }),
  loader: ({ params }) => {
    const version = Number(params.version);
    if (!Number.isInteger(version) || version < 1) throw notFound();
    return version;
  },
  head: ({ params }) => ({
    meta: [
      { title: `AI Skills Passport v${params.version} — BTU` },
      { name: "description", content: "Printable BTU AI Skills Digital Passport document." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportDoc,
});

function PassportDoc() {
  const { t } = useI18n();
  const version = Route.useLoaderData();
  const { print } = Route.useSearch();
  const { ready, profile } = usePassportSession();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const autoDownloadStarted = useRef(false);

  const handleDownload = useCallback(async () => {
    if (!profile) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      await downloadFilledPassport(profile, version);
    } catch (error) {
      console.error("Could not fill the passport PDF template", error);
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }, [profile, version]);

  useEffect(() => {
    if (!ready || !profile) return;
    let url: string | undefined;
    let cancelled = false;
    void createFilledPassportPdf(profile, version).then((bytes) => {
      if (cancelled) return;
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      setPreviewUrl(url);
    }).catch((error) => {
      console.error("Could not prepare the passport PDF preview", error);
      if (!cancelled) setDownloadError(true);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ready, profile, version]);

  useEffect(() => {
    if (print && ready && profile && previewUrl && !autoDownloadStarted.current) {
      autoDownloadStarted.current = true;
      void handleDownload();
    }
  }, [print, ready, profile, previewUrl, handleDownload]);

  if (!ready || !profile) {
    return <main className="min-h-screen bg-canvas p-6"><div className="mx-auto max-w-2xl panel p-8">
      <h1 className="text-3xl">{t("Your passport is blank")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("Register or sign in with the email from the BTU test data to see synced passport details. Guest mode and unregistered accounts stay blank.")}</p>
      <Link to="/auth" className="mt-5 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-bold uppercase text-background">{t("Sign in or register")}</Link>
    </div></main>;
  }

  return <main className="flex min-h-screen flex-col bg-[#29292c] p-4 text-white sm:p-6">
    <div className="mx-auto mb-4 flex w-full max-w-[1400px] items-center justify-between gap-3">
      <div className="flex items-center gap-4"><Link to="/" className="text-sm font-bold uppercase underline underline-offset-4">{t("← Back to dashboard")}</Link><LanguageToggle /></div>
      <button onClick={() => void handleDownload()} disabled={downloading} className="rounded-full bg-primary px-5 py-2 text-sm font-bold uppercase text-primary-foreground disabled:opacity-60">{t(downloading ? "Preparing PDF…" : "Download / Save as PDF")}</button>
    </div>
    {downloadError && <p role="alert" className="mx-auto mb-3 w-full max-w-[1400px] text-sm font-semibold text-red-300">{t("Could not create the passport PDF. Please try again.")}</p>}
    <section aria-label={t("Passport PDF preview")} className="mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-[#39393c] p-6 text-center">
      <div className="max-w-lg">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-white/10 text-2xl font-black">PDF</div>
        <h1 className="text-xl font-bold">{t("Your original four-page template is preserved.")}</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">{t("Download the filled passport to view the completed document.")}</p>
        {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-full border border-white/30 px-5 py-2 text-sm font-bold uppercase text-white hover:bg-white/10">{t("Open filled PDF in new tab")}</a>}
      </div>
    </section>
  </main>;
}
