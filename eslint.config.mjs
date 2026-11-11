import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // next/link breaks in production builds of vinext 1.0.0-beta.5 (clicks are swallowed). Use the plain link.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [{ name: "next/link", message: "Use @/components/app-link: next/link does not navigate in production builds." }] }] },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["tools/email-kit/src/**/*.js"],
    rules: {
      // Email Kit is a plain browser script (no React). Function names such as
      // useFormerLink are not hooks; unused catch bindings are its house style.
      "react-hooks/rules-of-hooks": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
