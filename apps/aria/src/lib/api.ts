const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://auralis-backend-iqln.onrender.com";

export function getHomeUrl(): string {
  return process.env.NEXT_PUBLIC_HOME_URL ?? "http://127.0.0.1:4000";
}

export function getApiUrl(path: string): string {
  return `${API_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "wss://auralis-backend-iqln.onrender.com/ws/session";
}

export function getCodeRunUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "https://auralis-backend-iqln.onrender.com";
  return `${base.replace(/\/$/, "")}/api/v1/code`;
}

export interface ResumeContextResponse {
  context_block: string;
  candidate_name?: string | null;
  skill_count: number;
}

export interface JobDescriptionContextResponse {
  context_block: string;
  char_count: number;
}

export async function uploadResume(file: File): Promise<ResumeContextResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(getApiUrl("/api/v1/resume/context"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }

  return res.json();
}

export async function parseResumeFile(file: File): Promise<any> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(getApiUrl("/api/v1/resume/parse"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }

  return res.json();
}

export async function uploadJobDescription(file: File): Promise<JobDescriptionContextResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(getApiUrl("/api/v1/job-description/context"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }

  return res.json();
}

export async function submitJobDescriptionText(text: string): Promise<JobDescriptionContextResponse> {
  const res = await fetch(getApiUrl("/api/v1/job-description/text"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }

  return res.json();
}

export interface ResumeMatchResponse {
  match_score: number;
  is_match: boolean;
  reason: string;
  gaps: string[];
}

export async function checkResumeJdMatch(resumeText: string, jdText: string): Promise<ResumeMatchResponse> {
  const res = await fetch(getApiUrl("/api/v1/resume/match"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resume_text: resumeText, jd_text: jdText }),
  });
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }
  return res.json();
}

export async function adaptResumeToJd(resumeData: any, jdText: string): Promise<any> {
  const res = await fetch(getApiUrl("/api/v1/resume/adapt"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resume_data: resumeData, jd_text: jdText }),
  });
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }
  return res.json();
}

export async function generateResumePdf(resumeData: any): Promise<Blob> {
  const res = await fetch(getApiUrl("/api/v1/resume/generate-pdf"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resumeData),
  });
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }
  return res.blob();
}

