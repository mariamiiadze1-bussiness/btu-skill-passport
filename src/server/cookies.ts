export const SESSION_COOKIE = "btu_session";

type CookieOptions = { maxAge: number; sameSite?: "Lax" | "Strict" };

/** Serializes an httpOnly cookie (Secure in production) for responses built by hand. */
export function serializeCookie(
  name: string,
  value: string,
  { maxAge, sameSite = "Lax" }: CookieOptions,
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
