import axios from 'axios';
import { GITHUB_BASE_URL, CACHE_TTL_MS } from '../config/appConfig';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let problemListCache: CacheEntry<any> | null = null;
const problemCache = new Map<string, CacheEntry<any>>();

export async function getMergedProblems(): Promise<any> {
  const now = Date.now();
  if (problemListCache && now - problemListCache.timestamp < CACHE_TTL_MS) {
    return problemListCache.data;
  }

  const response = await axios.get(`${GITHUB_BASE_URL}/merged_problems.json`, { timeout: 10000 });
  problemListCache = {
    data: response.data,
    timestamp: now,
  };
  return response.data;
}

export async function getProblemDetail(fileSlug: string): Promise<any> {
  const now = Date.now();
  const cached = problemCache.get(fileSlug);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await axios.get(`${GITHUB_BASE_URL}/problems/${fileSlug}.json`, { timeout: 10000 });
  const data = response.data;

  // Normalize solution format if needed
  if (typeof data.solution === 'object' && data.solution !== null) {
    data.solution = Object.values(data.solution).join('');
  }

  problemCache.set(fileSlug, {
    data,
    timestamp: now,
  });
  return data;
}

export function getCachedMergedProblems(): any {
  return problemListCache ? problemListCache.data : null;
}

export function getCachedProblemDetail(fileSlug: string): any {
  return problemCache.get(fileSlug)?.data || null;
}
