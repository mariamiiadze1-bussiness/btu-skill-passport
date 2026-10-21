import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/components/passport/AppShell";
import {
  addStudentSkill,
  getAdminData,
  retryBlockchain,
  syncNow,
  uploadRegistryExcel,
} from "@/lib/api";
import { formatDate, type ActivityStatus } from "@/lib/passport-data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  // UX guard only; every admin server function re-checks the role itself.
  beforeLoad: ({ context }) => {
    if (context.session?.role !== "admin") throw redirect({ to: "/auth", search: {} });
  },
  loader: () => getAdminData(),
  head: () => ({
    meta: [
      { title: "Passport Administration — BTU" },
      { name: "description", content: "Sync verified skills, issue passports and monitor blockchain verification at BTU." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

type Data = Awaited<ReturnType<typeof getAdminData>>;

const STATUS_STYLE: Record<ActivityStatus, string> = {
  completed: "bg-success text-destructive-foreground",
  processing: "bg-stamp-navy text-destructive-foreground",
  pending: "bg-primary text-primary-foreground",
  failed: "bg-destructive text-destructive-foreground",
};

const CHECK_LABEL: Record<string, string> = {
  current: "Valid · current",
  superseded: "Valid · superseded",
  not_issued: "Not issued yet",
  not_found: "Not found",
  invalid: "Invalid code",
  file_match: "PDF matches",
  file_mismatch: "PDF modified",
};

/** Versions not yet official, by anchoring state. */
const VERSION_LABEL: Record<string, string> = { pending: "queued", submitted: "confirming" };

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const panel = "panel mt-6 p-5 sm:p-6";
const button = "rounded-full px-5 py-2 text-sm font-bold uppercase disabled:opacity-40";

function Admin() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string; problems?: { sheetRow: number; recordId: string; message: string }[] }>();

  async function run(key: string, action: () => Promise<unknown>, success: (r: never) => string) {
    setBusy(key);
    setNotice(undefined);
    try {
      const result = await action();
      const r = result as { problems?: { sheetRow: number; recordId: string; message: string }[]; anchorError?: string | null; writeBackError?: string | null };
      const warnings = [r?.anchorError, r?.writeBackError].filter(Boolean).join(" ");
      setNotice({ kind: warnings ? "error" : "ok", text: `${success(result as never)}${warnings ? ` ${warnings}` : ""}`, problems: r?.problems ?? [] });
      await router.invalidate();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(undefined);
    }
  }

  const syncSummary = (r: { totals: { synced: number; alreadySynced: number; skipped: number; failed: number; versions: number } }) =>
    `Sync finished: ${r.totals.synced} new records, ${r.totals.versions} passports updated, ${r.totals.failed} failed, ${r.totals.skipped} skipped, ${r.totals.alreadySynced} already on passports.`;

  return (
    <AppShell>
      <h1 className="text-3xl sm:text-4xl">{t("Admin Dashboard")}</h1>
      <p className="text-sm font-semibold text-muted-foreground">{t("AI Skills Digital Passport · processing overview")}</p>

      {notice && (
        <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-xl border-2 bg-card p-4 text-sm ${notice.kind === "error" ? "border-destructive text-destructive" : "border-success"}`}>
          <p className="font-semibold">{notice.text}</p>
          {!!notice.problems?.length && (
            <ul className="mt-2 space-y-1 text-xs text-foreground">
              {notice.problems.map((p) => <li key={`${p.sheetRow}-${p.recordId}`}><span className="font-mono">{t("Row")} {p.sheetRow} · {p.recordId || "—"}</span>: {p.message}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Students", data.counts.students],
          ["Issued passports", data.counts.passports],
          ["Blockchain queue", data.counts.queued],
          ["Sync errors", data.counts.failedRecords],
        ] as const).map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">{t(label)}</p>
            <p className="font-display text-3xl">{value}</p>
          </div>
        ))}
      </div>

      <RegistryPanel data={data} busy={busy} onSync={() => run("sync", () => syncNow(), syncSummary)} onUpload={(form) => run("upload", () => uploadRegistryExcel({ data: form }), syncSummary)} />

      <AddSkillPanel data={data} busy={busy} onSubmit={(values) => run("add", () => addStudentSkill({ data: values }), (r: { version: number | null }) => `Skill added. Passport v${r.version} issued.`)} />


      <BlockchainPanel data={data} busy={busy} onRetry={() => run("anchor", () => retryBlockchain(), (r: { anchored: number; unanchored: number; error: string | null }) => r.error ?? `${r.anchored + r.unanchored} versions finalized.`)} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl">{t("Version history")}</h2>
          <p className="text-xs text-muted-foreground">{t("Latest issued passport versions")}</p>
          <ul className="mt-3 divide-y">
            {data.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <b className="font-display">v{v.version}</b> · {v.student} · {formatDate(v.issuedAt)}
                  <span className="block truncate font-mono text-xs text-muted-foreground">{v.code} · {t("{count} skills", { count: v.skillCount })}</span>
                </span>
                <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase ${v.isCurrent ? "bg-success text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
                  {t(v.isCurrent ? "active" : v.status === "anchored" || v.status === "unanchored" ? "superseded" : (VERSION_LABEL[v.status] ?? v.status))}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl">{t("Verification checks")}</h2>
          {data.checks.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("No verification checks yet.")}</p>}
          <ul className="mt-3 divide-y">
            {data.checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-mono">{c.code}</span>
                <span className="text-muted-foreground">{dateTime(c.at)}</span>
                <span className={`font-bold ${["not_found", "invalid", "file_mismatch"].includes(c.result) ? "text-destructive" : ""}`}>{t(CHECK_LABEL[c.result] ?? c.result)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={panel}>
        <h2 className="text-xl">{t("Recent activity")}</h2>
        <ul className="mt-3 divide-y">
          {data.activity.map((a) => (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{a.student} · <span className="font-normal">{a.action}</span></p>
                <p className="truncate font-mono text-xs text-muted-foreground">{a.passportId}{a.version ? ` · v${a.version}` : ""} · {dateTime(a.at)}</p>
              </div>
              <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_STYLE[a.status]}`}>{t(a.status)}</span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

function RegistryPanel({ data, busy, onSync, onUpload }: { data: Data; busy: string | undefined; onSync: () => void; onUpload: (form: FormData) => void }) {
  const { t } = useI18n();
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">{t("Skill registry sync")}</h2>
          <p className="text-sm text-muted-foreground">
            {data.registry.source
              ? t("Connected to Google Sheets. New CONFIRMED records are added to the right passports automatically; re-syncing never adds a record twice.")
              : t("Google Sheets is not connected yet (see README). You can import BTU's Excel workbook instead — it goes through exactly the same checks.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || !data.registry.source} onClick={onSync} className={`${button} bg-foreground text-background`}>
            {busy === "sync" ? t("Syncing…") : t("Sync from Google Sheets")}
          </button>
          <label className={`${button} cursor-pointer border-2 border-foreground ${busy ? "pointer-events-none opacity-40" : ""}`}>
            {busy === "upload" ? t("Importing…") : t("Import Excel (.xlsx)")}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const form = new FormData();
                form.append("file", file);
                onUpload(form);
              }} />
          </label>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold uppercase text-muted-foreground">{t("Recent syncs")}</h3>
          {data.registry.runs.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t("No syncs yet.")}</p>}
          <ul className="mt-2 divide-y text-sm">
            {data.registry.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{dateTime(r.at)} · {r.source}</span>
                <span className={r.status === "failed" ? "font-bold text-destructive" : ""}>
                  {r.totals ? `+${r.totals.synced} · ${r.totals.versions} ${t("passports")} · ${r.totals.failed} ${t("failed")}` : (r.error ?? r.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase text-muted-foreground">{t("Records that need attention")}</h3>
          {data.registry.failed.length === 0 && data.registry.skipped.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t("None — every record was processed.")}</p>}
          <ul className="mt-2 max-h-64 divide-y overflow-auto text-sm">
            {data.registry.failed.map((r) => (
              <li key={r.recordId} className="py-2">
                <span className="font-mono text-xs font-bold text-destructive">{r.recordId}{r.sheetRow ? ` · ${t("row")} ${r.sheetRow}` : ""}</span>
                <p className="text-xs">{r.message}</p>
              </li>
            ))}
            {data.registry.skipped.map((r) => (
              <li key={r.recordId} className="py-2">
                <span className="font-mono text-xs font-bold">{r.recordId} · {t("skipped")}</span>
                <p className="text-xs text-muted-foreground">{r.message}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AddSkillPanel({ data, busy, onSubmit }: { data: Data; busy: string | undefined; onSubmit: (values: Record<string, string>) => void }) {
  const { t } = useI18n();
  const [catalogSkillId, setCatalogSkillId] = useState("");
  const field = "mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm font-normal";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (values["catalogSkillId"]) {
      delete values["name"];
      delete values["category"];
      delete values["description"];
    } else delete values["catalogSkillId"];
    onSubmit(values);
  }

  return (
    <section className={panel}>
      <h2 className="text-xl">{t("Add a skill to a passport")}</h2>
      <p className="text-sm text-muted-foreground">{t("For awards not in the sheet. The student's passport is updated, re-issued and anchored right away.")}</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-semibold">
          {t("Student")}
          <select name="studentId" required className={field} defaultValue="">
            <option value="" disabled>{t("Choose a student…")}</option>
            {data.students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.passportId}{s.version ? ` · v${s.version}` : ""}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("Skill")}
          <select name="catalogSkillId" value={catalogSkillId} onChange={(e) => setCatalogSkillId(e.target.value)} className={field}>
            <option value="">{t("New skill (enter details)…")}</option>
            {data.catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.category}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("Date earned")}
          <input type="date" name="dateEarned" required className={field} />
        </label>
        {!catalogSkillId && (
          <>
            <label className="text-sm font-semibold">
              {t("Skill name")}
              <input name="name" required maxLength={80} className={field} />
            </label>
            <label className="text-sm font-semibold">
              {t("Stamp type")}
              <select name="category" required className={field} defaultValue="">
                <option value="" disabled>{t("Choose…")}</option>
                {data.categories.map((c) => <option key={c} value={c}>{t(c)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold lg:col-span-1 sm:col-span-2">
              {t("Description")}
              <input name="description" required maxLength={300} className={field} />
            </label>
          </>
        )}
        <label className="text-sm font-semibold sm:col-span-2">
          {t("Earned through (optional)")}
          <input name="earnedThrough" maxLength={120} placeholder="e.g. AI Automation Bootcamp (3-day intensive)" className={field} />
        </label>
        <div className="flex items-end">
          <button disabled={!!busy} className={`${button} w-full bg-primary text-primary-foreground`}>{busy === "add" ? t("Issuing…") : t("Add & issue passport")}</button>
        </div>
      </form>
    </section>
  );
}

function BlockchainPanel({ data, busy, onRetry }: { data: Data; busy: string | undefined; onRetry: () => void }) {
  const { t } = useI18n();
  const b = data.blockchain;
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">{t("Blockchain verification")}</h2>
          <p className="text-sm text-muted-foreground">
            {b.enabled ? `${t("Each sync anchors one Merkle root on")} ${b.network}.` : t("No blockchain configured — passports are issued but not anchored (development mode).")}
          </p>
          {b.error && <p className="mt-1 text-sm font-semibold text-destructive">{b.error}</p>}
        </div>
        <button disabled={!!busy || !b.enabled} onClick={onRetry} className={`${button} border-2 border-foreground`}>
          {busy === "anchor" ? t("Working…") : `${t("Retry pending")} (${data.counts.queued})`}
        </button>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted-foreground">{t("Issuer identity (DID)")}</dt><dd className="break-all font-mono text-xs"><a href="/.well-known/did.json" target="_blank" rel="noreferrer" className="underline">{b.issuerDid}</a></dd></div>
        <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted-foreground">{t("Issuer address")}</dt><dd className="break-all font-mono text-xs">{b.issuerAddress ?? t("not set")}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-muted-foreground">{t("Balance")}</dt><dd className={b.funded === false ? "font-bold text-destructive" : ""}>{b.balance ?? "—"}{b.funded === false ? ` · ${t("needs test ETH from a faucet")}` : ""}</dd></div>
      </dl>
      {b.batches.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {b.batches.map((batch) => (
            <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-mono text-xs">#{batch.id} · {dateTime(batch.at)}{batch.blockNumber ? ` · ${t("block")} ${batch.blockNumber}` : ""}</span>
              <span className="flex items-center gap-3">
                {batch.explorerUrl && <a href={batch.explorerUrl} target="_blank" rel="noreferrer" className="font-mono text-xs underline">{batch.txHash?.slice(0, 14)}…</a>}
                <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase ${batch.status === "confirmed" ? "bg-success text-destructive-foreground" : batch.status === "failed" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>{t(batch.status)}</span>
              </span>
              {batch.error && <p className="w-full text-xs text-destructive">{batch.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
