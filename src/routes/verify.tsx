import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState, type ChangeEvent } from "react";
import { AppShell } from "@/components/passport/AppShell";
import { QrScanner } from "@/components/passport/QrScanner";
import { Asterisks } from "@/components/passport/Stamp";
import { verifyCode, verifyFile } from "@/lib/api";
import { formatDate } from "@/lib/passport-data";
import { useI18n } from "@/lib/i18n";

type Result = Awaited<ReturnType<typeof verifyCode>>;

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s["code"] === "string" ? s["code"].slice(0, 64) : undefined }),
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: async ({ deps }) => {
    if (!deps.code) return { result: null, error: "" };
    try {
      return { result: await verifyCode({ data: { code: deps.code } }), error: "" };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "Verification is unavailable right now." };
    }
  },
  head: () => ({
    meta: [
      { title: "Verify an AI Skills Passport — BTU" },
      { name: "description", content: "Check that a BTU AI Skills Digital Passport is authentic, issued by BTU, recorded on the blockchain and current." },
      { property: "og:title", content: "Verify an AI Skills Passport — BTU" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Verify,
});

/** SHA-256 of a file, computed locally: the PDF itself is never uploaded. */
async function sha256File(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Verify() {
  const { t } = useI18n();
  const { code } = Route.useSearch();
  const navigate = useNavigate({ from: "/verify" });
  const loaded = Route.useLoaderData();
  const [input, setInput] = useState(code ?? "");
  const [scanning, setScanning] = useState(false);
  const [fileResult, setFileResult] = useState<{ result: Result; name: string } | null>(null);
  const [checkingFile, setCheckingFile] = useState(false);
  const [fileError, setFileError] = useState("");

  const submit = useCallback((c: string) => {
    setFileResult(null);
    return navigate({ search: { code: c.trim() || undefined } });
  }, [navigate]);
  const handleScan = useCallback((scanned: string) => {
    setScanning(false);
    setInput(scanned);
    void submit(scanned);
  }, [submit]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");
    setCheckingFile(true);
    try {
      const fileSha256 = await sha256File(file);
      const result = code ? await verifyCode({ data: { code, fileSha256 } }) : await verifyFile({ data: { fileSha256 } });
      setFileResult({ result, name: file.name });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not check the file.");
    } finally {
      setCheckingFile(false);
    }
  }

  const result = fileResult?.result ?? loaded.result;
  const error = fileError || loaded.error;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="panel p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl leading-none sm:text-4xl">{t("Verify a Passport")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("Enter the verification code printed on the passport cover, scan its QR code, or check the PDF file itself.")}</p>
            </div>
            <Asterisks />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void submit(input); }} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="code" className="sr-only">{t("Verification code")}</label>
            <input id="code" value={input} onChange={(e) => setInput(e.target.value)} placeholder="BTU-XXXX-XXXX-XXXX" maxLength={64} autoComplete="off" spellCheck={false}
              className="min-w-0 flex-1 rounded-full border-2 border-foreground bg-card px-5 py-3 font-mono text-lg uppercase outline-none focus:ring-4 focus:ring-ring/40" />
            <button className="rounded-full bg-foreground px-6 py-3 font-bold uppercase text-background">{t("Verify")}</button>
            <button type="button" onClick={() => setScanning((s) => !s)} aria-pressed={scanning} className="rounded-full bg-primary px-6 py-3 font-bold uppercase text-primary-foreground">
              {scanning ? t("Scanning…") : t("Scan QR")}
            </button>
          </form>
          {scanning && <QrScanner onCode={handleScan} onClose={() => setScanning(false)} />}
          <label className="mt-4 flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-foreground/30 px-4 py-3 text-sm hover:border-foreground/60">
            <span>
              <span className="font-bold">{checkingFile ? t("Checking the file…") : t("Check a PDF file")}</span>
              <span className="block text-xs text-muted-foreground">{t("Proves the file was not changed. The file stays on your device; only its fingerprint is checked.")}</span>
            </span>
            <span className="rounded-full border-2 border-foreground px-4 py-1.5 text-xs font-bold uppercase">{t("Choose PDF")}</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => void handleFile(e)} className="sr-only" />
          </label>
          <p className="mt-3 text-xs text-muted-foreground">{t("The verification code (BTU-XXXX-XXXX-XXXX) is different from the Passport ID: each issued version has its own code.")}</p>
        </div>

        {error && <p role="alert" className="panel mt-6 p-6 text-sm font-semibold text-destructive">{t(error)}</p>}
        {result && <ResultCard result={result} fileName={fileResult?.name} />}
      </div>
    </AppShell>
  );
}

const FAILURE: Record<string, { title: string; body: string }> = {
  passport_id: {
    title: "That is a Passport ID",
    body: "Passport IDs (BTU-AI-…) are permanent and are not used for public lookups, to protect students' privacy. Enter the verification code printed on the passport cover (BTU-XXXX-XXXX-XXXX), or scan its QR code.",
  },
  invalid_format: { title: "✕ Not verified", body: "That doesn't look like a BTU verification code. Codes look like BTU-XXXX-XXXX-XXXX." },
  not_found: { title: "✕ Not verified", body: "No official BTU passport matches this. Check the code and try again. A modified PDF will not match either." },
  not_issued: { title: "Not issued yet", body: "This version is still being recorded on the blockchain and is not official yet. Try again in a minute." },
};

function ResultCard({ result, fileName }: { result: Result; fileName?: string | undefined }) {
  const { t, language } = useI18n();
  if (!result.valid) {
    const f = FAILURE[result.reason] ?? FAILURE["not_found"]!;
    return (
      <div className="panel mt-6 p-6" role="status">
        <p className={`font-display text-xl uppercase ${result.reason === "passport_id" || result.reason === "not_issued" ? "text-primary" : "text-destructive"}`}>{t(f.title)}</p>
        <p className="mt-2 text-sm">{t(f.body)}</p>
        {fileName && <p className="mt-2 text-xs text-muted-foreground">{fileName}</p>}
      </div>
    );
  }
  const tampered = result.file && !result.file.ok;
  const headline = tampered ? t("✕ File does not match") : result.isCurrent ? t("✓ Valid · current version") : t("✓ Valid · superseded version");
  return (
    <div className="panel mt-6 overflow-hidden" role="status">
      <div className={`px-6 py-4 font-display text-xl uppercase ${tampered ? "bg-destructive text-destructive-foreground" : result.isCurrent ? "bg-success text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
        {headline}
      </div>
      <ul className="divide-y">
        <Check ok label="Official record found" detail={t("Version {version} of this passport, issued {date}", { version: result.version, date: formatDate(result.issuedAt, language) })} />
        <Check ok={result.issuer.ok} label="Issuer: BTU" detail={result.issuer.detail}>
          <a href={result.issuer.didDocument} target="_blank" rel="noreferrer" className="break-all font-mono text-xs underline">{result.issuer.did}</a>
        </Check>
        <Check ok={result.blockchain.ok} warn={result.blockchain.state === "not_configured"} label="Recorded on the blockchain" detail={result.blockchain.detail}>
          {result.blockchain.explorerUrl && (
            <a href={result.blockchain.explorerUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-xs underline">
              {result.blockchain.network} · {result.blockchain.txHash?.slice(0, 18)}…
            </a>
          )}
        </Check>
        {result.file ? (
          <Check ok={result.file.ok} label={result.file.ok ? "PDF file is unchanged" : "PDF file was changed"} detail={`${fileName ?? ""} — ${result.file.detail}`} />
        ) : (
          <Check ok={null} label="PDF file not checked" detail="To prove a specific PDF was not edited, use “Check a PDF file” above." />
        )}
        <Check ok={result.isCurrent} label={result.isCurrent ? "This is the current version" : "Superseded"}
          detail={result.isCurrent ? "No newer version has been issued." : t("A newer version ({version}) exists. Ask the holder for the latest passport.", { version: `v${result.currentVersion}` })} />
      </ul>
      <div className="grid gap-2 bg-secondary px-6 py-4 text-sm sm:grid-cols-3">
        <p><span className="block text-xs font-bold uppercase text-muted-foreground">{t("Holder")}</span>{result.holderInitials}</p>
        <p><span className="block text-xs font-bold uppercase text-muted-foreground">{t("Passport ID")}</span><span className="font-mono">{result.passportIdMasked}</span></p>
        <p><span className="block text-xs font-bold uppercase text-muted-foreground">{t("Skills on record")}</span>{result.skillCount}</p>
      </div>
      <p className="px-6 py-3 text-xs text-muted-foreground">{t("To protect student privacy, only details needed to confirm authenticity are shown.")}</p>
    </div>
  );
}

function Check({ ok, warn, label, detail, children }: { ok: boolean | null; warn?: boolean; label: string; detail: string; children?: React.ReactNode }) {
  const { t } = useI18n();
  const tone = ok === null ? "bg-muted text-muted-foreground" : ok ? "bg-success text-destructive-foreground" : warn ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground";
  return (
    <li className="flex gap-3 px-6 py-4">
      <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${tone}`}>{ok === null ? "–" : ok ? "✓" : "!"}</span>
      <div className="min-w-0">
        <p className="font-bold">{t(label)}</p>
        <p className="break-words text-sm text-muted-foreground">{t(detail)}</p>
        {children}
      </div>
    </li>
  );
}
