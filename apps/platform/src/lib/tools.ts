import {
  Briefcase,
  Building2,
  FileText,
  KanbanSquare,
  LayoutGrid,
  ListChecks,
  Mic,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Every tool is a standalone module that also plugs into this platform.
 * `origin` names the existing project the module is extracted from.
 * `standalone` tools work with no profile: you bring what they need inside the tool.
 */
export type ModuleStatus = "preview" | "integrating" | "planned";

export interface ToolModule {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Tools" | "You";
  tagline: string;
  /** What you do inside the tool, shown on its dashboard card. */
  bring?: string;
  standalone?: boolean;
  origin?: string;
  status?: ModuleStatus;
}

export const TOOLS: ToolModule[] = [
  { id: "dashboard", name: "Dashboard", href: "/dashboard", icon: LayoutGrid, group: "Overview", tagline: "All your tools in one place" },
  { id: "automations", name: "Automations", href: "/automations", icon: Workflow, group: "Overview", tagline: "Chain tools into your own workflow" },
  { id: "tracker", name: "Tracker", href: "/tracker", icon: KanbanSquare, group: "Overview", tagline: "Every application, one board" },
  {
    id: "resume",
    name: "Resume Studio",
    href: "/resume",
    icon: FileText,
    group: "Tools",
    tagline: "Tailor your resume to any job description",
    bring: "Upload a resume, paste a JD, accept or reject each edit, download the PDF.",
    standalone: true,
    origin: "Redline",
  },
  {
    id: "jobs",
    name: "Job Finder",
    href: "/jobs",
    icon: Briefcase,
    group: "Tools",
    tagline: "Roles ranked by how well they fit you",
    bring: "Live roles from Hirist and company career pages, ranked against your skills, with weak fits flagged.",
    standalone: true,
    origin: "Hirist + career pages",
  },
  {
    id: "dsa",
    name: "DSA Prep",
    href: "/dsa",
    icon: ListChecks,
    group: "Tools",
    tagline: "Most-asked LeetCode questions per company",
    bring: "Pick a company or domain, solve each question on LeetCode, and track what you've done.",
    standalone: true,
    origin: "LeetCode",
  },
  {
    id: "interview",
    name: "Interview Coach",
    href: "/interview",
    icon: Mic,
    group: "Tools",
    tagline: "Voice mock interviews with a scorecard",
    bring: "Pick a company and round, talk to Aria, get scored feedback at the end.",
    standalone: true,
    origin: "Aria",
    status: "planned",
  },
  {
    id: "companies",
    name: "Company Intel",
    href: "/companies",
    icon: Building2,
    group: "Tools",
    tagline: "News, signals and interview experiences",
    bring: "Search any company for recent news, red flags and what its interviews are like.",
    standalone: true,
    status: "planned",
  },
  { id: "profile", name: "Career Profile", href: "/profile", icon: UserRound, group: "You", tagline: "Optional — lets tools pre-fill for you" },
];

export const TOOL_GROUPS = ["Overview", "Tools", "You"] as const;

export const STANDALONE_TOOLS = TOOLS.filter((t) => t.standalone);

export function getTool(id: string) {
  return TOOLS.find((t) => t.id === id)!;
}
