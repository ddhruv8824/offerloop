import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleStatus } from "@/lib/tools";

/* ── Buttons ─────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "dark";

const variantClass: Record<Variant, string> = {
  primary: "bg-coral text-ink hover:bg-coral-strong hover:text-paper",
  secondary: "border border-line bg-paper text-text hover:border-faint",
  ghost: "text-muted hover:bg-ink/5 hover:text-text",
  dark: "bg-ink text-paper hover:bg-ink-soft",
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(buttonBase, variantClass[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(buttonBase, variantClass[variant], className)} {...props} />;
}

/* ── Surfaces ────────────────────────────────────────── */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-paper", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ── Small pieces ────────────────────────────────────── */

type Tone = "neutral" | "coral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-ink/5 text-muted",
  coral: "bg-coral-wash text-coral-strong",
  success: "bg-success-wash text-success",
  warning: "bg-warning-wash text-warning",
  danger: "bg-danger-wash text-danger",
  info: "bg-info-wash text-info",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function SkillChip({ skill, state = "neutral" }: { skill: string; state?: "have" | "missing" | "neutral" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs",
        state === "have" && "border-success/30 bg-success-wash text-success",
        state === "missing" && "border-dashed border-faint text-muted",
        state === "neutral" && "border-line text-muted",
      )}
    >
      {skill}
    </span>
  );
}

export function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 65) return "info";
  if (score >= 50) return "warning";
  return "danger";
}

/** Circular match score. 0–100. */
export function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = {
    success: "var(--color-success)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    danger: "var(--color-danger)",
    neutral: "var(--color-muted)",
    coral: "var(--color-coral)",
  }[scoreTone(score)];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-xs font-semibold">{score}</span>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

const statusLabel: Record<ModuleStatus, string> = {
  preview: "Preview",
  integrating: "Integrating",
  planned: "Planned",
};

/** Tells the user honestly which engine powers a page and whether it's wired up yet. */
export function ModuleBanner({ origin, status, children }: { origin?: string; status?: ModuleStatus; children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-info/25 bg-info-wash px-4 py-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
      <div className="min-w-0 text-text">
        {status && (
          <Badge tone="info" className="mr-2 align-middle">
            {statusLabel[status]}
          </Badge>
        )}
        {children}
        {origin && <span className="text-muted"> Engine: {origin}.</span>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-ink/5 text-muted">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function CompanyAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md bg-ink font-display text-xs font-semibold text-paper"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
