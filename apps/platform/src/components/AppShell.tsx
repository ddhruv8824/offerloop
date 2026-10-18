"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Menu, Shield, X } from "lucide-react";
import { Logo } from "./Logo";
import { TOOLS, TOOL_GROUPS } from "@/lib/tools";
import { useProfile } from "@/lib/profile";
import { startSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/server/auth/gate";

/** Routes whose page is an embedded tool with its own full-height layout. */
const FULL_BLEED_ROUTES = ["/resume"];

export function AppShell({ children, account }: { children: React.ReactNode; account: Account }) {
  // The profile is optional: tools work without it and pages that need it ask inline.
  const { profile, ready } = useProfile();
  // Bring this account's profile, tracker and DSA progress into this browser first.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let live = true;
    void startSync(account.id).finally(() => live && setSynced(true));
    return () => {
      live = false;
    };
  }, [account.id]);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const fullBleed = FULL_BLEED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  if (!ready || !synced) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading" />
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-6" aria-label="Workspace">
      {TOOL_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-2 px-3 text-[10px] font-semibold tracking-widest text-paper/40 uppercase">{group}</p>
          <ul className="flex flex-col gap-0.5">
            {TOOLS.filter((t) => t.group === group && !t.inDashboard).map((tool) => {
              const active = pathname === tool.href || pathname.startsWith(tool.href + "/");
              const Icon = tool.icon;
              return (
                <li key={tool.id}>
                  <Link
                    href={tool.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-paper/10 font-semibold text-paper" : "text-paper/65 hover:bg-paper/5 hover:text-paper",
                    )}
                  >
                    <Icon className={cn("size-4", active && "text-coral")} aria-hidden />
                    <span className="flex-1">{tool.name}</span>
                    {tool.status === "planned" && <span className="text-[10px] text-paper/35">soon</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const profileCard = profile ? (
    <Link href="/profile" className="flex items-center gap-3 rounded-md border border-ink-line px-3 py-2.5 hover:bg-paper/5">
      <span className="grid size-8 place-items-center rounded-full bg-coral/90 font-display text-sm font-semibold text-ink">
        {profile.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-paper">{profile.name}</span>
        <span className="block truncate text-xs text-paper/50">→ {profile.targetRole}</span>
      </span>
    </Link>
  ) : (
    <Link href="/onboarding" className="block rounded-md border border-dashed border-paper/20 px-3 py-2.5 hover:bg-paper/5">
      <span className="block text-sm font-semibold text-paper">Set up your profile</span>
      <span className="block text-xs text-paper/50">Optional · lets tools pre-fill for you</span>
    </Link>
  );

  // Who's signed in, with Log out (and Admin for admins). Hidden on a one-person install.
  const accountRow =
    account.mode === "accounts" ? (
      <div className="flex items-center gap-1 px-1 text-xs text-paper/50">
        <span className="min-w-0 flex-1 truncate" title={account.email}>
          {account.email}
        </span>
        {account.role === "admin" && (
          <Link href="/admin" className="rounded p-1.5 hover:bg-paper/10 hover:text-paper" title="Admin: invites and members" aria-label="Admin">
            <Shield className="size-3.5" />
          </Link>
        )}
        <form method="post" action="/api/auth/logout">
          <button type="submit" className="rounded p-1.5 hover:bg-paper/10 hover:text-paper" title="Log out" aria-label="Log out">
            <LogOut className="size-3.5" />
          </button>
        </form>
      </div>
    ) : null;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto bg-ink px-3 py-5 lg:flex">
        <div className="px-3">
          <Logo dark href="/dashboard" />
        </div>
        <div className="flex-1">{nav}</div>
        <div className="space-y-2">
          {profileCard}
          {accountRow}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Logo dark href="/dashboard" />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-md p-2 text-paper hover:bg-paper/10"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-x-0 top-[60px] bottom-0 z-20 flex flex-col gap-6 overflow-y-auto bg-ink px-3 py-5 lg:hidden">
          {nav}
          {profileCard}
          {accountRow}
        </div>
      )}

      {fullBleed ? (
        // Embedded tools bring their own layout: fill the space beside the sidebar.
        <main className="h-[calc(100dvh-60px)] min-w-0 lg:h-dvh lg:border-l lg:border-ink-line">{children}</main>
      ) : (
        <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl animate-fade-in">{children}</div>
          <footer className="mx-auto mt-12 flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-muted">
            <Link href="/docs" className="hover:text-text">
              Docs
            </Link>
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
            <span className="ml-auto">Offerloop · early access</span>
          </footer>
        </main>
      )}
    </div>
  );
}
