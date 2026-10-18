// Server only. Supabase clients that keep the session in cookies (via @supabase/ssr).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { supabaseConfig } from "./config";

/** For route handlers and server components (cookies from next/headers). */
export async function supabaseServer() {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase isn't configured.");
  const jar = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Server components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** For the proxy: reads the request's cookies and writes refreshed ones onto `res`. */
export function supabaseProxy(req: NextRequest, res: () => NextResponse) {
  const cfg = supabaseConfig()!;
  let response = res();
  const client = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        response = res();
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  return { client, response: () => response };
}
