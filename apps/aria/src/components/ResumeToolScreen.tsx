"use client";

import { useState } from "react";
import { Briefcase, FileUp, Sparkles, Download, RefreshCw, ArrowRight, CheckCircle, AlertTriangle, User } from "lucide-react";
import { motion } from "motion/react";
import { parseResumeFile, checkResumeJdMatch, adaptResumeToJd, generateResumePdf } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ResumeToolScreenProps {
  onBackToInterview: (adaptedContextBlock: string, adaptedData: any) => void;
}

export function ResumeToolScreen({ onBackToInterview }: ResumeToolScreenProps) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeData, setResumeData] = useState<any | null>(null);
  const [resumeStatus, setResumeStatus] = useState({ text: "", kind: "" });
  
  const [jdText, setJdText] = useState("");
  const [jdStatus, setJdStatus] = useState("");

  const [isCheckingMatch, setIsCheckingMatch] = useState(false);
  const [matchReport, setMatchReport] = useState<any | null>(null);

  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptedData, setAdaptedData] = useState<any | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleResumeSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setResumeStatus({ text: "Parsing resume…", kind: "" });
    try {
      const data = await parseResumeFile(file);
      setResumeData(data);
      setResumeStatus({ text: `Successfully parsed: ${file.name}`, kind: "ok" });
    } catch (err) {
      setResumeData(null);
      setResumeStatus({
        text: `Failed to parse: ${err instanceof Error ? err.message : "Unknown error"}`,
        kind: "err",
      });
    }
  };

  const handleCheckMatch = async () => {
    if (!resumeData) {
      alert("Please upload a resume first.");
      return;
    }
    if (!jdText.trim()) {
      alert("Please enter a job description.");
      return;
    }
    setIsCheckingMatch(true);
    setMatchReport(null);
    try {
      const resumeText = resumeData.raw_text || 
        `${resumeData.summary || ""}\n\nSkills: ${(resumeData.skills || []).join(", ")}\n\nExperience: ${JSON.stringify(resumeData.experience || [])}`;
      const report = await checkResumeJdMatch(resumeText, jdText);
      setMatchReport(report);
    } catch (err) {
      alert("Failed to analyze compatibility score.");
    } finally {
      setIsCheckingMatch(false);
    }
  };

  const handleAdapt = async () => {
    if (!resumeData || !jdText.trim()) return;
    setIsAdapting(true);
    try {
      const adapted = await adaptResumeToJd(resumeData, jdText);
      setAdaptedData(adapted);
    } catch (err) {
      alert("Failed to tailor resume.");
    } finally {
      setIsAdapting(false);
    }
  };

  const handleDownloadPdf = async () => {
    const dataToUse = adaptedData || resumeData;
    if (!dataToUse) return;
    setIsDownloading(true);
    try {
      const blob = await generateResumePdf(dataToUse);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataToUse.contact?.name || "tailored"}_resume.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to generate PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUseAndStart = () => {
    if (!adaptedData) return;
    
    // Construct the context block to pass back to the interview session
    let context = "--- RESUME / CANDIDATE CONTEXT ---\n";
    context += "The following is structured information extracted from the candidate's resume.\n";
    context += "Use it to ask specific, targeted interview questions. Reference exact job titles, company names, etc.\n\n";
    if (adaptedData.contact?.name) context += `Candidate name: ${adaptedData.contact.name}\n`;
    if (adaptedData.contact?.email) context += `Email: ${adaptedData.contact.email}\n`;
    if (adaptedData.contact?.phone) context += `Phone: ${adaptedData.contact.phone}\n`;
    if (adaptedData.contact?.linkedin) context += `LinkedIn: ${adaptedData.contact.linkedin}\n`;
    if (adaptedData.contact?.github) context += `GitHub: ${adaptedData.contact.github}\n`;
    if (adaptedData.contact?.location) context += `Location: ${adaptedData.contact.location}\n`;
    
    if (adaptedData.summary) context += `\nProfessional summary: ${adaptedData.summary}\n`;
    if (adaptedData.skills && adaptedData.skills.length > 0) context += `\nSkills (${adaptedData.skills.length} total): ${adaptedData.skills.join(", ")}\n`;
    
    if (adaptedData.experience && adaptedData.experience.length > 0) {
      context += `\nWork experience (${adaptedData.experience.length} roles):\n`;
      for (const exp of adaptedData.experience) {
        context += `  • ${exp.title || "Unknown Title"} at ${exp.company || "Unknown Company"}  (${exp.start_date || "?"} – ${exp.end_date || "present"})\n`;
        if (exp.bullets) {
          for (const bullet of exp.bullets.slice(0, 5)) {
            context += `      – ${bullet}\n`;
          }
        }
      }
    }
    
    if (adaptedData.education && adaptedData.education.length > 0) {
      context += `\nEducation (${adaptedData.education.length} entries):\n`;
      for (const edu of adaptedData.education) {
        context += `  • ${edu.degree || "Degree unknown"}  |  ${edu.institution || "Institution unknown"}  |  Graduated: ${edu.graduation_date || "—"}${edu.gpa ? `  GPA: ${edu.gpa}` : ""}\n`;
      }
    }
    context += "\n--- END OF RESUME CONTEXT ---";

    onBackToInterview(context, adaptedData);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="rounded-3xl border border-aria bg-card-aria p-8 md:p-10 space-y-8"
    >
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <span className="rounded-full bg-surface-variant px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
            Standalone tool
          </span>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter text-primary md:text-[40px]">
            AI Resume Tailor & PDF Builder
          </h2>
          <p className="mt-1 text-sm text-secondary-aria">
            Upload your resume, paste the target Job Description, check domain compatibility, and generate a matching tailored PDF.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: Upload and Input */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-aria bg-panel-aria p-6 space-y-4">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              1. Upload Original Resume
            </h3>
            <label className="group flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-aria bg-surface px-6 py-6 text-center hover:bg-surface-variant/40 transition-all">
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleResumeSelect} />
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-aria bg-surface transition-transform group-hover:scale-105">
                <FileUp className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-primary">Browse PDF or DOCX</span>
            </label>
            {resumeStatus.text && (
              <p className={cn("text-xs font-medium", resumeStatus.kind === "ok" ? "text-emerald-700" : resumeStatus.kind === "err" ? "text-red-600" : "text-secondary-aria")}>
                {resumeStatus.text}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-aria bg-panel-aria p-6 space-y-4">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              2. Paste Job Description
            </h3>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the target job description details here..."
              rows={6}
              className="w-full rounded-xl border border-aria bg-surface p-3 text-sm text-primary placeholder-secondary-aria focus:border-outline focus:outline-none resize-none"
            />
          </div>

          <button
            type="button"
            onClick={handleCheckMatch}
            disabled={isCheckingMatch || !resumeData || !jdText.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-on-primary hover:bg-black/80 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isCheckingMatch ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing alignment…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Check Compatibility Match
              </>
            )}
          </button>
        </div>

        {/* Right Column: Compatibility Check Results */}
        <div className="space-y-6">
          {matchReport ? (
            <div className="rounded-2xl border border-aria bg-panel-aria p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 flex items-center justify-center rounded-full border-4 border-outline bg-surface">
                  <span className={cn(
                    "text-xl font-bold",
                    matchReport.match_score >= 70 ? "text-emerald-700" : matchReport.match_score >= 50 ? "text-amber-600" : "text-red-600"
                  )}>
                    {matchReport.match_score}%
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold text-primary text-lg">Compatibility Score</h4>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider",
                    matchReport.is_match 
                      ? "bg-emerald-500/10 text-emerald-800 border border-emerald-500/20" 
                      : "bg-red-500/10 text-red-800 border border-red-500/20"
                  )}>
                    {matchReport.is_match ? "Good Alignment" : "Domain Mismatch"}
                  </span>
                </div>
              </div>

              <div className="text-sm text-secondary-aria border-t border-aria pt-3 space-y-2">
                <p className="font-medium text-primary">Analysis:</p>
                <p className="leading-relaxed">{matchReport.reason}</p>
              </div>

              {matchReport.gaps && matchReport.gaps.length > 0 && (
                <div className="space-y-2 border-t border-aria pt-3 text-sm">
                  <p className="font-medium text-primary flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    Identified Gaps:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-secondary-aria text-xs">
                    {matchReport.gaps.map((gap: string, i: number) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-aria pt-4 space-y-3">
                <button
                  type="button"
                  onClick={handleAdapt}
                  disabled={isAdapting}
                  className="w-full flex items-center justify-center gap-2 rounded-full border border-primary bg-transparent px-5 py-2.5 text-sm font-medium text-primary hover:bg-surface-variant transition-all disabled:opacity-60"
                >
                  {isAdapting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Tailoring Resume…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Tailor & Adapt Resume to JD
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center border border-dashed border-aria rounded-2xl p-8 text-center text-secondary-aria">
              <Briefcase className="h-12 w-12 text-secondary-aria/40 mb-3" />
              <p className="font-medium text-primary">Compatibility Scorecard</p>
              <p className="text-xs mt-1 max-w-xs">Upload your resume and paste the job description, then click Check Compatibility to see your score.</p>
            </div>
          )}

          {adaptedData && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
              <h4 className="font-semibold text-emerald-800 flex items-center gap-2 text-base">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                Tailored Resume Draft Ready!
              </h4>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Gemini rewritten summary and bullet points to match the job requirements while retaining your factual history.
              </p>
              {adaptedData.summary && (
                <div className="rounded-xl bg-white border border-emerald-500/10 p-4 text-xs text-zinc-700">
                  <span className="font-semibold text-emerald-800 block mb-1">Tailored Summary Preview:</span>
                  <p className="italic leading-relaxed">"{adaptedData.summary}"</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isDownloading ? "Downloading…" : "Download PDF Resume"}
                </button>
                <button
                  type="button"
                  onClick={handleUseAndStart}
                  className="flex-grow flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary hover:bg-black/80 transition-all"
                >
                  Start Interview with this Resume
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
