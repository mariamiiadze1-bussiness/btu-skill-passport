/** Only BTU accounts may sign in: btu.edu.ge itself or any subdomain (e.g. student.btu.edu.ge). */
export function allowedEmailDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "btu.edu.ge").trim().toLowerCase();
}

export function isAllowedEmail(email: string, domain = allowedEmailDomain()) {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const host = email.slice(at + 1).toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
