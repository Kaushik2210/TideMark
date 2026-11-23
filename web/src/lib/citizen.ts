/**
 * Citizen photo submissions (Supabase over plain fetch, no extra dependency).
 *
 * Nothing here publishes anything: a submission is stored as 'pending' and only a moderator with the
 * service-role key (never in the browser) can approve it. See supabase/migrations and docs/moderation.md.
 */

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const UPLOADS_ENABLED = Boolean(SUPABASE_URL && ANON_KEY);

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_EDGE = 2000; // photos are downscaled to this on the longest edge
export const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export interface Draft {
  file: File | null;
  takenOn: string; // YYYY-MM-DD
  caption: string;
  consent: boolean;
  website: string; // honeypot: real people leave it empty
}

export type Errors = Partial<Record<"file" | "takenOn" | "caption" | "consent", string>>;

/** Pure validation, shared by the form and the tests. `today` is injectable for tests. */
export function validate(d: Draft, today = new Date()): Errors {
  const e: Errors = {};
  if (!d.file) e.file = "Choose a photo.";
  else if (!(TYPES as readonly string[]).includes(d.file.type)) e.file = "Use a JPEG, PNG or WebP image.";
  else if (d.file.size > MAX_BYTES * 4) e.file = "That file is very large. Use a photo under 20 MB.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.takenOn)) e.takenOn = "Enter the date the photo was taken.";
  else {
    const t = new Date(`${d.takenOn}T00:00:00Z`);
    if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d.takenOn) e.takenOn = "That date is not valid.";
    else if (t.getTime() > today.getTime()) e.takenOn = "The date cannot be in the future.";
    else if (t.getUTCFullYear() < 2016) e.takenOn = "Tidemark's record starts in 2016.";
  }
  const c = d.caption.trim();
  if (c.length < 3) e.caption = "Say what the photo shows (at least 3 characters).";
  else if (c.length > 280) e.caption = "Keep the caption to 280 characters.";
  if (!d.consent) e.consent = "Tick the box to agree to publication under CC BY 4.0 if approved.";
  return e;
}

/**
 * Re-encode through a canvas: drops EXIF (including GPS and camera serial) and downsizes, so personal
 * metadata never leaves the browser. Returns a JPEG/PNG/WebP blob under MAX_BYTES or throws.
 */
export async function scrub(file: File): Promise<{ blob: Blob; type: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  for (const q of [0.88, 0.78, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    if (blob && blob.size <= MAX_BYTES) return { blob, type };
    if (type === "image/png" && blob && blob.size > MAX_BYTES) break; // PNG ignores quality
  }
  // PNG too big: fall back to JPEG.
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  if (!blob || blob.size > MAX_BYTES) throw new Error("The photo is still over 5 MB after shrinking.");
  return { blob, type: "image/jpeg" };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, ...extra };
}

export class SubmitError extends Error {}

export async function submit(lakeId: string, d: Draft): Promise<void> {
  if (!UPLOADS_ENABLED) throw new SubmitError("Uploads are not enabled on this site.");
  if (d.website) return; // honeypot filled: pretend success, send nothing
  const { blob, type } = await scrub(d.file as File);
  const id = crypto.randomUUID();
  const path = `pending/${id}.${EXT[type]}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/submissions/${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": type, "x-upsert": "false" }),
    body: blob,
  });
  if (!up.ok) throw new SubmitError(`Upload failed (${up.status}). Please try again later.`);

  const row = await fetch(`${SUPABASE_URL}/rest/v1/photo_submissions`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({
      id, lake_id: lakeId, taken_on: d.takenOn, caption: d.caption.trim(), consent: true, pending_path: path,
    }),
  });
  if (!row.ok) throw new SubmitError(`Could not save the submission (${row.status}).`);
}

export interface ApprovedPhoto {
  id: string;
  taken_on: string;
  caption: string;
  public_path: string;
}

export async function loadApproved(lakeId: string): Promise<ApprovedPhoto[]> {
  if (!UPLOADS_ENABLED) return [];
  const q = `lake_id=eq.${encodeURIComponent(lakeId)}&select=id,taken_on,caption,public_path&order=taken_on.desc&limit=24`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/photo_submissions?${q}`, { headers: headers() });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return (await r.json()) as ApprovedPhoto[];
}

export const publicPhotoUrl = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/public-photos/${p}`;
