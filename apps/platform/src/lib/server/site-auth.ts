// Server only. One password for the whole site, for deploying it publicly before accounts
// exist. Set APP_PASSWORD to turn it on; without it (local development) the site is open.
//
// After logging in, the browser keeps a cookie holding a hash of the password — never the
// password itself. Changing APP_PASSWORD logs everyone out.
import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "offerloop_auth";
/** How long a login lasts. */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30;

export const sitePassword = () => process.env.APP_PASSWORD ?? "";

function token(password: string) {
  return createHmac("sha256", password).update("offerloop-site-login-v1").digest("hex");
}

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The cookie value a correct login gets. */
export const authToken = () => token(sitePassword());

export const isCorrectPassword = (attempt: string) => !!sitePassword() && sameText(attempt, sitePassword());

/** True when no password is set, or the cookie came from a correct login. */
export function isLoggedIn(cookie: string | undefined) {
  if (!sitePassword()) return true;
  return !!cookie && sameText(cookie, authToken());
}
