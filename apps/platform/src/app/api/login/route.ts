import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, isCorrectPassword } from "@/lib/server/site-auth";
import { publicUrl } from "@/lib/server/public-url";

export const dynamic = "force-dynamic";

/** Only same-site paths, so the login can't be used to send someone elsewhere. */
function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/dashboard";
}

// A plain form POST from /login, so it works without JavaScript.
export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  if (!isCorrectPassword(String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down password guessing
    const back = publicUrl(req, "/login");
    back.searchParams.set("error", "1");
    if (next !== "/dashboard") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }
  const res = NextResponse.redirect(publicUrl(req, next), 303);
  res.cookies.set(AUTH_COOKIE, authToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}
