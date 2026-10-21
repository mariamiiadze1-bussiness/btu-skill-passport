import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Asterisks } from "@/components/passport/Stamp";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { enterGuestMode, savePassportSession } from "@/lib/passport-session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BTU AI Skills Passport" },
      { name: "description", content: "Sign in or register for your BTU AI Skills Digital Passport." },
    ],
  }),
  component: AuthorizationPage,
});

type Mode = "signin" | "register";

function AuthorizationPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (mode === "register" && password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    savePassportSession(email);
    sessionStorage.removeItem("btu-passport-mode");
    setMessage(mode === "register" ? "Account created for this demo. Opening your passport…" : "Signed in for this demo. Opening your passport…");
    window.setTimeout(() => navigate({ to: "/" }), 650);
  }

  function handleGoogleSignIn() {
    setMessage("Google sign-in needs OAuth credentials to be connected for this project.");
  }

  return (
    <main className="auth-page min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-3" aria-label="BTU passport home">
          <span className="font-display text-2xl leading-none">BTU</span>
          <span className="border-l border-foreground/20 pl-3 text-[10px] font-semibold uppercase leading-tight text-muted-foreground">{t("Business and")}<br />{t("Technology University")}</span>
        </Link>
        <div className="flex items-center gap-4"><Link to="/verify" search={{ code: undefined }} className="text-xs font-bold uppercase tracking-wide underline underline-offset-4">{t("Verify a passport")}</Link><LanguageToggle /></div>
      </div>

      <div className="mx-auto mt-8 grid max-w-6xl overflow-hidden rounded-[2rem] border border-foreground/10 bg-card shadow-xl md:mt-12 md:min-h-[620px] md:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-foreground p-7 text-background sm:p-10 md:p-12">
          <div className="absolute right-8 top-8 text-primary"><Asterisks vertical /></div>
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-background/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className="h-2 w-2 rounded-full bg-primary" /> {t("BTU · Digital Passport")}
            </span>
            <h1 className="mt-12 max-w-sm text-4xl leading-[0.98] sm:text-5xl">{t("Your skills.")}<br /><span className="text-primary">{t("Verified.")}</span></h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-background/70">{t("Keep your AI skills, verified achievements, and passport history together in one trusted place.")}</p>
          </div>
          <div className="relative z-10 mt-10 border-t border-background/20 pt-5 text-xs uppercase tracking-[0.14em] text-background/60">
            {t("Business and Technology University · Tbilisi")}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-12 h-64 w-64 rounded-full border border-background/10 sm:h-80 sm:w-80" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-2 h-48 w-48 rounded-full border border-background/10 sm:h-64 sm:w-64" />
        </aside>

        <section className="flex items-center justify-center p-6 sm:p-10 md:p-12">
          <div className="w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("Student access")}</p>
            <h2 className="mt-2 text-3xl sm:text-4xl">{mode === "signin" ? t("Welcome back") : t("Create account")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin" ? t("Sign in to view your BTU AI Skills Passport.") : t("Register to start building your verified skills passport.")}
            </p>

            <div className="mt-7 grid grid-cols-2 rounded-full bg-muted p-1" role="tablist" aria-label={t("Account access")}>
              <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setMessage(""); }}
                className={`rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${mode === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t("Sign in")}
              </button>
              <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(""); }}
                className={`rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${mode === "register" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t("Register")}
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === "register" && (
                <label className="block text-sm font-semibold" htmlFor="auth-name">
                  {t("Full name")}
                  <input id="auth-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={t("Your full name")} />
                </label>
              )}
              <label className="block text-sm font-semibold" htmlFor="auth-email">
                {t("University or personal email")}
                <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={t("you@example.com")} />
              </label>
              <label className="block text-sm font-semibold" htmlFor="auth-password">
                {t("Password")}
                <input id="auth-password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={mode === "register" ? t("At least 8 characters") : t("Enter your password")} />
              </label>
              <button type="submit" className="flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground transition hover:brightness-95">
                {mode === "signin" ? t("Sign in") : t("Create account")}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"><span className="h-px flex-1 bg-border" /> {t("or continue with")} <span className="h-px flex-1 bg-border" /></div>

            <button type="button" onClick={handleGoogleSignIn} className="flex w-full items-center justify-center gap-3 rounded-full border-2 border-foreground/15 px-5 py-3 text-sm font-bold transition hover:border-foreground/40 hover:bg-muted">
              <GoogleMark /> {t("Continue with Google")}
            </button>

            <button type="button" onClick={() => { enterGuestMode(); navigate({ to: "/" }); }} className="mt-3 flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground">
              {t("Continue as guest")} <span className="ml-2" aria-hidden="true">→</span>
            </button>

            <p aria-live="polite" className={`mt-3 min-h-5 text-center text-xs ${message.startsWith("Google") || message.startsWith("Use") ? "text-destructive" : "text-muted-foreground"}`}>
              {t(message)}
            </p>
            <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">{t("By continuing, you agree to use the passport service in line with BTU policies.")}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z"/><path fill="#1976D2" d="M24 11.9c3 0 5.7 1 7.8 3l5.8-5.8C34.1 5.7 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>;
}
