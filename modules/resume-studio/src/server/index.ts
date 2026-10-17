// Resume Studio's engine (server only): parse resumes, tailor them to a job
// description, chat about edits. Mount `handleRedlineRequest` under any route.
export { handleRedlineRequest } from "./handler";

/** Plain text of a PDF or DOCX resume (column-aware for two-column PDFs). */
export { extractText } from "./extract";
