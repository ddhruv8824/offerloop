// Its own variable, not the generic PORT: in the monorepo every service is started from one
// process whose PORT is the platform's (3100), and both would end up on the same port.
export const PORT = parseInt(process.env.CODE_RUNNER_PORT || '8001', 10);
export const CODE_EXECUTOR = (process.env.CODE_EXECUTOR || 'local').toLowerCase();
export const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
export const LOCAL_TIMEOUT_SEC = parseInt(process.env.CODE_RUN_TIMEOUT_SEC || '10', 10);

export const LANGUAGE_IDS: Record<string, number> = {
  python: 71,
  javascript: 63,
};

export const LOCAL_LANGUAGES = ['javascript', 'python'];
export const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/ddhruv8824/LeetCode-Problems/main';
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache TTL
