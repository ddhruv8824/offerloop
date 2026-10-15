import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="Offerloop home">
      <span className="grid size-7 place-items-center rounded-md bg-coral font-display text-sm font-bold text-ink">O</span>
      <span className={cn("font-display text-base font-semibold", dark ? "text-paper" : "text-text")}>
        Offer<span className="text-coral">loop</span>
      </span>
    </Link>
  );
}
