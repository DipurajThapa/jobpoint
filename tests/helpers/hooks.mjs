// Module hooks for the test run: the app's "@/..." paths, extensionless
// TypeScript imports, and small stand-ins for the Cloudflare and Next runtime
// modules, so the real route handlers and domain code run under plain Node.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";

const root = pathResolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stub = name => pathToFileURL(pathResolve(root, "tests/helpers/stubs", name)).href;
const STUBS = { "virtual:email-kit/engine": stub("email-kit-engine.mjs"), "cloudflare:workers": stub("cloudflare-workers.mjs"), "next/headers": stub("next-headers.mjs"), "next/navigation": stub("next-navigation.mjs") };

function withExtension(path) {
  if (existsSync(path) && statSync(path).isFile()) return path;
  for (const candidate of [`${path}.ts`, `${path}.mts`, `${path}.mjs`, `${path}/index.ts`]) if (existsSync(candidate)) return candidate;
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const found = withExtension(pathResolve(root, specifier.slice(2)));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith("file:")) {
    const found = withExtension(pathResolve(dirname(fileURLToPath(context.parentURL)), specifier));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  return next(specifier, context);
}
