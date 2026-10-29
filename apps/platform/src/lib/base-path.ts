// Where the app lives on its site: "" at the root (https://offerloop.example.com), or a path
// like "/offerloop" when it shares a domain with something else (https://example.com/offerloop).
// Set by BASE_PATH at build time (next.config.ts). Next adds it to <Link>, router and redirect()
// by itself; anything that builds a URL by hand (fetch, <form action>, <a href>) uses withBase.

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** "/api/x" → "/offerloop/api/x". Leaves full URLs and "#anchors" alone. */
export const withBase = (path: string) => (path.startsWith("/") && !path.startsWith("//") ? `${BASE_PATH}${path}` : path);
