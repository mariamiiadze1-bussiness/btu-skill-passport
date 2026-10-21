import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/passport/AppShell";
import { Asterisks } from "@/components/passport/Stamp";
import { formatDate, verifyCode } from "@/lib/passport-data";
import { verifyPassportCode } from "@/lib/passport-session";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s["code"] === "string" ? s["code"] : undefined }),
  head: () => ({
    meta: [
      { title: "Verify an AI Skills Passport — BTU" },
      { name: "description", content: "Check that a BTU AI Skills Digital Passport is authentic, issued by BTU and current." },
      { property: "og:title", content: "Verify an AI Skills Passport — BTU" },
      { property: "og:description", content: "Confirm the authenticity of a BTU AI Skills Digital Passport." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Verify,
});

function Verify() {
  const { t, language } = useI18n();
  const { code } = Route.useSearch();
  const navigate = useNavigate({ from: "/verify" });
  const [input, setInput] = useState(code ?? "");
  const [scanning, setScanning] = useState(false);
  const result = code ? verifyPassportCode(code) ?? verifyCode(code) : null;

  const submit = (c: string) => navigate({ search: { code: c.trim() || undefined } });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="panel p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl leading-none sm:text-4xl">{t("Verify a Passport")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("Enter the verification code printed on the passport, or scan its QR code.")}</p>
            </div>
            <Asterisks />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="code" className="sr-only">{t("Verification code")}</label>
            <input id="code" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. X3BN-5VHC"
              className="min-w-0 flex-1 rounded-full border-2 border-foreground bg-card px-5 py-3 font-mono text-lg uppercase outline-none focus:ring-4 focus:ring-ring/40" />
            <button className="rounded-full bg-foreground px-6 py-3 font-bold uppercase text-background">{t("Verify")}</button>
            <button type="button" onClick={() => { setScanning(true); setTimeout(() => { setScanning(false); setInput("X3BN-5VHC"); submit("X3BN-5VHC"); }, 1500); }}
              className="rounded-full bg-primary px-6 py-3 font-bold uppercase text-primary-foreground">
              {scanning ? t("Scanning…") : t("Scan QR")}
            </button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">{t("Each issued passport version has its own verification code, printed on the passport cover.")}</p>
        </div>

        {result && (
          <div className="panel mt-6 overflow-hidden" role="status">
            {result.valid ? (
              <>
                <div className={`px-6 py-4 font-display text-xl uppercase text-destructive-foreground ${result.isCurrent ? "bg-success" : "bg-primary text-primary-foreground"}`}>
                  {result.isCurrent ? t("✓ Valid · current version") : t("✓ Valid · superseded version")}
                </div>
                <ul className="divide-y">
                  <Check ok label="Passport is authentic" detail={t("Code {code} found in BTU registry", { code: result.code })} />
                  <Check ok label="Verified issuer" detail={t(result.issuer)} />
                  <Check ok label="Document matches issued version" detail={t("v{version}, issued {date} · {hash}", { version: result.version, date: formatDate(result.issuedAt, language), hash: result.documentHash })} />
                  <Check ok={result.isCurrent} label={result.isCurrent ? "This is the current version" : "Superseded"}
                    detail={result.isCurrent ? "No newer version has been issued." : t("A newer version ({version}) exists. Ask the holder for the latest passport.", { version: `v${result.currentVersion}` })} />
                </ul>
                <div className="grid gap-2 bg-secondary px-6 py-4 text-sm sm:grid-cols-3">
                  <p><span className="block text-xs font-bold uppercase text-muted-foreground">{t("Holder")}</span>{result.holderInitials}</p>
                  <p><span className="block text-xs font-bold uppercase text-muted-foreground">{t("Passport ID")}</span><span className="font-mono">{result.passportIdMasked}</span></p>
                  <p><span className="block text-xs font-bold uppercase text-muted-foreground">{t("Skills on record")}</span>{result.skillCount}</p>
                </div>
                <p className="px-6 py-3 text-xs text-muted-foreground">{t("To protect student privacy, only details needed to confirm authenticity are shown.")}</p>
              </>
            ) : (
              <div className="p-6">
                <p className="font-display text-xl uppercase text-destructive">{t("✕ Not verified")}</p>
                <p className="mt-2 text-sm">{t("No BTU passport matches code {code}. Check the code and try again.", { code: result.code })}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  const { t } = useI18n();
  return (
    <li className="flex gap-3 px-6 py-4">
      <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-destructive-foreground ${ok ? "bg-success" : "bg-primary"}`}>{ok ? "✓" : "!"}</span>
      <div className="min-w-0"><p className="font-bold">{t(label)}</p><p className="break-words text-sm text-muted-foreground">{t(detail)}</p></div>
    </li>
  );
}
