"use client";

import { useState, useEffect } from "react";
import { CodingRoundScreen } from "@/components/CodingRoundScreen";
import { EvaluatingScreen } from "@/components/EvaluatingScreen";
import { CodeEditorPreview } from "@/components/CodeEditorPreview";
import { Header } from "@/components/Header";
import { InterviewScreen } from "@/components/InterviewScreen";
import { PracticeGateScreen } from "@/components/PracticeGateScreen";
import { ResultsScreen } from "@/components/ResultsScreen";
import { SetupScreen } from "@/components/SetupScreen";
import { ResumeToolScreen } from "@/components/ResumeToolScreen";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { usePracticeSession } from "@/hooks/usePracticeSession";
import { cn } from "@/lib/utils";

export function InterviewApp() {
  const { session: practice, ready } = usePracticeSession();
  const interview = useInterviewSession(practice);
  const [appMode, setAppMode] = useState<"interview" | "resume_tool">("interview");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "resume_tool") {
        setAppMode("resume_tool");
      }
    }
  }, []);

  const handleResumeToolFinish = (adaptedContext: string, adaptedData: any) => {
    interview.loadTailoredResume(adaptedContext, adaptedData);
    setAppMode("interview");
    interview.setShowMatchWarning(false);
  };

  return (
    <main className="flex min-h-screen flex-col overflow-x-hidden text-base">
      <Header practice={practice} />
      <div className="flex-grow pb-16 pt-[120px]">
        <div className="mx-auto max-w-[1280px] space-y-10 px-8">
          {!ready && (
            <div className="rounded-3xl border border-auralis bg-card-auralis p-10 text-center text-secondary-auralis">
              Loading your practice session…
            </div>
          )}
          
          {ready && !practice && <PracticeGateScreen />}

          {ready && practice && interview.screen === "setup" && (
            <div className="flex justify-center mb-4">
              <div className="flex rounded-full bg-panel-auralis border border-auralis p-1">
                <button
                  type="button"
                  onClick={() => setAppMode("interview")}
                  className={cn(
                    "rounded-full px-6 py-2 text-xs md:text-sm font-semibold transition-all",
                    appMode === "interview"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-secondary-auralis hover:text-primary"
                  )}
                >
                  🎙️ Start Interview
                </button>
                <button
                  type="button"
                  onClick={() => setAppMode("resume_tool")}
                  className={cn(
                    "rounded-full px-6 py-2 text-xs md:text-sm font-semibold transition-all",
                    appMode === "resume_tool"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-secondary-auralis hover:text-primary"
                  )}
                >
                  📄 Resume Matcher & Builder
                </button>
              </div>
            </div>
          )}

          {ready && practice && interview.screen === "setup" && appMode === "resume_tool" && (
            <ResumeToolScreen onBackToInterview={handleResumeToolFinish} />
          )}

          {ready && practice && interview.screen === "setup" && appMode === "interview" && (
            <>
              <SetupScreen
                practice={practice}
                resumeStatus={interview.resumeStatus}
                jdStatus={interview.jdStatus}
                isStarting={interview.isStarting}
                onResumeSelect={interview.handleResumeUpload}
                onJobDescriptionSelect={interview.handleJobDescriptionUpload}
                onJobDescriptionTextSubmit={interview.handleJobDescriptionText}
                onStart={interview.startInterview}
                
                matchReport={interview.matchReport}
                showMatchWarning={interview.showMatchWarning}
                onCancelWarning={() => interview.setShowMatchWarning(false)}
                onForceStart={() => interview.startInterview(true)}
                isAdapting={interview.isAdaptingResume}
                onAdapt={interview.adaptResume}
                onDownloadPdf={interview.downloadAdaptedResumePdf}
                adaptedResumeData={interview.adaptedResumeData}
              />
              {!interview.showMatchWarning && <CodeEditorPreview />}
            </>
          )}

          {ready && practice && interview.screen === "interview" && (
            <InterviewScreen
              statusText={interview.statusText}
              statusColor={interview.statusColor}
              timer={interview.timer}
              transcript={interview.transcript}
              isEnding={interview.isEnding}
              onStartCoding={interview.beginCodingRound}
              onSkipCoding={interview.skipToEvaluation}
            />
          )}

          {ready &&
            practice &&
            interview.screen === "coding" &&
            interview.codingProblem &&
            interview.codingStartedAt > 0 && (
              <CodingRoundScreen
                problem={interview.codingProblem}
                timeLimitSec={interview.codingTimeLimitSec}
                startedAt={interview.codingStartedAt}
                isSubmitting={interview.isSubmittingCoding}
                onSubmit={interview.submitCodingRound}
              />
            )}

          {ready && practice && interview.screen === "evaluating" && <EvaluatingScreen />}

          {ready && practice && interview.screen === "results" && (
            <ResultsScreen report={interview.scorecard} onRestart={interview.restart} />
          )}
        </div>
      </div>
    </main>
  );
}

