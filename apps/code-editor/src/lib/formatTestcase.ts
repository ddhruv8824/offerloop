import type { BroCodeExample } from "../app/codingProblems";

/** Strip embedded example/constraint placeholders from repo description blobs. */
export function cleanProblemDescription(description: string): string {
  let text = description.trim();
  const cutPoints = ["Example 1:", "Example 1", "Constraints:", "Follow-up:"];
  for (const marker of cutPoints) {
    const idx = text.indexOf(marker);
    if (idx > 0) {
      text = text.slice(0, idx).trim();
      break;
    }
  }
  return text;
}

export function formatFunctionArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
    .join("\n");
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function parseExampleText(text: string): {
  input?: string;
  output?: string;
  explanation?: string;
} {
  const lines = text.split("\n");
  const result: { input?: string; output?: string; explanation?: string } = {};
  for (const line of lines) {
    if (line.startsWith("Input:")) result.input = line.replace(/^Input:\s*/, "").trim();
    else if (line.startsWith("Output:")) result.output = line.replace(/^Output:\s*/, "").trim();
    else if (line.startsWith("Explanation:"))
      result.explanation = line.replace(/^Explanation:\s*/, "").trim();
  }
  return result;
}

export function formatExampleBlock(ex: BroCodeExample): string {
  const parsed = parseExampleText(ex.example_text);
  const parts: string[] = [];
  if (parsed.input) parts.push(`Input: ${parsed.input}`);
  if (parsed.output) parts.push(`Output: ${parsed.output}`);
  if (parsed.explanation) parts.push(`Explanation: ${parsed.explanation}`);
  return parts.length > 0 ? parts.join("\n") : ex.example_text;
}

export function exampleBorderClass(index: number): string {
  if (index === 0) return "border-l-4 border-stride-accent";
  if (index === 1) return "border-l-4 border-red-500/50";
  return "border-l-4 border-stride-border";
}

export function difficultyBadgeClass(d: string): string {
  if (d === "Easy") return "text-stride-accent bg-stride-accent/10";
  if (d === "Medium") return "text-yellow-500 bg-yellow-500/10";
  return "text-red-500 bg-red-500/10";
}

/** Split description into paragraphs for stride-style layout */
export function descriptionParagraphs(description: string): string[] {
  return cleanProblemDescription(description)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}
