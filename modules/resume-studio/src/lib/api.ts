// The host app sets the API address once (see `ResumeStudio`'s `apiUrl`) — wherever it
// mounted the engine from `@offerloop/resume-studio/server`.
let API_URL = "/api/redline";

export function setApiUrl(url: string): void {
  API_URL = url;
}

export function getApiUrl(path: string): string {
  return `${API_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
