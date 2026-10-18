"use client";

import { useEffect, useId, useState } from "react";

/**
 * Renders Mermaid source as an SVG. Mermaid is loaded only when a diagram is shown, and runs
 * with securityLevel "strict" (no scripts or HTML labels). If the source doesn't parse, the
 * source itself is shown instead, so nothing is lost.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        // The app is light-only, so the diagram is too.
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "inherit" });
        const { svg } = await mermaid.render(id, source);
        if (!cancelled) setSvg(svg);
      } catch {
        // Mermaid leaves an error element behind on a failed render; remove it.
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (failed) {
    return (
      <div>
        <p className="mb-2 text-xs text-muted">This diagram couldn&apos;t be drawn; here&apos;s its outline:</p>
        <pre className="overflow-x-auto rounded-md bg-ink/5 p-3 font-mono text-xs">{source}</pre>
      </div>
    );
  }
  if (!svg) return <div className="h-40 animate-pulse rounded-md bg-ink/5" aria-label="Drawing the diagram" />;
  return <div className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:min-w-[560px] [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
