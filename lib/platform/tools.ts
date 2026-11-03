// Registry of Working Platform tools. The dashboard, the admin permission
// editor and the server permission checks all read this list, so adding a tool
// means adding one entry here plus the tool's own route.
export type AccessLevel = "view" | "edit" | "manage";
export const ACCESS_LEVELS: AccessLevel[] = ["view", "edit", "manage"];

export type PlatformTool = {
  key: string;
  name: string;
  description: string;
  href: string;
  icon: string; // Material Symbols Rounded name
  levels: Record<AccessLevel, string>;
};

export const TOOLS: PlatformTool[] = [
  {
    key: "email-kit",
    name: "Email Kit",
    description: "Prepare employer outreach and follow-ups, keep client conversation history, and respect Do not contact restrictions.",
    href: "/platform/email-kit",
    icon: "forward_to_inbox",
    levels: {
      view: "Read records and drafts. Cannot change anything.",
      edit: "Daily outreach: draft, record sends and replies, manage contacts.",
      manage: "Also follow-up rules, backup restore and bulk deletion.",
    },
  },
];

export const toolByKey = (key: string) => TOOLS.find(t => t.key === key);

export function levelAtLeast(level: AccessLevel | undefined | null, min: AccessLevel): boolean {
  if (!level) return false;
  return ACCESS_LEVELS.indexOf(level) >= ACCESS_LEVELS.indexOf(min);
}

export const isAccessLevel = (value: unknown): value is AccessLevel =>
  typeof value === "string" && (ACCESS_LEVELS as string[]).includes(value);

export const LEVEL_LABEL: Record<AccessLevel, string> = { view: "View", edit: "Edit", manage: "Manage" };
