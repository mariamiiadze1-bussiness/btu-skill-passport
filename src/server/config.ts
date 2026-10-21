/** Public base URL of the site (QR codes, emails, DID). */
export function appUrl() {
  return (process.env.APP_URL?.trim() || "http://localhost:8080").replace(/\/$/, "");
}
