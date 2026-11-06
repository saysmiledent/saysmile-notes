-- SaySmile Notes — Supabase schema (run once in SQL Editor).
-- Model: folders/notes tree (items) + membership with 3 roles (viewer < editor < admin, inherited down the tree),
-- pages per note, and an APPEND-ONLY objects table (strokes / images / text) where the server stamps the author.
-- Concurrent edits never conflict: every stroke is its own row; erase = soft delete (who/when is kept).

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.role_rank(r text) returns int
language sql immutable set search_path = public as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 else 0 end
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  color text not null default '#6f7140',
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.items(id) on delete cascade,
  kind text not null check (kind in ('folder','note')),
  title text not null default '' check (char_length(title) <= 200),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_parent_idx on public.items (parent_id);
create index if not exists items_owner_idx on public.items (owner_id);

create table if not exists public.item_members (
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('viewer','editor','admin')),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists item_members_user_idx on public.item_members (user_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','editor','admin')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_id, email)
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.items(id) on delete cascade,
  position int not null default 0,
  template_id text not null default 'blank',
  template_html text check (template_html is null or char_length(template_html) <= 400000),
  fields jsonb not null default '{}',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pages_note_idx on public.pages (note_id, position);

create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  note_id uuid not null references public.items(id) on delete cascade,
  kind text not null check (kind in ('stroke','image','text')),
  data jsonb not null check (char_length(data::text) <= 600000),
  replaces uuid references public.objects(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);
create index if not exists objects_page_idx on public.objects (page_id, created_at);
create index if not exists objects_note_idx on public.objects (note_id, created_at);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  html text not null check (char_length(html) <= 400000),
  created_at timestamptz not null default now()
);
create index if not exists templates_owner_idx on public.templates (owner_id);

-- ───────────────────────── access functions ─────────────────────────
-- Highest role the caller has on an item, looking up through ancestors. 0 = no access.
-- UNION (not UNION ALL) so a malformed cycle can never loop forever.
create or replace function public.item_role(p_item uuid) returns int
language sql stable security definer set search_path = public as $$
  with recursive up(id, parent_id) as (
    select id, parent_id from items where id = p_item
    union
    select i.id, i.parent_id from items i join up on i.id = up.parent_id
  )
  select coalesce(max(role_rank(m.role)), 0)
  from up join item_members m on m.item_id = up.id and m.user_id = auth.uid()
$$;

-- A profile is visible if it is me, or belongs to someone who is a member of something I can see.
create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1 from item_members b
    where b.user_id = p_user and item_role(b.item_id) >= 1
  )
$$;

-- All items I can see, with my role (1 viewer, 2 editor, 3 admin).
create or replace function public.my_items()
returns table (id uuid, parent_id uuid, kind text, title text, owner_id uuid,
               trashed_at timestamptz, created_at timestamptz, updated_at timestamptz, role int)
language sql stable security invoker set search_path = public as $$
  select i.id, i.parent_id, i.kind, i.title, i.owner_id, i.trashed_at, i.created_at, i.updated_at,
         item_role(i.id) as role
  from items i
  where item_role(i.id) >= 1
$$;

create or replace function public.list_members(p_item uuid)
returns table (user_id uuid, name text, email text, color text, role text, pending boolean)
language plpgsql stable security definer set search_path = public as $$
declare r int := item_role(p_item);
begin
  if r < 1 then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, p.display_name, case when r >= 3 then p.email end, p.color, m.role, false
    from item_members m join profiles p on p.id = m.user_id
    where m.item_id = p_item
    union all
    select null::uuid, ''::text, v.email, '#9a9a9a'::text, v.role, true
    from invites v where v.item_id = p_item and r >= 3;
end $$;

create or replace function public.invite_member(p_item uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid; e text := lower(trim(p_email));
begin
  if item_role(p_item) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('viewer','editor','admin') then raise exception 'bad role'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad email'; end if;
  select id into v_uid from profiles where lower(email) = e;
  if v_uid is not null then
    insert into item_members (item_id, user_id, role) values (p_item, v_uid, p_role)
      on conflict (item_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into invites (item_id, email, role, invited_by) values (p_item, e, p_role, auth.uid())
    on conflict (item_id, email) do update set role = excluded.role;
  return 'pending';
end $$;

create or replace function public.cancel_invite(p_item uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if item_role(p_item) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from invites where item_id = p_item and email = lower(trim(p_email));
end $$;

-- ───────────────────────── triggers ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare palette text[] := array['#6f7140','#1f5bff','#a020c0','#e8321e','#d98200','#0a8f6a','#c2185b','#455a64'];
begin
  insert into profiles (id, email, display_name, color)
  values (new.id, lower(new.email),
          coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
          palette[1 + (abs(hashtext(new.id::text)::bigint) % 8)::int]);
  insert into item_members (item_id, user_id, role)
    select item_id, new.id, role from invites where email = lower(new.email)
    on conflict do nothing;
  delete from invites where email = lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null and not exists (select 1 from items where id = new.parent_id and kind = 'folder') then
      raise exception 'parent must be a folder';
    end if;
  else
    if new.parent_id is distinct from old.parent_id or new.owner_id <> old.owner_id or new.kind <> old.kind then
      raise exception 'parent/owner/kind are immutable';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists items_guard_trg on public.items;
create trigger items_guard_trg before insert or update on public.items
  for each row execute function public.items_guard();
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- Creator of a top-level item becomes its admin (children inherit from the tree).
create or replace function public.items_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is null then
    insert into item_members (item_id, user_id, role) values (new.id, new.owner_id, 'admin')
      on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists items_owner_membership_trg on public.items;
create trigger items_owner_membership_trg after insert on public.items
  for each row execute function public.items_owner_membership();

create or replace function public.pages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from items where id = new.note_id and kind = 'note') then
      raise exception 'pages belong to notes';
    end if;
    new.created_by := auth.uid();
  else
    if new.note_id <> old.note_id then raise exception 'note_id is immutable'; end if;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists pages_guard_trg on public.pages;
create trigger pages_guard_trg before insert or update on public.pages
  for each row execute function public.pages_guard();

-- The SERVER decides who wrote a stroke; the client cannot forge authorship.
create or replace function public.objects_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select note_id into new.note_id from pages where id = new.page_id;
  if new.note_id is null then raise exception 'unknown page'; end if;
  select display_name into v_name from profiles where id = auth.uid();
  new.author_id := auth.uid();
  new.author_name := coalesce(v_name, '');
  new.created_at := now();
  new.deleted_at := null;
  new.deleted_by := null;
  return new;
end $$;
drop trigger if exists objects_before_insert_trg on public.objects;
create trigger objects_before_insert_trg before insert on public.objects
  for each row execute function public.objects_before_insert();

-- Only soft-delete / restore is possible. Restoring is limited to whoever erased it (or an admin).
create or replace function public.objects_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_jsonb(new) - 'deleted_at' - 'deleted_by' is distinct from to_jsonb(old) - 'deleted_at' - 'deleted_by' then
    raise exception 'objects are append-only';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := coalesce(old.deleted_at, now());
    new.deleted_by := coalesce(old.deleted_by, auth.uid());
  else
    if old.deleted_by is distinct from auth.uid() and item_role(old.note_id) < 3 then
      raise exception 'only the eraser or an admin can restore' using errcode = '42501';
    end if;
    new.deleted_by := null;
  end if;
  return new;
end $$;
drop trigger if exists objects_before_update_trg on public.objects;
create trigger objects_before_update_trg before update on public.objects
  for each row execute function public.objects_before_update();

create or replace function public.objects_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update items set updated_at = now() where id = new.note_id;
  return new;
end $$;
drop trigger if exists objects_after_insert_trg on public.objects;
create trigger objects_after_insert_trg after insert on public.objects
  for each row execute function public.objects_after_insert();

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles     enable row level security;
alter table public.items        enable row level security;
alter table public.item_members enable row level security;
alter table public.invites      enable row level security;
alter table public.pages        enable row level security;
alter table public.objects      enable row level security;
alter table public.templates    enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, color) on public.profiles to authenticated;

-- (owner_id = auth.uid()) lets INSERT ... RETURNING work before the membership trigger row is visible.
drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (owner_id = auth.uid() or public.item_role(id) >= 1);
drop policy if exists items_insert on public.items;
create policy items_insert on public.items for insert to authenticated
  with check (owner_id = auth.uid() and (parent_id is null or public.item_role(parent_id) >= 2));
drop policy if exists items_update on public.items;
create policy items_update on public.items for update to authenticated
  using (public.item_role(id) >= 2) with check (public.item_role(id) >= 2);
drop policy if exists items_delete on public.items;
create policy items_delete on public.items for delete to authenticated
  using (public.item_role(id) >= 3 or owner_id = auth.uid());

drop policy if exists members_select on public.item_members;
create policy members_select on public.item_members for select to authenticated
  using (public.item_role(item_id) >= 1);
drop policy if exists members_write on public.item_members;
create policy members_write on public.item_members for all to authenticated
  using (public.item_role(item_id) >= 3) with check (public.item_role(item_id) >= 3);

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all to authenticated
  using (public.item_role(item_id) >= 3) with check (public.item_role(item_id) >= 3);

drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages for select to authenticated using (public.item_role(note_id) >= 1);
drop policy if exists pages_insert on public.pages;
create policy pages_insert on public.pages for insert to authenticated with check (public.item_role(note_id) >= 2);
drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages for update to authenticated
  using (public.item_role(note_id) >= 2) with check (public.item_role(note_id) >= 2);
drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages for delete to authenticated using (public.item_role(note_id) >= 3);

drop policy if exists objects_select on public.objects;
create policy objects_select on public.objects for select to authenticated using (public.item_role(note_id) >= 1);
drop policy if exists objects_insert on public.objects;
create policy objects_insert on public.objects for insert to authenticated with check (public.item_role(note_id) >= 2);
drop policy if exists objects_update on public.objects;
create policy objects_update on public.objects for update to authenticated
  using (public.item_role(note_id) >= 2) with check (public.item_role(note_id) >= 2);
-- no DELETE policy on purpose: history is permanent (rows vanish only when the whole note is deleted).

drop policy if exists templates_own on public.templates;
create policy templates_own on public.templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ───────────────────────── grants ─────────────────────────
revoke execute on function public.item_role(uuid), public.can_see_profile(uuid), public.my_items(),
  public.list_members(uuid), public.invite_member(uuid, text, text), public.cancel_invite(uuid, text)
  from public, anon;
grant execute on function public.item_role(uuid), public.can_see_profile(uuid), public.my_items(),
  public.list_members(uuid), public.invite_member(uuid, text, text), public.cancel_invite(uuid, text)
  to authenticated;

-- ───────────────────────── storage (photos / radiographs) ─────────────────────────
-- Private bucket. Path convention: <note_id>/<uuid>.jpg — access follows the note's permissions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "note images read" on storage.objects;
create policy "note images read" on storage.objects for select to authenticated
  using (bucket_id = 'note-images' and public.item_role(((storage.foldername(name))[1])::uuid) >= 1);
drop policy if exists "note images write" on storage.objects;
create policy "note images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-images' and public.item_role(((storage.foldername(name))[1])::uuid) >= 2);

-- ───────────────────────── realtime (colleagues see edits live) ─────────────────────────
alter publication supabase_realtime add table public.objects;
alter publication supabase_realtime add table public.pages;

-- trigger functions must not be callable through the API
revoke execute on function public.handle_new_user(), public.items_guard(), public.items_owner_membership(),
  public.objects_after_insert(), public.objects_before_insert(), public.objects_before_update(), public.pages_guard()
  from public, anon, authenticated;
