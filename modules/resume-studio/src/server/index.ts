// Resume Studio's engine (server only): parse resumes, tailor them to a job
// description, chat about edits. Mount `handleRedlineRequest` under any route.
export { handleRedlineRequest } from "./handler";

/** Plain text of a PDF or DOCX resume (column-aware for two-column PDFs). */
export { extractText } from "./extract";

/** AI study notes for a tool the candidate is learning (Offerloop's Learn page). */
export { writeStudyNotes, type StudyNotesOutput } from "./study-notes";
/** Resolve the AI provider/model/key from a request's X-LLM-* headers (or a server key). */
export { resolveConfig, LlmConfigError, type LlmConfig } from "./models";
/** Copy one workspace into another (moving a browser's workspace into its owner's account). */
export { copyWorkspace } from "./store";
/** Tailor the saved resume to a job without the browser (automations), and read the result. */
export { tailorForJob, readTailoredVersion, NoResumeError, type JobToTailor, type AutoTailorResult } from "./auto-tailor";
/** Whether an AI key works (lists the models it can use). */
export { listModels, PROVIDERS, type ProviderId } from "./models";
