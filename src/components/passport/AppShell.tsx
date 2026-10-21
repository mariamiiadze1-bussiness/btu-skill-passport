import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "My Passport" },
  { to: "/verify", label: "Verify" },
  { to: "/admin", label: "Admin" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="no-print border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="font-display text-2xl leading-none">BTU</span>
            <span className="hidden border-l pl-3 text-[10px] font-semibold uppercase leading-tight text-muted-foreground sm:block">
              Business and<br />Technology University
            </span>
          </Link>
          <nav className="flex gap-1">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
                className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-foreground text-background hover:text-background" }}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
