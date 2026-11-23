import { REPO } from "./data";

/** Public origin of the deployed site (GitHub Pages). The deploy workflow sets NEXT_PUBLIC_BASE_PATH=/TideMark. */
export const SITE_ORIGIN = "https://kaushik2210.github.io";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}`;
export const siteUrl = (path: string) => `${SITE_URL}${path}`;

/** Link that opens a prefilled GitHub issue form (no account on our side, no server needed). */
export function issueUrl(template: string, title = ""): string {
  const q = new URLSearchParams({ template });
  if (title) q.set("title", title);
  return `${REPO}/issues/new?${q.toString()}`;
}
