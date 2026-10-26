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

// Menu pills: unselected items get a soft grey pill on hover; the selected one stays black.
const item = "rounded-full px-2 py-1.5 sm:px-3 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const idle = "text-muted-foreground hover:bg-secondary hover:text-foreground";

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
        {/* Phones and small tablets: logo + language on the first row, menu on its own row. md and up: one row. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <Link to="/" className="mr-auto flex min-w-0 items-center gap-3">
            <span className="font-display text-2xl leading-none">BTU</span>
            <span className="hidden border-l pl-3 text-[10px] font-semibold uppercase leading-tight text-muted-foreground sm:block">
              {t("Business and")}<br />{t("Technology University")}
            </span>
          </Link>
          <nav className="order-last flex w-full flex-wrap gap-1 md:order-none md:w-auto">
            {links.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
                className={item}
                inactiveProps={{ className: idle }}
                activeProps={{ className: "bg-foreground text-background" }}>
                {t(n.label)}
              </Link>
            ))}
            {session ? (
              <button type="button" onClick={() => void handleSignOut()} className={`${item} ${idle}`}>{t("Log out")}</button>
            ) : (
              <Link to="/auth" activeOptions={{ exact: true }} className={item} inactiveProps={{ className: idle }} activeProps={{ className: "bg-foreground text-background" }}>{t("Sign in")}</Link>
            )}
          </nav>
          <LanguageToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
