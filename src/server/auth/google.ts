import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { allowedEmailDomain, isAllowedEmail } from "../core/config";

/** Google sign-in: OpenID Connect authorization-code flow with PKCE, state and nonce. */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export const OAUTH_COOKIE = "btu_oauth";
export const CALLBACK_PATH = "/api/auth/google/callback";

export class GoogleAuthError extends Error {
  constructor(readonly code: "not_configured" | "state" | "token" | "domain" | "unverified") {
    super(code);
  }
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** APP_URL pins the redirect URI in production; otherwise the request's own origin is used. */
export function redirectUri(requestUrl: string) {
  const base = process.env.APP_URL?.trim() || new URL(requestUrl).origin;
  return new URL(CALLBACK_PATH, base).toString();
}

const random = () => randomBytes(32).toString("base64url");

export function createAuthRequest(requestUrl: string) {
  const config = googleConfig();
  if (!config) throw new GoogleAuthError("not_configured");
  const state = random();
  const nonce = random();
  const verifier = random();
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(requestUrl),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    // Only a hint for Google's account picker; the domain is enforced on the ID token below.
    hd: allowedEmailDomain(),
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: JSON.stringify({ state, nonce, verifier }) };
}

function sameString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseOAuthCookie(raw: string | undefined) {
  try {
    const value = JSON.parse(raw ?? "") as Record<string, unknown>;
    const { state, nonce, verifier } = value;
    if (typeof state === "string" && typeof nonce === "string" && typeof verifier === "string")
      return { state, nonce, verifier };
  } catch {
    // fall through
  }
  return null;
}

/** Checks the claims of a signature-verified Google ID token. */
export function checkIdTokenClaims(
  claims: JWTPayload & Record<string, unknown>,
  expectedNonce: string,
) {
  const nonce = claims["nonce"];
  if (typeof nonce !== "string" || !sameString(nonce, expectedNonce))
    throw new GoogleAuthError("state");
  if (
    claims["email_verified"] !== true ||
    typeof claims["email"] !== "string" ||
    typeof claims.sub !== "string"
  ) {
    throw new GoogleAuthError("unverified");
  }
  const email = claims["email"].toLowerCase();
  // `hd` is set only for Google Workspace accounts, so a personal Gmail can never pass.
  const hd = typeof claims["hd"] === "string" ? claims["hd"].toLowerCase() : "";
  if (!isAllowedEmail(email) || !isAllowedEmail(`x@${hd}`)) throw new GoogleAuthError("domain");
  const name = (key: string) =>
    typeof claims[key] === "string" ? (claims[key] as string) : undefined;
  return { sub: claims.sub, email, firstName: name("given_name"), lastName: name("family_name") };
}

export async function completeAuth(requestUrl: string, cookie: string | undefined) {
  const config = googleConfig();
  if (!config) throw new GoogleAuthError("not_configured");
  const params = new URL(requestUrl).searchParams;
  const saved = parseOAuthCookie(cookie);
  const code = params.get("code");
  const state = params.get("state");
  if (!saved || !code || !state || !sameString(state, saved.state))
    throw new GoogleAuthError("state");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(requestUrl),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  if (!response.ok) throw new GoogleAuthError("token");
  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  if (!idToken) throw new GoogleAuthError("token");

  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.clientId,
  }).catch(() => {
    throw new GoogleAuthError("token");
  });
  return checkIdTokenClaims(payload, saved.nonce);
}
