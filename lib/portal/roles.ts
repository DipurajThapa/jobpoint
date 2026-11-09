// Role families used for company permissions ("permitted roles") and for
// title similarity across synonyms. A family is inferred from the job title
// first, then from the dominant skill families.

export type RoleFamily = { id: string; label: string; title: RegExp; skillFamilies: string[] };

export const ROLE_FAMILIES: RoleFamily[] = [
  { id: "accounts-finance", label: "Accounts and finance", title: /\b(account|accountant|accounting|finance|financial|audit|auditor|tax|gst|payroll|billing|cashier|treasury|credit|ca\b|cma\b)/i, skillFamilies: ["accounting", "accounting-software", "indirect-tax", "direct-tax", "finance", "erp"] },
  { id: "sales-bd", label: "Sales and business development", title: /\b(sales|business development|bde|bdm|relationship|territory|area manager|key account|channel|distributor|dealer|medical rep|field officer|insurance advisor)/i, skillFamilies: ["sales", "crm"] },
  { id: "customer-support", label: "Customer support and BPO", title: /\b(customer|support|service desk|call cent|bpo|telecall|tele caller|voice process|chat process|helpdesk|client servic)/i, skillFamilies: ["customer-service"] },
  { id: "operations-supply", label: "Operations, logistics and supply chain", title: /\b(operation|logistic|supply chain|warehouse|store|inventory|procurement|purchase|dispatch|scm|fleet|exim|export|import)/i, skillFamilies: ["supply-chain", "operations"] },
  { id: "hr-admin", label: "HR and administration", title: /\b(hr|human resource|recruit|talent|payroll executive|admin|administrat|office|receptionist|front office|facility)/i, skillFamilies: ["hr", "hr-ops", "admin"] },
  { id: "software-it", label: "Software and IT", title: /\b(developer|engineer.*(software|web|frontend|backend|full ?stack|data|cloud|devops|qa|test)|software|programmer|full ?stack|front ?end|back ?end|devops|data (analyst|scientist|engineer)|tester|qa\b|it support|system admin|network|desktop support)/i, skillFamilies: ["programming", "frontend", "backend", "database", "cloud", "devops", "devtools", "systems", "it-support", "qa", "mobile", "data-science", "analytics", "security", "web"] },
  { id: "marketing", label: "Marketing and content", title: /\b(marketing|digital|seo|content|social media|brand|copywriter|graphic|designer)/i, skillFamilies: ["marketing", "design"] },
  { id: "manufacturing-engineering", label: "Manufacturing and engineering", title: /\b(production|plant|maintenance|quality|qc|qa engineer|mechanical|electrical|civil|site engineer|shift|fitter|technician|welder|machinist|foreman|safety)/i, skillFamilies: ["manufacturing", "engineering", "engineering-design", "quality"] },
  { id: "healthcare", label: "Healthcare", title: /\b(nurse|nursing|pharma|pharmacist|lab|medical|doctor|clinic|hospital|patient)/i, skillFamilies: ["healthcare"] },
  { id: "education", label: "Education and training", title: /\b(teacher|tutor|faculty|lecturer|professor|trainer|counsel|academic)/i, skillFamilies: ["education"] },
  { id: "hospitality-retail", label: "Hospitality and retail", title: /\b(hotel|hospitality|chef|cook|steward|housekeeping|restaurant|retail|store manager|merchandis|cashier)/i, skillFamilies: ["hospitality", "retail"] },
  { id: "field-services", label: "Field services, delivery and security", title: /\b(driver|delivery|security|guard|courier|rider|field executive)/i, skillFamilies: ["field"] },
];

export const roleFamilyById = (id: string) => ROLE_FAMILIES.find(r => r.id === id);

/** Best role family for a title, falling back to the most common skill family. */
export function roleFamilyFor(title: string, skillFamilies: string[] = []): string {
  const byTitle = ROLE_FAMILIES.find(r => r.title.test(title));
  if (byTitle) return byTitle.id;
  const counts = new Map<string, number>();
  for (const family of skillFamilies) {
    const role = ROLE_FAMILIES.find(r => r.skillFamilies.includes(family));
    if (role) counts.set(role.id, (counts.get(role.id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}
