// Server only. Who is making this request, for route handlers and server components.
import { NextResponse } from "next/server";
import { authMode, LOCAL_USER } from "./config";
import { ensureMember, type Member } from "./members";
import { supabaseServer } from "./supabase";

export interface SessionUser {
  id: string;
  email: string;
  role: Member["role"];
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

/** The signed-in person (not necessarily a member yet), or null. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  if (authMode() === "single") return LOCAL_USER;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}

/** The signed-in member making this request. Throws AuthError (401 / 403) otherwise. */
export async function requireMember(): Promise<SessionUser> {
  if (authMode() === "single") return { ...LOCAL_USER, role: "admin" };
  const user = await currentUser();
  if (!user) throw new AuthError("Log in first.", 401);
  const member = await ensureMember(user);
  if (!member) throw new AuthError("Your account needs an invite code. Open Offerloop to enter one.", 403);
  return { id: user.id, email: member.email, role: member.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireMember();
  if (user.role !== "admin") throw new AuthError("Admins only.", 403);
  return user;
}

/** Wrap a route handler: it gets the member; sign-in problems become 401/403 JSON. */
export function memberRoute<R extends Request = Request, C = unknown>(handler: (req: R, ctx: C, user: SessionUser) => Promise<Response>) {
  return async (req: R, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx, await requireMember());
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message, detail: err.message }, { status: err.status });
      throw err;
    }
  };
}

export function adminRoute<R extends Request = Request, C = unknown>(handler: (req: R, ctx: C, user: SessionUser) => Promise<Response>) {
  return memberRoute<R, C>(async (req, ctx, user) => {
    if (user.role !== "admin") throw new AuthError("Admins only.", 403);
    return handler(req, ctx, user);
  });
}
