// Stand-in for the build-time "virtual:email-kit/engine" module. The access
// tests only need the Email Kit routes to load; the engine's own rules are
// covered by scripts/check-platform.mjs against the built app.
export const Engine = { TABLES: [], validRow: () => true };
