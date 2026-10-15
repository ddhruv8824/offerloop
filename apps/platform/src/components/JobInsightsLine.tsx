import { ExternalLink, IndianRupee, Star } from "lucide-react";
import { formatSalary, type JobInsights } from "@/lib/company-info";
import { cn } from "@/lib/utils";

const ASK_BASIS = {
  posting: "Based on the pay this posting states and where your experience sits in the range it asks for.",
  market: "Based on what similar roles publish as pay, at your experience.",
  personal: "Based only on your current CTC and minimum — there's no published pay to compare with yet.",
} as const;

const ratingTone =(rating: number) => (rating >= 4 ? "text-success" : rating >= 3.3 ? "text-text" : "text-warning");

/**
 * Salary and culture for one job, on one or two compact lines: stated pay, employee rating
 * (with how many reviews it rests on), company type and size, top benefits. Always names
 * its source and links to it.
 */
export function JobInsightsLine({ insights, className }: { insights: JobInsights; className?: string }) {
  const { rating, reviewsCount, roleRating, salaryLpa } = insights;
  const facts = [insights.companyType, insights.employeesIndia && `${insights.employeesIndia} people in India`].filter(Boolean);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted", className)}>
      {insights.askLpa !== undefined && (
        <span
          className="inline-flex items-center gap-1 rounded-sm bg-coral-wash px-1.5 py-0.5 font-semibold text-coral-strong"
          title={`${ASK_BASIS[insights.askBasis ?? "market"]}${insights.askFloorLpa ? ` Don't settle below ${insights.askFloorLpa} LPA.` : ""} A starting point, not a promise.`}
        >
          Ask about {insights.askLpa} LPA
          {insights.askFloorLpa !== undefined && insights.askFloorLpa < insights.askLpa && <span className="font-normal">· not below {insights.askFloorLpa}</span>}
        </span>
      )}
      {salaryLpa && (
        <span className="inline-flex items-center gap-1 font-semibold text-text" title={insights.salarySource === "description" ? "Read from the job description" : "Stated on the posting"}>
          <IndianRupee className="size-3.5" aria-hidden />
          {formatSalary(salaryLpa)}
          <span className="font-normal text-muted">{insights.salarySource === "description" ? "(from the description)" : "(posted)"}</span>
        </span>
      )}
      {rating !== undefined && (
        <span className="inline-flex items-center gap-1">
          <Star className={cn("size-3.5 fill-current", ratingTone(rating))} aria-hidden />
          <span className={cn("font-semibold", ratingTone(rating))}>{rating}</span>
          <span>/ 5{reviewsCount ? ` from ${reviewsCount.toLocaleString("en-IN")} ${reviewsCount === 1 ? "review" : "reviews"}` : ""}</span>
        </span>
      )}
      {roleRating && (
        <span>
          {roleRating.name}s rate it <span className="font-semibold text-text">{roleRating.rating}</span> ({roleRating.count})
        </span>
      )}
      {facts.length > 0 && <span>{facts.join(" · ")}</span>}
      {insights.benefits.length > 0 && <span>Benefits: {insights.benefits.join(", ")}</span>}
      {insights.reviewsUrl && (
        <a href={insights.reviewsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-coral-strong hover:underline">
          {insights.source ?? "Reviews"} <ExternalLink className="size-3" aria-label="opens in a new tab" />
        </a>
      )}
    </div>
  );
}
