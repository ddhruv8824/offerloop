/**
 * Shared shapes for the platform. These move to `shared/types` once a second
 * app or service needs them.
 */

/** The one profile every tool reads (see "Shared Profile"). */
export interface CareerProfile {
  name: string;
  headline: string;
  resumeFileName?: string;
  targetRole: string;
  experienceYears: number;
  locations: string[];
  minSalaryLpa?: number;
  /** What they earn now, in LPA. Optional; used only to suggest what to ask for. */
  currentCtcLpa?: number;
  skills: string[];
  dealBreakers: string[];
  createdAt: string;
}

/** Where an application is. Order matters: automatic updates only move cards forward. */
export const STATUS_ORDER = ["saved", "applied", "in_review", "assessment", "interview", "offer", "rejected"] as const;
export type ApplicationStatus = (typeof STATUS_ORDER)[number];

export interface Job {
  id: string;
  title: string;
  companySlug: string;
  location: string;
  remote: boolean;
  source: "Greenhouse" | "Lever" | "Ashby" | "Hirist";
  postedDaysAgo: number;
  matchScore: number;
  salaryLpa?: [number, number];
  skills: string[];
}

/** One row in the shared tracker: a job plus what every tool did for it. */
export interface TrackedApplication {
  jobId: string;
  status: ApplicationStatus;
  updatedDaysAgo: number;
  resumeVersion?: string;
  practiceScore?: number;
  nextStep?: string;
}

export type Signal = { tone: "good" | "watch"; text: string };

export interface Company {
  slug: string;
  name: string;
  industry: string;
  city: string;
  size: string;
  summary: string;
  signals: Signal[];
  news: { title: string; source: string; daysAgo: number }[];
  discussions: { title: string; source: string; comments: number }[];
  blogPosts: string[];
  interviewExperiences: { role: string; rounds: string; verdict: string }[];
  insights?: CompanyInsights;
}

/** Pay range for one role band, in LPA (lakhs per annum). */
export interface PayBand {
  role: string;
  experience: string;
  low: number;
  median: number;
  high: number;
  dataPoints: number;
}

/** "Get salary & culture insights": what to ask for and what it's like to work there. */
export interface CompanyInsights {
  pay: PayBand[];
  culture: {
    workLife: number; // out of 5
    workMode: string;
    hours: string;
    highlights: string[];
    watchOuts: string[];
  };
}

export interface PracticeSession {
  id: string;
  companySlug: string;
  round: string;
  score: number;
  daysAgo: number;
  feedback: string;
}
