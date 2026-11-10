// Stand-in for "next/navigation": a redirect is reported as an error the test can read.
export class RedirectError extends Error { constructor(location) { super(`REDIRECT ${location}`); this.location = location; } }
export function redirect(location) { throw new RedirectError(location); }
export function notFound() { throw new Error("NOT_FOUND"); }
