// Small text helpers shared by review checks and ATS scoring: term matching,
// number extraction, word counts, and flattening resume / profile JSON to text.
// Term matching is the same function the browser's ATS score uses.

export { containsTerm } from "../lib/tailor/ats";

export const normalize = (text: string): string => (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Numbers in `text`, normalised ('1,200' → '1200', '40.0' stays '40.0'). */
export function numbersIn(text: string): Set<string> {
  return new Set((text ?? "").match(/\d+(?:[.,]\d+)*/g)?.map((m) => m.replace(/,/g, "")) ?? []);
}

export const wordCount = (text: string): number => (text ?? "").split(/\s+/).filter(Boolean).length;

/** Every string inside a nested object / array. */
export function* flatten(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* flatten(v);
  else if (value && typeof value === "object") for (const v of Object.values(value)) yield* flatten(v);
}
