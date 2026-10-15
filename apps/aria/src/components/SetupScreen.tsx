"use client";

import { useState } from "react";
import { Briefcase, Building2, FileUp, Mail, Mic, Sparkles, AlertTriangle, CheckCircle, Download } from "lucide-react";
import { motion } from "motion/react";
import { INTERVIEWER_NAME } from "@/lib/constants";
import type { PracticeSession } from "@/lib/types";
import { cn } from "@/lib/utils";

export type UploadStatus = { text: string; kind: "" | "ok" | "err" };

interface SetupScreenProps {
  practice: PracticeSession;
  resumeStatus: UploadStatus;
  jdStatus: UploadStatus;
  isStarting: boolean;
  onResumeSelect: (file: File) => void;
  onJobDescriptionSelect: (file: File) => void;
  onJobDescriptionTextSubmit: (text: string) => void;
  onStart: () => void;

  matchReport: any;
  showMatchWarning: boolean;
  onCancelWarning: () => void;
  onForceStart: () => void;
  isAdapting: boolean;
  onAdapt: () => void;
  onDownloadPdf: () => void;
  adaptedResumeData: any;
}

const STEPS = [
  { num: "01", label: "Upload resume (optional)", icon: FileUp },
  { num: "02", label: "Upload job description (optional)", icon: Briefcase },
  { num: "03", label: "Start & allow mic", icon: Mic },
  { num: "04", label: "Get your scorecard", icon: Sparkles },
];

function UploadZone({
  title,
  hint,
  accept,
  icon: Icon,
  status,
  onSelect,
}: {
  title: string;
  hint: string;
  accept: string;
  icon: typeof FileUp;
  status: UploadStatus;
  onSelect: (file: File) => void;
}) {
  return (
    <div>
      <label className="group flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-aria bg-panel-aria px-6 py-8 text-center transition-all hover:border-outline hover:bg-surface-variant/40">
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelect(file);
          }}
        />
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-aria bg-surface shadow-sm transition-transform group-hover:scale-105">
          <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
        </div>
        <div className="text-sm font-medium text-primary">{title}</div>
        <div className="mt-1 text-xs text-secondary-aria">{hint}</div>
      </label>
      {status.text && (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            status.kind === "ok" && "text-emerald-700",
            status.kind === "err" && "text-red-600",
            status.kind === "" && "text-secondary-aria",
          )}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

export function SetupScreen({
  practice,
  resumeStatus,
  jdStatus,
  isStarting,
  onResumeSelect,
  onJobDescriptionSelect,
  onJobDescriptionTextSubmit,
  onStart,

  matchReport,
  showMatchWarning,
  onCancelWarning,
  onForceStart,
  isAdapting,
  onAdapt,
  onDownloadPdf,
  adaptedResumeData,
}: SetupScreenProps) {
  const [jdMode, setJdMode] = useState<"upload" | "paste">("upload");
  const [jdText, setJdText] = useState("");

  if (showMatchWarning && matchReport) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="rounded-3xl border border-amber-500/20 bg-[#FFFDF5] p-8 md:p-10 space-y-6"
      >
        <div className="flex items-center gap-3 text-amber-800">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          <h2 className="text-2xl font-bold tracking-tight">⚠️ Resume / Job Description Mismatch</h2>
        </div>

        <p className="text-secondary-aria text-base leading-relaxed">
          Our AI recruiter checked your resume and the target job description. They do not seem to align properly. Domain compatibility score: <strong>{matchReport.match_score}%</strong>.
        </p>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
          <p className="text-sm font-semibold text-amber-900">Recruiter Analysis:</p>
          <p className="text-sm text-amber-800 leading-relaxed">{matchReport.reason}</p>
          {matchReport.gaps && matchReport.gaps.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-amber-900">Identified Gaps:</p>
              <ul className="list-disc pl-5 text-xs text-amber-800 space-y-1">
                {matchReport.gaps.map((gap: string, i: number) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {adaptedResumeData ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
            <h3 className="font-semibold text-emerald-800 flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Tailored Resume Prepared!
            </h3>
            <p className="text-xs text-emerald-700 leading-relaxed">
              We adapted your work experience and skills to match the job requirements perfectly without fabricating fake history.
            </p>
            {adaptedResumeData.summary && (
              <div className="rounded-lg bg-white border border-emerald-500/10 p-3.5 text-xs text-zinc-700">
                <span className="font-semibold text-emerald-800 block mb-1">Tailored Summary Preview:</span>
                <p className="italic leading-relaxed">"{adaptedResumeData.summary}"</p>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onDownloadPdf()}
                className="rounded-full bg-emerald-600 px-5 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-all flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF Resume
              </button>
              <button
                type="button"
                onClick={onForceStart}
                className="rounded-full bg-primary px-6 py-2 text-xs font-medium text-on-primary hover:bg-black/80 transition-all"
              >
                Start Interview Now →
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onAdapt()}
              disabled={isAdapting}
              className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-all disabled:opacity-60"
            >
              {isAdapting ? "Adapting Resume…" : "Adapt Resume to Match JD"}
            </button>
            <button
              type="button"
              onClick={onForceStart}
              className="rounded-full border border-outline bg-transparent px-5 py-3 text-sm font-medium text-primary hover:bg-surface-variant transition-all"
            >
              Continue with Original Resume
            </button>
            <button
              type="button"
              onClick={onCancelWarning}
              className="rounded-full border border-transparent bg-transparent px-4 py-3 text-sm font-medium text-secondary-aria hover:text-primary transition-all"
            >
              Go Back
            </button>
          </div>
        )}
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="rounded-3xl border border-aria bg-card-aria p-8 md:p-10"
    >
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <span className="rounded-full bg-surface-variant px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
          Step 1 · Prepare
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-aria bg-panel-aria px-3 py-1 text-xs font-medium text-primary">
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            {practice.companyName === "General" ? "General track" : practice.companyName}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-aria bg-panel-aria px-3 py-1 text-xs font-medium text-secondary-aria">
            <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
            {practice.email}
          </span>
        </div>
        <div className="h-px min-w-[2rem] flex-1 bg-aria" />
      </div>

      <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <h2 className="text-4xl font-semibold tracking-tighter text-primary md:text-[56px] md:leading-[1.05]">
            Ready for your interview?
          </h2>
        </div>
        <div className="lg:col-span-5">
          <p className="text-lg leading-relaxed text-secondary-aria">
            {practice.companyName === "General" ? (
              <>
                Upload your resume and/or a job description so {INTERVIEWER_NAME} can ask tailored
                questions about your background and the role. Allow microphone access when prompted.
              </>
            ) : (
              <>
                You are practising for <strong className="font-medium text-primary">{practice.companyName}</strong>.
                Upload your resume and/or a job description so {INTERVIEWER_NAME} can ask tailored
                questions about your background, the role, and real community-reported topics for this
                company. Allow microphone access when prompted.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="rounded-xl border border-aria bg-panel-aria p-5 transition-colors hover:bg-surface-variant/50"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-secondary-aria">
                {step.num}
              </span>
              <step.icon className="h-4 w-4 text-secondary-aria" strokeWidth={1.75} />
            </div>
            <div className="text-sm font-medium tracking-tight text-primary">{step.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <UploadZone
          title="Drop resume here or click to browse"
          hint="PDF or DOCX · optional"
          accept=".pdf,.docx"
          icon={FileUp}
          status={resumeStatus}
          onSelect={onResumeSelect}
        />
        <div className="flex flex-col gap-3 rounded-2xl border border-aria bg-panel-aria p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Job Description</span>
            </div>
            <div className="flex rounded-lg bg-surface border border-aria p-0.5">
              <button
                type="button"
                onClick={() => setJdMode("upload")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                  jdMode === "upload"
                    ? "bg-panel-aria shadow-sm text-primary"
                    : "text-secondary-aria hover:text-primary",
                )}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setJdMode("paste")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                  jdMode === "paste"
                    ? "bg-panel-aria shadow-sm text-primary"
                    : "text-secondary-aria hover:text-primary",
                )}
              >
                Paste Text
              </button>
            </div>
          </div>

          {jdMode === "upload" ? (
            <div className="flex-grow flex flex-col justify-center">
              <UploadZone
                title="Drop job description here or click to browse"
                hint="PDF, DOCX, or TXT · optional"
                accept=".pdf,.docx,.txt"
                icon={Briefcase}
                status={jdStatus}
                onSelect={onJobDescriptionSelect}
              />
            </div>
          ) : (
            <div className="flex-grow flex flex-col gap-2">
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste or type the job description here..."
                rows={4}
                className="w-full flex-grow rounded-xl border border-aria bg-surface p-3 text-sm text-primary placeholder-secondary-aria focus:border-outline focus:outline-none resize-none min-h-[100px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onJobDescriptionTextSubmit(jdText)}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-on-primary hover:bg-black/80 transition-all"
                >
                  Load pasted JD
                </button>
                {jdStatus.text && (
                  <p
                    className={cn(
                      "text-xs font-medium max-w-[200px] truncate",
                      jdStatus.kind === "ok" && "text-emerald-700",
                      jdStatus.kind === "err" && "text-red-600",
                      jdStatus.kind === "" && "text-secondary-aria",
                    )}
                    title={jdStatus.text}
                  >
                    {jdStatus.text}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={isStarting}
        className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-all hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStarting ? "Connecting…" : "Start Interview →"}
      </button>
    </motion.section>
  );
}
