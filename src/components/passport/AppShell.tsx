import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { signOut } from "@/lib/api";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/passport-session";

const nav = [
  { to: "/", label: "My Passport" },
  { to: "/verify", label: "Verify" },
  { to: "/admin", label: "Admin" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const session = useSession();
  const router = useRouter();
  const links = nav.filter((n) => n.to !== "/admin" || session?.role === "admin");
  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/auth" });
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="no-print border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="font-display text-2xl leading-none">BTU</span>
            <span className="hidden border-l pl-3 text-[10px] font-semibold uppercase leading-tight text-muted-foreground sm:block">
              {t("Business and")}<br />{t("Technology University")}
            </span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
          <nav className="flex gap-1">
            {links.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
                className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                activeProps={{ className: "bg-foreground text-background" }}>
                {t(n.label)}
              </Link>
            ))}
            {session ? (
              <button type="button" onClick={() => void handleSignOut()} className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground">{t("Log out")}</button>
            ) : (
              <Link to="/auth" activeOptions={{ exact: true }} className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground">{t("Sign in")}</Link>
            )}
          </nav>
          <LanguageToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
