// The two audiences have their own colours: candidate pages blue, company pages green.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const css = read("app/globals.css");
const vars = selector => {
  const body = css.match(new RegExp(`^\\${selector}\\{([^}]*)\\}`, "m"))?.[1];
  assert.ok(body, `${selector} is not defined in app/globals.css`);
  return Object.fromEntries(body.split(";").filter(Boolean).map(d => d.split(":").map(x => x.trim())));
};
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hue = hex => { const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min || 1; const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const luminance = hex => { const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const COLOUR_KEYS = ["--pill-bg", "--pill-ink", "--primary", "--blue", "--blue-dark", "--navy", "--ink", "--accent", "--tint", "--tint-2", "--tint-3", "--tint-line", "--nav-muted"];
const isBlue = h => h >= 200 && h <= 250, isGreen = h => h >= 100 && h <= 165;

test("the candidate theme is blue in every shade", () => {
  const theme = vars(".theme-candidate");
  for (const key of COLOUR_KEYS) assert.ok(isBlue(hue(theme[key])), `${key} ${theme[key]} is not a blue (hue ${hue(theme[key]).toFixed(0)})`);
});

test("the company theme is green in every shade", () => {
  const theme = vars(".theme-company");
  for (const key of COLOUR_KEYS) assert.ok(isGreen(hue(theme[key])), `${key} ${theme[key]} is not a green (hue ${hue(theme[key]).toFixed(0)})`);
});

test("both themes define the same variables, so no component falls back to the other colour", () => {
  assert.deepEqual(Object.keys(vars(".theme-company")).sort(), Object.keys(vars(".theme-candidate")).sort());
});

test("text stays readable in both themes (WCAG AA, 4.5:1)", () => {
  for (const selector of [".theme-candidate", ".theme-company"]) {
    const t = vars(selector);
    assert.ok(contrast("#ffffff", t["--blue"]) >= 4.5, `${selector}: white on buttons is ${contrast("#ffffff", t["--blue"]).toFixed(2)}:1`);
    assert.ok(contrast("#ffffff", t["--navy"]) >= 4.5, `${selector}: white on the top bar`);
    assert.ok(contrast(t["--navy"], "#ffffff") >= 7, `${selector}: body text on white`);
    assert.ok(contrast(t["--blue"], t["--tint"]) >= 4.5, `${selector}: quiet buttons are ${contrast(t["--blue"], t["--tint"]).toFixed(2)}:1`);
    assert.ok(contrast(t["--navy"], t["--tint-2"]) >= 7, `${selector}: notices`);
    assert.ok(contrast(t["--nav-muted"], t["--navy"]) >= 4.5, `${selector}: inactive navigation`);
  }
});

test("the themes are applied to the right pages", () => {
  assert.match(read("app/candidate/layout.tsx"), /className="wp-root theme-candidate"/);
  assert.match(read("app/company/layout.tsx"), /className="wp-root theme-company"/);
  assert.doesNotMatch(read("app/candidate/layout.tsx"), /theme-company/);
  assert.doesNotMatch(read("app/company/layout.tsx"), /theme-candidate/);
  assert.match(read("components/landing-page.tsx"), /employer \? "theme-company" : "theme-candidate"/);
});

test("portal components take their colours from the theme, with no fixed blue left behind", () => {
  const portal = read("app/portal/portal.css");
  const fixed = [...portal.matchAll(/(?<!var\(--[a-z0-9-]+,)#([0-9a-f]{6})\b/gi)].map(m => `#${m[1]}`).filter(hex => { const [r, g, b] = rgb(hex); return Math.max(r, g, b) - Math.min(r, g, b) > 24 && isBlue(hue(hex)) && luminance(hex) < 0.6; });
  assert.deepEqual(fixed, [], "saturated blues that would show on the green company pages");
  for (const name of ["--tint", "--tint-2", "--tint-3", "--tint-line", "--nav-muted"]) assert.ok(portal.includes(`var(${name},`), `${name} is not used`);
});
