import type { LeadWithScore } from "@/lib/tauri/types";

/**
 * Trigger a client-side file download from an in-memory string. Works inside the
 * Tauri webview without requiring the fs/dialog plugins by using an object URL
 * and a synthetic anchor click.
 */
export function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Escape a single value for RFC 4180 CSV output. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const LEAD_COLUMNS: { header: string; get: (lead: LeadWithScore) => unknown }[] = [
  { header: "id", get: (l) => l.id },
  { header: "company_name", get: (l) => l.companyName },
  { header: "website", get: (l) => l.website },
  { header: "industry", get: (l) => l.industry },
  { header: "sub_industry", get: (l) => l.subIndustry },
  { header: "employees", get: (l) => l.employees },
  { header: "employee_range", get: (l) => l.employeeRange },
  { header: "revenue", get: (l) => l.revenue },
  { header: "revenue_range", get: (l) => l.revenueRange },
  { header: "company_linkedin_url", get: (l) => l.companyLinkedinUrl },
  { header: "city", get: (l) => l.city },
  { header: "state", get: (l) => l.state },
  { header: "country", get: (l) => l.country },
  { header: "research_status", get: (l) => l.researchStatus },
  { header: "user_status", get: (l) => l.userStatus },
  { header: "tier", get: (l) => l.score?.tier ?? "" },
  { header: "score", get: (l) => l.score?.totalScore ?? "" },
];

/** Render leads as an RFC 4180 CSV string. */
export function leadsToCsv(leads: LeadWithScore[]): string {
  const header = LEAD_COLUMNS.map((c) => c.header).join(",");
  const rows = leads.map((lead) => LEAD_COLUMNS.map((c) => csvCell(c.get(lead))).join(","));
  return [header, ...rows].join("\r\n");
}

/** Render leads (including full score breakdown and profile) as pretty JSON. */
export function leadsToJson(leads: LeadWithScore[]): string {
  return JSON.stringify(leads, null, 2);
}

function timestampSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Download the given leads as a CSV file. */
export function downloadLeadsCsv(leads: LeadWithScore[]): void {
  triggerDownload(`leads-${timestampSuffix()}.csv`, leadsToCsv(leads), "text/csv");
}

/** Download the given leads as a JSON file. */
export function downloadLeadsJson(leads: LeadWithScore[]): void {
  triggerDownload(`leads-${timestampSuffix()}.json`, leadsToJson(leads), "application/json");
}
