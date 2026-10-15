// Structured resume data → id-tagged resume JSON (current_resume) and the initial
// master profile. The AI extraction itself is in resume-parser.ts.
//
// Ids are assigned here in code (never by the model) so they are stable and unique:
// experience "exp1" with bullets "exp1_b1"…, projects "proj1", education "edu1".

import type { MasterProfile, Resume } from "../lib/tailor/types";

type Raw = Record<string, unknown>;

const s = (value: unknown): string => (value == null || value === "null" ? "" : String(value).trim());

function strList(values: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(values) ? values : []) {
    const text = s(v).replace(/^[•\-–* ]+/, "").trim();
    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      out.push(text);
    }
  }
  return out;
}

const records = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((v): v is Raw => !!v && typeof v === "object") : []);

/** Normalise extracted data and give every item and bullet a stable id. */
export function assignIds(raw: Raw): Resume {
  const contact = (raw.contact ?? {}) as Raw;
  const bullets = (itemId: string, values: unknown) =>
    strList(values).map((text, j) => ({ id: `${itemId}_b${j + 1}`, text }));
  return {
    contact: {
      name: s(contact.name),
      email: s(contact.email),
      phone: s(contact.phone),
      location: s(contact.location),
      linkedin: s(contact.linkedin),
      github: s(contact.github),
      website: s(contact.website),
    },
    summary: { id: "summary", text: s(raw.summary) },
    experience: records(raw.experience).map((exp, i) => ({
      id: `exp${i + 1}`,
      company: s(exp.company),
      title: s(exp.title),
      location: s(exp.location),
      start_date: s(exp.start_date),
      end_date: s(exp.end_date),
      tools: strList(exp.tools),
      bullets: bullets(`exp${i + 1}`, exp.bullets),
    })),
    projects: records(raw.projects).map((proj, i) => ({
      id: `proj${i + 1}`,
      name: s(proj.name),
      tech: strList(proj.tech),
      link: s(proj.link),
      start_date: s(proj.start_date),
      end_date: s(proj.end_date),
      bullets: bullets(`proj${i + 1}`, proj.bullets),
    })),
    skills: strList(raw.skills),
    education: records(raw.education).map((edu, i) => ({
      id: `edu${i + 1}`,
      institution: s(edu.institution),
      degree: s(edu.degree),
      field_of_study: s(edu.field_of_study),
      dates: s(edu.dates || edu.graduation_date),
      gpa: s(edu.gpa),
    })),
    certifications: strList(raw.certifications),
  };
}

/** Seed the master profile — the candidate's full truth — from a parsed resume. */
export function buildMasterProfile(resume: Resume): MasterProfile {
  return {
    contact: { ...resume.contact },
    jobs: resume.experience.map((e) => ({
      id: e.id,
      company: e.company,
      title: e.title,
      start_date: e.start_date,
      end_date: e.end_date,
      bullets: e.bullets.map((b) => b.text),
      tools: [...(e.tools ?? [])],
      notes: "",
    })),
    projects: resume.projects.map((p) => ({
      id: p.id,
      name: p.name,
      bullets: p.bullets.map((b) => b.text),
      tech: [...(p.tech ?? [])],
      notes: "",
    })),
    education: resume.education.map((e) => ({ ...e })),
    certifications: [...(resume.certifications ?? [])],
    confirmed_skills: [...(resume.skills ?? [])],
    summary: resume.summary?.text ?? "",
    notes: "",
  };
}
