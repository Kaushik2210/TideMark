import { formatMonth } from "@/lib/data";
import { buildDigests } from "@/lib/digest";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Atom feed of the monthly digests. Dates are derived from the data month, never from build time. */
export function GET() {
  const digests = buildDigests(12);
  const stamp = (month: string) => `${month}-28T00:00:00Z`;
  const entries = digests
    .map((d) => {
      const html = d.lakes.map((l) => `<h3>${esc(l.name)}</h3><ul>${l.lines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("");
      return `  <entry>
    <id>tag:tidemark,2026:digest-${d.month}</id>
    <title>${esc(`${formatMonth(d.month)}: lake update`)}</title>
    <updated>${stamp(d.month)}</updated>
    <link rel="alternate" href="${SITE_URL}/updates/#m-${d.month}"/>
    <summary>${esc(d.headline)}</summary>
    <content type="html">${esc(`${html}<p>Research estimate from Sentinel satellite data, not an official assessment.</p>`)}</content>
  </entry>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:tidemark,2026:feed</id>
  <title>Tidemark: monthly lake updates</title>
  <subtitle>Open water in Bengaluru's lakes from Sentinel satellite data. Research estimates, not official.</subtitle>
  <updated>${stamp(digests[0].month)}</updated>
  <link rel="self" href="${SITE_URL}/feed.xml"/>
  <link rel="alternate" href="${SITE_URL}/updates/"/>
  <author><name>Tidemark</name></author>
${entries}
</feed>
`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
