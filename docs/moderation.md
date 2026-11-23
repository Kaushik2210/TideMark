# Citizen photos: setup and moderation

Photos are **never published automatically**. The database rules in
[`supabase/migrations/0001_citizen_photos.sql`](../supabase/migrations/0001_citizen_photos.sql) enforce this, not just the website.

## Setup (one time)
1. Create a Supabase project. Run the migration in the SQL editor.
2. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `web/.env.local` (the anon key is meant to be public; the rules above limit what it can do). The service-role key stays out of the web app and out of git.
3. Without these variables the lake pages show that uploads are switched off.

## What the public can and cannot do
- Insert one `pending` row and one file in the private `submissions` bucket (JPEG/PNG/WebP, 5 MB).
- Read only `approved` rows (id, date, caption, public path). Cannot read pending files, edit, or delete.

## Reviewing (in the Supabase dashboard, or with the service-role key)
1. Open Storage > `submissions` > `pending/<id>.<ext>` and look at the photo. Reject anything with faces, number plates, private property, personal data, or content that is not the lake.
2. Approve: copy the file to the `public-photos` bucket (same name without `pending/`), then
   ```sql
   update photo_submissions
   set status = 'approved', public_path = '<id>.<ext>', reviewed_at = now()
   where id = '<id>';
   ```
3. Reject: `update photo_submissions set status = 'rejected', moderator_note = '<why>', reviewed_at = now() where id = '<id>';` and delete the pending file.

## Privacy
EXIF (including GPS) is removed in the browser by re-encoding before upload. Captions are shown as typed, so review them too. Submitters agree to CC BY 4.0 publication; no name or email is collected.

## Not covered
Rate limiting beyond Supabase's defaults (a honeypot field only stops simple bots), automated image screening, and a takedown form. Add them before promoting uploads widely.
