// Server only. The check every app page does before rendering: signed in, and a member.
import { redirect } from "next/navigation";
import { authMode } from "./config";
import { ensureMember } from "./members";
import { currentUser } from "./session";

export interface Account {
  /** The account id (what browser data is synced under). */
  id: string;
  email: string;
  role: "admin" | "member";
  /** "accounts": real sign-in (show Log out). "single": a one-person install. */
  mode: "accounts" | "single";
}

export async function requirePageMember(path: string): Promise<Account> {
  if (authMode() === "single") return { id: "local", email: "", role: "admin", mode: "single" };
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const member = await ensureMember(user);
  if (!member) redirect("/join");
  return { id: member.uid, email: member.email, role: member.role, mode: "accounts" };
}
