// Links from the tracker straight to an email in Gmail. Client only.

const ACCOUNT_KEY = "offerloop.inbox.account";

/** Remember which Gmail account is connected, so links open in that account. */
export function rememberInboxAccount(email: string | null) {
  try {
    if (email) localStorage.setItem(ACCOUNT_KEY, email);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // storage blocked: links fall back to the default Gmail account
  }
}

/**
 * The email in Gmail's web app, or null for sample emails. `authuser` picks the right
 * account when several are signed in; `#all/<id>` finds it in any folder.
 */
export function gmailUrl(messageId: string | undefined): string | null {
  if (!messageId || !/^[0-9a-f]{8,32}$/i.test(messageId)) return null;
  let account = "";
  try {
    account = localStorage.getItem(ACCOUNT_KEY) ?? "";
  } catch {
    // ignore
  }
  return `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : "u/0/"}#all/${messageId}`;
}
