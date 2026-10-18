import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui";

/** The frame around every sign-in page. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <Card className="p-6">
          <Logo />
          <h1 className="mt-5 font-display text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </Card>
        {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
        <p className="mt-6 text-center text-xs text-faint">
          <Link href="/docs" className="hover:underline">
            Docs
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
        </p>
      </div>
    </main>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-ink";

export function Notice({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <p role={error ? "alert" : "status"} className={error ? "mb-4 rounded-md bg-danger-wash px-3 py-2 text-sm text-danger" : "mb-4 rounded-md bg-success-wash px-3 py-2 text-sm text-success"}>
      {error ?? notice}
    </p>
  );
}

/** "Continue with Google" — a plain link to the server route that starts it. */
export function GoogleButton({ next }: { next?: string }) {
  return (
    <a
      href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold hover:border-faint"
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-faint">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}
