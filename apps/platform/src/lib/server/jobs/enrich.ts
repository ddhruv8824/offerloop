// Server only. Fill in what a posting says but its source didn't give as a field.
import { parseSalaryLpa } from "@/lib/company-info";
import type { FoundJob } from "@/lib/jobs";

/** Pay written in the description ("CTC 18–25 LPA") when the source has no salary field for it. */
export function withStatedSalary(job: FoundJob): FoundJob {
  if (job.salaryLpa || !job.description) return job;
  const salary = parseSalaryLpa(job.description);
  return salary ? { ...job, salaryLpa: salary, salarySource: "description" } : job;
}
