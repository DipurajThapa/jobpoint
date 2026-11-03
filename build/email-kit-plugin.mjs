// Assembles Email Kit from tools/email-kit/src at build time (this replaces the
// upstream Usha scripts/build.py for the Working Platform edition).
//   virtual:email-kit/page    the single HTML page, served only by the
//                             authenticated /platform/email-kit route
//   virtual:email-kit/engine  engine.js as a module, so the server can apply
//                             the same row checks the app uses for restores
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE = "virtual:email-kit/page";
const ENGINE = "virtual:email-kit/engine";
const SCRIPTS = {
  "/*__CONFIG__*/": "config.js",
  "/*__LIBRARY__*/": "library.js",
  "/*__RULES__*/": "rules.js",
  "/*__ENGINE__*/": "engine.js",
  "/*__STORE__*/": "server-store.js",
  "/*__RECORDS__*/": "records.js",
  "/*__BACKUP__*/": "backup.js",
  "/*__UI__*/": "ui.js",
};

export function emailKit({ root }) {
  const dir = resolve(root, "tools/email-kit");
  const read = file => readFileSync(resolve(dir, file), "utf8");
  const sources = ["src/index.html", "src/styles.css", "src/logo.svg", "src/mark.svg", "src/pwa.js", "VERSION", "CHANGELOG.md", ...Object.values(SCRIPTS).map(f => `src/${f}`)];

  function notes() {
    const section = read("CHANGELOG.md").split(/^## /m)[1] ?? "";
    return section.split("\n").filter(l => l.startsWith("- ")).slice(0, 3)
      .map(l => l.slice(2).trim()).map(l => (l.endsWith(".") ? l : `${l}.`)).join(" ");
  }

  function page() {
    let html = read("src/index.html");
    const replace = (key, value) => {
      if (!html.includes(key)) throw new Error(`Email Kit build: placeholder ${key} is missing from index.html`);
      html = html.split(key).join(value);
    };
    // Replacement values are inserted literally (functions avoid `$` patterns).
    replace("/*__CSS__*/", read("src/styles.css"));
    replace("<!--__LOGO__-->", read("src/logo.svg").trim());
    replace("__FAVICON__", `data:image/svg+xml;base64,${Buffer.from(read("src/mark.svg")).toString("base64")}`);
    for (const [key, file] of Object.entries(SCRIPTS)) replace(key, read(`src/${file}`));
    const pwa = read("src/pwa.js")
      .replace("__VERSION__", () => read("VERSION").trim())
      .replace("__NOTES__", () => JSON.stringify(notes()))
      .replace("__STANDALONE__", "true"); // page mode: no service worker or install prompt
    replace("/*__PWA__*/", pwa);
    if (!html.includes("<!--__PLATFORM_BAR__-->")) throw new Error("Email Kit build: platform bar placeholder missing");
    if (/<\/script/i.test(Object.values(SCRIPTS).map(f => read(`src/${f}`)).join("") + pwa)) throw new Error("Email Kit build: a script contains </script");
    return html;
  }

  return {
    name: "email-kit",
    resolveId(id) {
      if (id === PAGE || id === ENGINE) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${PAGE}`) {
        for (const f of sources) this.addWatchFile(resolve(dir, f));
        return `export default ${JSON.stringify(page())};`;
      }
      if (id === `\0${ENGINE}`) {
        this.addWatchFile(resolve(dir, "src/engine.js"));
        // Only data checks are used on the server; CONFIG and Rules are never touched by them.
        return `const CONFIG = {}; const Rules = {};\n${read("src/engine.js")}\nexport { Engine };\n`;
      }
    },
  };
}
