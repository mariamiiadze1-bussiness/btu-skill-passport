/**
 * Outgoing email. Nothing sends mail yet; this is the seam for features planned next:
 *   - BTU email verification codes at registration (sets users.email_verified_at)
 *   - "Your passport was updated" notifications after a sync
 * To enable real sending, implement Mailer for your provider (Resend, SMTP, Google Workspace)
 * and return it from getMailer() when its env vars are set.
 */
export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

/** Development fallback: prints instead of sending. */
const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    if (process.env["VITEST"]) return;
    console.info(`[mail] to=${to} subject="${subject}"\n${text}`);
  },
};

export function getMailer(): Mailer {
  return consoleMailer;
}
