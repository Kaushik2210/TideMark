"use client";

import { useEffect, useId, useState } from "react";
import {
  UPLOADS_ENABLED, SubmitError, TYPES, loadApproved, publicPhotoUrl, submit, validate,
  type ApprovedPhoto, type Draft, type Errors,
} from "@/lib/citizen";

const EMPTY: Draft = { file: null, takenOn: "", caption: "", consent: false, website: "" };

export function CitizenPhotos({ lakeId, lakeName }: { lakeId: string; lakeName: string }) {
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<ApprovedPhoto[] | "loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadApproved(lakeId)
      .then((p) => !cancelled && setPhotos(p))
      .catch(() => !cancelled && setPhotos("error"));
    return () => { cancelled = true; };
  }, [lakeId]);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const errs = validate(draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`${uid}-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setState("sending");
    try {
      await submit(lakeId, draft);
      setState("done");
      setDraft(EMPTY);
    } catch (e) {
      setState("failed");
      setMessage(e instanceof SubmitError ? e.message : "Something went wrong processing the photo. Try a different image.");
    }
  }

  const field = "w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-fg";
  const err = (k: keyof Errors) =>
    errors[k] ? <p id={`${uid}-${k}-err`} role="alert" className="mt-1 text-sm text-danger">{errors[k]}</p> : null;
  const aria = (k: keyof Errors) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${uid}-${k}-err` : undefined });

  return (
    <section aria-labelledby="citizen-h" className="space-y-5">
      <h2 id="citizen-h" className="font-serif text-2xl font-semibold">Citizen photos</h2>
      <p className="max-w-3xl text-sm text-muted">
        Photos from people who visit {lakeName} give context the satellites cannot. Every photo is reviewed by a
        person before it appears; nothing is published automatically. Location data in the image is removed in
        your browser before upload.
      </p>

      {photos === "loading" ? (
        <p className="text-sm text-muted" role="status">Loading approved photos…</p>
      ) : photos === "error" ? (
        <p className="text-sm text-muted" role="status">Approved photos could not be loaded right now.</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted">No approved photos for this lake yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-md border border-border bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicPhotoUrl(p.public_path)} alt={p.caption} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              <p className="p-2 text-sm"><span className="num text-muted">{p.taken_on}</span> · {p.caption}</p>
            </li>
          ))}
        </ul>
      )}

      {!UPLOADS_ENABLED ? (
        <p className="max-w-3xl rounded-md border border-border bg-surface p-3 text-sm text-muted" data-testid="uploads-disabled">
          Photo uploads are not switched on for this deployment (no Supabase project is configured). The code and
          database rules are in the repository.
        </p>
      ) : state === "done" ? (
        <p role="status" className="max-w-3xl rounded-md border border-border bg-surface p-3 text-sm" data-testid="upload-done">
          Thank you. Your photo was received and is waiting for review. It will not appear on the site unless a
          moderator approves it.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="max-w-xl space-y-4" aria-label={`Submit a photo of ${lakeName}`}>
          <div>
            <label htmlFor={`${uid}-file`} className="mb-1 block text-sm font-medium">Photo (JPEG, PNG or WebP)</label>
            <input id={`${uid}-file`} type="file" accept={TYPES.join(",")} className={`${field} tap`} {...aria("file")}
              onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })} />
            {err("file")}
          </div>
          <div>
            <label htmlFor={`${uid}-takenOn`} className="mb-1 block text-sm font-medium">Date taken</label>
            <input id={`${uid}-takenOn`} type="date" min="2016-01-01" className={`${field} tap`} value={draft.takenOn} {...aria("takenOn")}
              onChange={(e) => setDraft({ ...draft, takenOn: e.target.value })} />
            {err("takenOn")}
          </div>
          <div>
            <label htmlFor={`${uid}-caption`} className="mb-1 block text-sm font-medium">What does it show?</label>
            <textarea id={`${uid}-caption`} rows={3} maxLength={280} className={field} value={draft.caption} {...aria("caption")}
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
            <p className="mt-1 text-sm text-muted">{draft.caption.length}/280. Please do not include names or faces.</p>
            {err("caption")}
          </div>
          {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Website<input tabIndex={-1} autoComplete="off" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></label>
          </div>
          <div>
            <label className="tap flex items-start gap-3 text-sm">
              <input id={`${uid}-consent`} type="checkbox" className="mt-1 h-5 w-5" checked={draft.consent} {...aria("consent")}
                onChange={(e) => setDraft({ ...draft, consent: e.target.checked })} />
              <span>If approved, publish this photo on Tidemark under the CC BY 4.0 licence, credited to &ldquo;a Tidemark contributor&rdquo;.</span>
            </label>
            {err("consent")}
          </div>
          <button type="submit" disabled={state === "sending"} className="tap rounded-md bg-accent px-5 font-medium text-bg disabled:opacity-60">
            {state === "sending" ? "Sending…" : "Send for review"}
          </button>
          {state === "failed" ? <p role="alert" className="text-sm text-danger">{message}</p> : null}
        </form>
      )}
    </section>
  );
}
