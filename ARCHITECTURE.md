# SaySmile Notes — architecture (v1)

Original app (not a copy of Notability). Goal: dentists keep treatment notes by hand on iPad (Apple Pencil),
view/edit them on iPhone, share with colleagues, see who wrote what.

## Stack (one line each)
- **Frontend:** plain ES modules + one `index.html`, no build step → deploys as-is to GitHub Pages. Installable PWA (service worker, offline shell).
- **Ink:** `<canvas>` + Pointer Events (pen pressure, `pointerType==='pen'` draws, fingers scroll/pinch, optional finger-draw).
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime). Row Level Security does all authorization; the client holds only the public anon key.
- **Vendored libs** (`vendor/`, no CDN at runtime — safer on restricted networks): supabase-js, html2canvas, jsPDF.
- **Local demo mode:** if `config.js` has no Supabase keys, the same app runs on IndexedDB with two demo users (so you can try roles/author-colors with fake data).

## Data model
```
profiles(id, email, display_name, color)
items(id, parent_id, kind folder|note, title, owner_id, trashed_at)       tree
item_members(item_id, user_id, role viewer|editor|admin)                    inherited down the tree
invites(item_id, email, role)                                               pending until the person signs up
pages(id, note_id, position, template_id, template_html, fields jsonb)
objects(id, page_id, note_id, kind stroke|image|text, data jsonb,
        author_id, author_name, created_at, deleted_at, deleted_by, replaces)   APPEND-ONLY
templates(id, owner_id, title, html)                                        personal custom-HTML library
storage bucket note-images/<note_id>/<uuid>.jpg                             private, follows note permissions
```
**Why append-only objects:** no merge conflicts (two doctors never overwrite each other), per-author attribution is free
(`author_id` is stamped by a trigger — the client cannot forge it), "who erased what" is kept, and the history view
needs no snapshots. Moving an image = insert new object with `replaces` + soft-delete the old one.

## Roles
| role | see | write/erase | manage members | delete page/note |
|---|---|---|---|---|
| viewer | ✔ | ✘ | ✘ | ✘ |
| editor | ✔ | ✔ | ✘ | ✘ |
| admin  | ✔ | ✔ | ✔ (invite by e-mail) | ✔ |

## Stroke size (free tier = 500 MB DB)
Strokes are simplified (Ramer–Douglas–Peucker) and stored as delta-encoded integers → ~0.5–1 KB per stroke,
~100–300 KB per fully handwritten page → several thousand pages on the free plan. Photos go to Storage (downscaled to ≤1600 px JPEG).

## Writes
Optimistic: stroke is drawn immediately, queued in an IndexedDB outbox with a client-generated UUID, flushed to Supabase,
retried until it succeeds (UUID makes retries idempotent). Realtime channel on `objects`/`pages` shows colleagues' edits live.

## Risky parts
1. **Reaching `supabase.co` from Russia** — must be tested from the clinic network (fallback: self-host Supabase on a Russian VPS; the code does not change).
2. **Patient data / 152-FZ** — keep demo data fake until storage location is cleared with the clinic/lawyer.
3. **iPad Safari pointer quirks** (Pencil vs finger, palm) — needs a test on the real iPad.
