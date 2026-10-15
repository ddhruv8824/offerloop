/**
 * Sample data for the frontend-first phase. Companies are fictional. Each block
 * is replaced by a real source later: jobs → Job-apply-tool + ATS connectors,
 * tracker → shared Postgres tracker, interview practice → Aria, companies →
 * company-intel fetcher.
 */
import type {
  CareerProfile,
  Company,
  Job,
  PracticeSession,
  TrackedApplication,
} from "./types";

export const SAMPLE_PROFILE: CareerProfile = {
  name: "Dhruv",
  headline: "Frontend Developer · 2 yrs",
  resumeFileName: "DhruvCV.pdf",
  targetRole: "Frontend Developer",
  experienceYears: 2,
  locations: ["Pune", "Bangalore", "Remote"],
  minSalaryLpa: 12,
  currentCtcLpa: 9,
  skills: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Python", "FastAPI", "LangGraph"],
  dealBreakers: ["No night shifts", "No service bond"],
  createdAt: new Date().toISOString(),
};

export const JOBS: Job[] = [
  {
    id: "j1",
    title: "Frontend Developer",
    companySlug: "northwind-pay",
    location: "Bangalore",
    remote: false,
    source: "Greenhouse",
    postedDaysAgo: 2,
    matchScore: 86,
    salaryLpa: [14, 20],
    skills: ["React", "TypeScript", "Next.js", "Testing Library", "GraphQL"],
  },
  {
    id: "j2",
    title: "Software Engineer, Web Platform",
    companySlug: "lumen-health",
    location: "Pune",
    remote: true,
    source: "Lever",
    postedDaysAgo: 4,
    matchScore: 79,
    salaryLpa: [12, 18],
    skills: ["React", "TypeScript", "Docker", "Node.js", "Tailwind CSS"],
  },
  {
    id: "j3",
    title: "Full Stack Engineer (AI products)",
    companySlug: "quillstack",
    location: "Remote",
    remote: true,
    source: "Ashby",
    postedDaysAgo: 1,
    matchScore: 74,
    salaryLpa: [16, 24],
    skills: ["Python", "FastAPI", "React", "LangGraph", "Docker", "PostgreSQL"],
  },
  {
    id: "j4",
    title: "UI Engineer",
    companySlug: "orbit-logistics",
    location: "Pune",
    remote: false,
    source: "Hirist",
    postedDaysAgo: 6,
    matchScore: 68,
    salaryLpa: [10, 15],
    skills: ["React", "Redux", "JavaScript", "Webpack", "Docker"],
  },
  {
    id: "j5",
    title: "Frontend Engineer II",
    companySlug: "fernbank",
    location: "Bangalore",
    remote: false,
    source: "Greenhouse",
    postedDaysAgo: 9,
    matchScore: 61,
    salaryLpa: [18, 26],
    skills: ["React", "TypeScript", "Micro-frontends", "AWS", "Docker"],
  },
  {
    id: "j6",
    title: "Product Engineer",
    companySlug: "quillstack",
    location: "Remote",
    remote: true,
    source: "Ashby",
    postedDaysAgo: 3,
    matchScore: 57,
    salaryLpa: [15, 22],
    skills: ["Next.js", "PostgreSQL", "Prisma", "Kubernetes"],
  },
  {
    id: "j7",
    title: "React Developer",
    companySlug: "lumen-health",
    location: "Pune",
    remote: true,
    source: "Hirist",
    postedDaysAgo: 1,
    matchScore: 81,
    salaryLpa: [12, 17],
    skills: ["React", "TypeScript", "Next.js", "Jest"],
  },
];

export const TRACKER: TrackedApplication[] = [
  { jobId: "j1", status: "interview", updatedDaysAgo: 1, resumeVersion: "v3 · Northwind", practiceScore: 7.2, nextStep: "Technical round on Friday" },
  { jobId: "j2", status: "applied", updatedDaysAgo: 8, resumeVersion: "v2 · Lumen", nextStep: "No reply in 8 days — follow up" },
  { jobId: "j4", status: "applied", updatedDaysAgo: 3, resumeVersion: "v1 · base" },
  { jobId: "j3", status: "saved", updatedDaysAgo: 1, nextStep: "Tailor resume before applying" },
  { jobId: "j6", status: "saved", updatedDaysAgo: 2 },
  { jobId: "j5", status: "rejected", updatedDaysAgo: 12, nextStep: "Rejected after screening" },
];

export const COMPANIES: Company[] = [
  {
    slug: "northwind-pay",
    name: "Northwind Pay",
    industry: "Fintech",
    city: "Bangalore",
    size: "1,000–5,000",
    summary:
      "Growing payments company, hiring steadily for web roles. Recent product launches point to frontend investment. A few reviews mention long release weeks.",
    signals: [
      { tone: "good", text: "Open roles up 40% this month" },
      { tone: "good", text: "New merchant dashboard launched" },
      { tone: "watch", text: "Reviews mention crunch before releases" },
    ],
    news: [
      { title: "Northwind Pay launches a new merchant dashboard", source: "Sample News", daysAgo: 2 },
      { title: "Northwind Pay expands to two new markets", source: "Sample Daily", daysAgo: 9 },
      { title: "Fintech hiring rebounds in Q3", source: "Sample Wire", daysAgo: 14 },
    ],
    discussions: [
      { title: "Ask: what's it like working on Northwind's web team?", source: "Hacker News", comments: 42 },
      { title: "Northwind Pay interview experience (SDE-1)", source: "Reddit", comments: 18 },
    ],
    blogPosts: ["How we moved our dashboard to Next.js", "Design tokens at scale", "Testing payments UIs without flakes"],
    interviewExperiences: [
      { role: "Frontend Developer", rounds: "DSA screen → machine coding (React) → system design lite → HR", verdict: "Offer" },
      { role: "SDE-1", rounds: "Online test → 2 technical → HR", verdict: "Rejected after round 2" },
    ],
    insights: {
      pay: [
        { role: "Frontend Developer", experience: "1–3 yrs", low: 13, median: 17, high: 21, dataPoints: 24 },
        { role: "Senior Frontend Developer", experience: "4–6 yrs", low: 24, median: 30, high: 38, dataPoints: 11 },
      ],
      culture: {
        workLife: 3.4,
        workMode: "Hybrid · 3 days office",
        hours: "Usually 10–7; long weeks before releases",
        highlights: ["Strong frontend team and design system", "Fast promotions for good performers", "Health cover includes parents"],
        watchOuts: ["Release-week crunch mentioned often", "Notice period buyout rarely offered"],
      },
    },
  },
  {
    slug: "lumen-health",
    name: "Lumen Health",
    industry: "Healthtech",
    city: "Pune",
    size: "200–500",
    summary: "Mid-size healthtech with a remote-friendly web team. Stable hiring; engineering blog is active.",
    signals: [
      { tone: "good", text: "Remote-friendly for web roles" },
      { tone: "watch", text: "Slow to reply after applying (avg. 10 days)" },
    ],
    news: [{ title: "Lumen Health partners with regional clinics", source: "Sample News", daysAgo: 5 }],
    discussions: [{ title: "Lumen Health culture?", source: "Reddit", comments: 9 }],
    blogPosts: ["Accessibility in patient portals", "Our Docker dev setup"],
    interviewExperiences: [{ role: "Software Engineer", rounds: "Take-home → review call → HR", verdict: "Offer" }],
    insights: {
      pay: [{ role: "Software Engineer", experience: "1–3 yrs", low: 11, median: 14, high: 18, dataPoints: 9 }],
      culture: {
        workLife: 4.1,
        workMode: "Remote-first · quarterly meetups",
        hours: "Flexible, async-friendly",
        highlights: ["Calm pace, few late nights", "Learning budget every year"],
        watchOuts: ["Pay below big-fintech range", "Slow hiring decisions"],
      },
    },
  },
  {
    slug: "quillstack",
    name: "Quillstack",
    industry: "AI tooling",
    city: "Remote",
    size: "50–200",
    summary: "Early-stage AI tooling startup, fully remote. Raised a recent round; small team, high ownership.",
    signals: [
      { tone: "good", text: "Recently funded" },
      { tone: "good", text: "Uses LangGraph + FastAPI — matches your stack" },
      { tone: "watch", text: "Small team: broad scope per engineer" },
    ],
    news: [{ title: "Quillstack raises seed round for AI writing tools", source: "Sample Wire", daysAgo: 20 }],
    discussions: [],
    blogPosts: ["Shipping agents with LangGraph"],
    interviewExperiences: [],
    insights: {
      pay: [{ role: "Full Stack Engineer", experience: "1–4 yrs", low: 15, median: 20, high: 26, dataPoints: 4 }],
      culture: {
        workLife: 3.6,
        workMode: "Fully remote",
        hours: "Flexible, but on-call rotations",
        highlights: ["High ownership, ships weekly", "ESOPs offered to early engineers"],
        watchOuts: ["Few data points — treat pay range as rough", "Startup risk: runway depends on next round"],
      },
    },
  },
  {
    slug: "orbit-logistics",
    name: "Orbit Logistics",
    industry: "Logistics",
    city: "Pune",
    size: "5,000+",
    summary: "Large logistics company modernising its internal tools. Steady but slow hiring.",
    signals: [{ tone: "watch", text: "Same UI Engineer post re-listed 3 times — possible ghost job" }],
    news: [],
    discussions: [],
    blogPosts: [],
    interviewExperiences: [],
    insights: {
      pay: [{ role: "UI Engineer", experience: "2–4 yrs", low: 9, median: 12, high: 15, dataPoints: 16 }],
      culture: {
        workLife: 3.9,
        workMode: "Office · 5 days",
        hours: "Fixed 9:30–6:30",
        highlights: ["Stable, low attrition", "Predictable hours"],
        watchOuts: ["Older tech stack (Webpack, Redux)", "Small yearly hikes"],
      },
    },
  },
  {
    slug: "fernbank",
    name: "Fernbank",
    industry: "Banking",
    city: "Bangalore",
    size: "5,000+",
    summary: "Digital bank with a large frontend org built on micro-frontends.",
    signals: [{ tone: "watch", text: "Layoff news 8 months ago" }],
    news: [{ title: "Fernbank restructures two product teams", source: "Sample Daily", daysAgo: 240 }],
    discussions: [],
    blogPosts: ["Micro-frontends, three years in"],
    interviewExperiences: [],
  },
];

export const PRACTICE_SESSIONS: PracticeSession[] = [
  { id: "s1", companySlug: "northwind-pay", round: "Technical", score: 7.2, daysAgo: 1, feedback: "Clear React answers; weak on caching strategy in system design." },
  { id: "s2", companySlug: "lumen-health", round: "Behavioral", score: 8.1, daysAgo: 6, feedback: "Good STAR structure; add measurable results." },
];

export function getJob(id: string) {
  return JOBS.find((j) => j.id === id);
}

export function getCompany(slug: string) {
  return COMPANIES.find((c) => c.slug === slug);
}
