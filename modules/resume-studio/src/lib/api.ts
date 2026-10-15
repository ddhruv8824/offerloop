// The host app sets the Redline API address once (see `ResumeStudio`'s `apiUrl`),
// so this module works under Vite, Next.js or anything else.
let API_URL = "http://127.0.0.1:8100";

export function setApiUrl(url: string): void {
  API_URL = url;
}

export function getApiUrl(path: string): string {
  return `${API_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
