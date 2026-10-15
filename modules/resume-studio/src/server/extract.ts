// Plain-text extraction from resume files (PDF via pdf.js, DOCX via mammoth).
// Used for providers that can't read PDFs natively.
//
// Multi-column PDFs are the hard case: their text layer interleaves the columns line by
// line ("Jenkins   Unison 2024-2025"), which scrambles jobs and skills together. So each
// PDF page is first laid out as fixed-width text (every run of text at the character
// column matching its position on the page), and when a column boundary is found, each
// band of the page is read column by column (left column first, then right).

const MIN_TWO_COLUMN_LINES = 6; // need this many split lines before trusting a boundary
const GUTTER = 2; // spaces that must separate the columns at the boundary
const LINE_TOLERANCE = 3; // points: text runs this close vertically share a line

/** Character position where a right-hand column starts, if the page has two columns. */
export function columnBoundary(lines: string[]): number | null {
  const width = Math.max(0, ...lines.map((l) => l.length));
  if (width < 40) return null;
  let best: number | null = null;
  let bestScore = 0;
  for (let c = Math.floor(width * 0.15); c < Math.floor(width * 0.7); c++) {
    let split = 0;
    let crossing = 0;
    for (const line of lines) {
      if (line.length <= c) continue;
      const gutterEmpty = line.slice(Math.max(0, c - GUTTER), c).trim() === "";
      if (gutterEmpty && line[c] !== " ") split += 1; // something starts exactly at the boundary
      else if (line[c - 1] !== " " && line[c] !== " ") crossing += 1; // a word runs across it
    }
    const score = split - 2 * crossing;
    if (split >= MIN_TWO_COLUMN_LINES && score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** Read a laid-out page column by column instead of line by line. */
export function reflowColumns(text: string): string {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const c = columnBoundary(lines.filter((l) => l.trim()));
  if (c === null) return lines.map((l) => l.trim()).filter(Boolean).join("\n");

  const out: string[] = [];
  let left: Array<[number, string]> = []; // [line number, text]
  let right: Array<[number, string]> = [];

  const flush = (carryHeading = false) => {
    // Left-only lines after the right column's last line are headings for the
    // full-width text that follows (e.g. "PROJECTS" above a wide description),
    // so they go after the right column, not before it.
    const lastRight = right.length ? right[right.length - 1][0] : -1;
    const isCarried = (n: number) => carryHeading && n > lastRight;
    out.push(...left.filter(([n]) => !isCarried(n)).map(([, t]) => t));
    out.push(...right.map(([, t]) => t));
    out.push(...left.filter(([n]) => isCarried(n)).map(([, t]) => t));
    left = [];
    right = [];
  };

  lines.forEach((line, n) => {
    if (!line.trim()) return;
    // Two-column lines leave the gutter before the boundary empty; text in it means
    // one line runs across (even when a space between words lands on the boundary).
    const crosses = line.slice(c).trim() !== "" && line.slice(c - GUTTER, c).trim() !== "";
    if (crosses) {
      // full-width text (headline, summary, a wide section)
      flush(true);
      out.push(line.trim());
      return;
    }
    if (line.slice(0, c).trim()) left.push([n, line.slice(0, c).trim()]);
    if (line.slice(c).trim()) right.push([n, line.slice(c).trim()]);
  });
  flush();
  return out.join("\n");
}

interface Run {
  text: string;
  x: number;
  y: number;
  width: number;
}

/** Text runs → fixed-width lines, each run starting at the column of its x position. */
export function layoutRuns(runs: Run[]): string {
  // Points per character column: the typical glyph width on this page, so text of one
  // column lines up the way it does on paper.
  const widths = runs.filter((r) => r.text.length >= 3 && r.width > 0).map((r) => r.width / r.text.length).sort((a, b) => a - b);
  const density = widths.length ? widths[Math.floor(widths.length / 2)] : 7.25;

  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x); // top to bottom (PDF y grows upwards)
  const lines: Run[][] = [];
  for (const run of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - run.y) <= LINE_TOLERANCE) line.push(run);
    else lines.push([run]);
  }
  return lines
    .map((line) => {
      let out = "";
      for (const run of line.sort((a, b) => a.x - b.x)) {
        const col = Math.round(run.x / density);
        if (out.length < col) out = out.padEnd(col);
        else if (out && !out.endsWith(" ") && !run.text.startsWith(" ")) out += " ";
        out += run.text;
      }
      return out.trimEnd();
    })
    .join("\n");
}

export async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  // pdf.js takes ownership of the buffer it's given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const runs: Run[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        runs.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      const text = layoutRuns(runs);
      if (text.trim()) pages.push(reflowColumns(text));
    }
    return pages.join("\n\n");
  } finally {
    await pdf.cleanup();
  }
}

export async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export function extractText(bytes: Uint8Array, ext: string): Promise<string> {
  if (ext === ".pdf") return extractTextFromPdf(bytes);
  if (ext === ".docx") return extractTextFromDocx(bytes);
  throw new Error(`Unsupported file type: ${ext}. Use PDF or DOCX.`);
}
