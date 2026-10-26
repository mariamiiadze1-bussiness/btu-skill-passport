import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Asterisks } from "@/components/passport/Stamp";
import { getAuthOptions, requestSignUpCode, signIn, signUp } from "@/lib/api";
import { LanguageToggle, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BTU AI Skills Passport" },
      { name: "description", content: "Sign in or register for your BTU AI Skills Digital Passport." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { error?: string } =>
    typeof s["error"] === "string" ? { error: s["error"].slice(0, 32) } : {},
  loader: () => getAuthOptions(),
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: context.session.role === "admin" ? "/admin" : "/" });
  },
  component: AuthorizationPage,
});

type Mode = "signin" | "register";

/** Fixed messages for errors from the Google callback; the query value is never shown as-is. */
const GOOGLE_ERRORS: Record<string, string> = {
  domain: "Use your BTU Google account to sign in.",
  no_account: "No BTU passport is registered for this Google account.",
  unverified: "Your Google email address is not verified.",
  linked: "This account is linked to a different Google account.",
  cancelled: "Google sign-in was cancelled.",
  not_configured: "Google sign-in is not connected yet. Use your BTU email and password for now.",
  rate: "Too many attempts. Please wait a few minutes and try again.",
};

function AuthorizationPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { googleEnabled, emailDomain, signUpNeedsCode } = Route.useLoaderData();
  const { error } = Route.useSearch();
  const [message, setMessage] = useState(error ? (GOOGLE_ERRORS[error] ?? "Google sign-in failed. Please try again.") : "");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Registration is two steps: request an emailed code, then confirm it.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const resetCode = () => { setCodeSent(false); setCode(""); setDevCode(undefined); };
  // Google (BTU Workspace) is the main way in; email + password stays as a fallback, e.g. for admins.
  const [showEmailForm, setShowEmailForm] = useState(!googleEnabled);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const host = email.trim().toLowerCase().split("@")[1] ?? "";
    if (host !== emailDomain && !host.endsWith(`.${emailDomain}`)) {
      setMessage(`Use your @${emailDomain} university email.`);
      return;
    }
    if (mode === "register" && password.length < 10) {
      setMessage("Use a password with at least 10 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register" && !codeSent) {
        const sent = await requestSignUpCode({ data: { email, password, firstName, lastName } });
        if (!sent.autoConfirm) {
          setCodeSent(true);
          setDevCode(sent.devCode);
          return;
        }
        // Testing mode without a mail service: no code step (the account waits for approval).
        await signUp({ data: { email, password, firstName, lastName, code: sent.devCode } });
      } else if (mode === "register") await signUp({ data: { email, password, firstName, lastName, code } });
      else await signIn({ data: { email, password } });
      setPassword("");
      await router.invalidate();
      const session = router.state.matches[0]?.context.session;
      await router.navigate({ to: session?.role === "admin" ? "/admin" : "/" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-70" aria-label="BTU passport home">
          <span className="font-display text-2xl leading-none">BTU</span>
          <span className="hidden border-l border-foreground/20 pl-3 text-[10px] sm:block font-semibold uppercase leading-tight text-muted-foreground">{t("Business and")}<br />{t("Technology University")}</span>
        </Link>
        <div className="flex items-center gap-2"><Link to="/verify" search={{ code: undefined }} className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground">{t("Verify a passport")}</Link><LanguageToggle /></div>
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
            <h2 className="mt-2 text-3xl sm:text-4xl">{!showEmailForm ? t("Welcome") : mode === "signin" ? t("Welcome back") : t("Create account")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {!showEmailForm ? t("Sign in or create your passport with your BTU Google account.") : mode === "signin" ? t("Sign in to view your BTU AI Skills Passport.") : t("Create your passport with your BTU email. BTU adds your skills as they are confirmed.")}
            </p>

            <a href="/api/auth/google/start" className="mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:brightness-95 hover:shadow-md motion-safe:hover:-translate-y-px active:translate-y-0">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white"><GoogleMark /></span> {t("Continue with Google")}
            </a>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {googleEnabled ? `${t("Only")} @${emailDomain} ${t("Google accounts. First time? Your passport is created automatically.")}` : t("Google sign-in becomes available once BTU connects its Google Workspace.")}
            </p>

            {!showEmailForm ? (
              <button type="button" onClick={() => setShowEmailForm(true)} className="mt-6 w-full text-center text-xs font-bold uppercase tracking-wide text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {t("Use email and password instead")}
              </button>
            ) : (<>
            <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"><span className="h-px flex-1 bg-border" /> {t("or with email and password")} <span className="h-px flex-1 bg-border" /></div>

            <div className="grid grid-cols-2 rounded-full bg-muted p-1" role="tablist" aria-label={t("Account access")}>
              <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setMessage(""); resetCode(); }}
                className={`rounded-full px-4 py-2.5 text-sm font-bold ${mode === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}>
                {t("Sign in")}
              </button>
              <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(""); resetCode(); }}
                className={`rounded-full px-4 py-2.5 text-sm font-bold ${mode === "register" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}>
                {t("Register")}
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === "register" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold" htmlFor="auth-first">
                    {t("First name")}
                    <input id="auth-first" autoComplete="given-name" required maxLength={60} value={firstName} onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-normal outline-none hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  </label>
                  <label className="block text-sm font-semibold" htmlFor="auth-last">
                    {t("Last name")}
                    <input id="auth-last" autoComplete="family-name" required maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-normal outline-none hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  </label>
                  <p className="text-xs text-muted-foreground sm:col-span-2">{t("In Latin letters, exactly as on your university record. Your name is printed on the passport and cannot be changed later.")}</p>
                </div>
              )}
              <label className="block text-sm font-semibold" htmlFor="auth-email">
                {t("BTU email")}
                <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); resetCode(); }}
                  className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-normal outline-none hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={`name@${emailDomain}`} />
              </label>
              <label className="block text-sm font-semibold" htmlFor="auth-password">
                {t("Password")}
                <span className="relative mt-1.5 block">
                  <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border bg-background px-4 py-3 pr-20 font-normal outline-none hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={mode === "register" ? t("At least 10 characters") : t("Enter your password")} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-controls="auth-password"
                    className="absolute inset-y-0 right-3 my-auto h-8 rounded-full px-2.5 text-xs font-bold uppercase text-muted-foreground hover:bg-secondary hover:text-foreground">
                    {showPassword ? t("Hide") : t("Show")}
                  </button>
                </span>
              </label>
              {mode === "register" && codeSent && (
                <label className="block text-sm font-semibold" htmlFor="auth-code">
                  {t("Code from your email")}
                  <input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="mt-1.5 w-full rounded-xl border bg-background px-4 py-3 font-mono text-lg tracking-[0.4em] outline-none hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="000000" />
                  <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
                    {t("We sent a 6-digit code to")} {email}. {t("It expires in 10 minutes.")}
                    {devCode && <> <br /><strong>{t("Development mode — your code is")} {devCode}</strong></>}
                  </span>
                </label>
              )}
              <button type="submit" disabled={busy} className="flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground hover:brightness-95 hover:shadow-md motion-safe:hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-60">
                {busy ? t("Please wait…") : mode === "signin" ? t("Sign in") : codeSent || !signUpNeedsCode ? t("Create account") : t("Email me a code")}
              </button>
            </form>
            </>)}

            <p aria-live="polite" role={message ? "alert" : undefined} className="mt-3 min-h-5 text-center text-xs font-semibold text-destructive">
              {t(message)}
            </p>
            <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">{t("By continuing, you agree to use the passport service in line with BTU policies.")} <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">{t("Privacy")}</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z"/><path fill="#1976D2" d="M24 11.9c3 0 5.7 1 7.8 3l5.8-5.8C34.1 5.7 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>;
}
