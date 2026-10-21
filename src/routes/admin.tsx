import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/passport/AppShell";
import { Stamp } from "@/components/passport/Stamp";
import { adminActivity, formatDate, pendingReviews, student, TYPE_LABEL, verificationLog, versions, type ActivityStatus } from "@/lib/passport-data";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Passport Administration — BTU" },
      { name: "description", content: "Review confirmed AI skills, generate updated passports and monitor processing at BTU." },
      { property: "og:title", content: "Passport Administration — BTU" },
      { property: "og:description", content: "BTU AI Skills Passport administrator dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

const STATUS_STYLE: Record<ActivityStatus, string> = {
  completed: "bg-success text-destructive-foreground",
  processing: "bg-stamp-navy text-destructive-foreground",
  pending: "bg-primary text-primary-foreground",
  failed: "bg-destructive text-destructive-foreground",
};

function Admin() {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const [generated, setGenerated] = useState<string[]>([]);
  const counts = adminActivity.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {} as Record<string, number>);
  const byStudent = Object.entries(pendingReviews.reduce((a, r) => ((a[r.passportId] ??= []).push(r), a), {} as Record<string, typeof pendingReviews>));

  return (
    <AppShell>
      <h1 className="text-3xl sm:text-4xl">Admin Dashboard</h1>
      <p className="text-sm font-semibold text-muted-foreground">AI Skills Digital Passport · processing overview</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["completed", "processing", "pending", "failed"] as ActivityStatus[]).map((s) => (
          <div key={s} className="panel p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">{s}</p>
            <p className="font-display text-3xl">{counts[s] ?? 0}</p>
          </div>
        ))}
      </div>

      <section className="panel mt-6 p-5 sm:p-6">
        <h2 className="text-xl">Recent activity</h2>
        <ul className="mt-3 divide-y">
          {adminActivity.map((a) => (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{a.student} · <span className="font-normal">{a.action}</span></p>
                <p className="truncate font-mono text-xs text-muted-foreground">{a.passportId} · v{a.version} · {a.at}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                {a.status === "failed" && <button className="text-xs font-bold uppercase underline">Retry</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel mt-6 p-5 sm:p-6">
        <h2 className="text-xl">Review confirmed skills</h2>
        <p className="text-sm text-muted-foreground">Approve each skill, then generate the updated passport.</p>
        <div className="mt-4 space-y-5">
          {byStudent.map(([pid, items]) => {
            const allDecided = items.every((i) => decisions[i.id]);
            const approved = items.filter((i) => decisions[i.id] === "approved").length;
            const done = generated.includes(pid);
            return (
              <div key={pid} className="rounded-xl border p-4">
                <p className="font-bold">{items[0]?.student} <span className="font-mono text-xs font-normal text-muted-foreground">{pid}</span></p>
                <ul className="mt-3 space-y-3">
                  {items.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3">
                      <Stamp type={r.type} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold uppercase">{r.skill}</p>
                        <p className="text-xs text-muted-foreground">{TYPE_LABEL[r.type]} · {r.source} · {r.evidence}</p>
                      </div>
                      {decisions[r.id] ? (
                        <span className="text-xs font-bold uppercase">{decisions[r.id]}</span>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => setDecisions({ ...decisions, [r.id]: "approved" })} className="rounded-full bg-success px-3 py-1 text-xs font-bold uppercase text-destructive-foreground">Approve</button>
                          <button onClick={() => setDecisions({ ...decisions, [r.id]: "rejected" })} className="rounded-full border-2 border-foreground px-3 py-0.5 text-xs font-bold uppercase">Reject</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <button disabled={!allDecided || approved === 0 || done} onClick={() => setGenerated([...generated, pid])}
                  className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-bold uppercase text-primary-foreground disabled:opacity-40">
                  {done ? "✓ Passport queued for generation" : `Generate updated passport (${approved} new)`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl">Version history</h2>
          <p className="text-xs text-muted-foreground">{student.firstName} {student.lastName} · {student.passportId}</p>
          <ul className="mt-3 divide-y">
            {[...versions].reverse().map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span><b className="font-display">v{v.version}</b> · {formatDate(v.issuedAt)} · <span className="font-mono">{v.verificationCode}</span></span>
                <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase ${v.status === "active" ? "bg-success text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>{v.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl">Verification checks</h2>
          <ul className="mt-3 divide-y">
            {verificationLog.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-mono">{l.code}</span>
                <span className="text-muted-foreground">{l.at}</span>
                <span className={`font-bold ${l.result === "Not found" ? "text-destructive" : ""}`}>{l.result}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
