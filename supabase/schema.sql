-- Research OS cloud sync schema.
--
-- Design choice: mirror the existing local storage shape exactly instead of
-- normalizing into separate tables. The app already stores everything as
-- 4 whole-array JSON blobs under fixed keys (see js/storage.js /
-- js/constants.js STORAGE_KEYS). Keeping the same shape here means data.js
-- and every other app file stay completely untouched -- only the storage
-- layer gains a remote copy.
--
-- Run this once in the Supabase project's SQL Editor after creating the
-- project (Dashboard -> SQL Editor -> New query -> paste -> Run).

create table if not exists kv_store (
  user_id uuid not null references auth.users(id) default auth.uid(),
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table kv_store enable row level security;

-- Each signed-in user can only read/write their own rows. For a personal,
-- single-user app this just means: only you (once logged in) can see this
-- data, even though the anon key is public in the client code.
create policy "kv_store_select_own" on kv_store
  for select using (auth.uid() = user_id);

create policy "kv_store_insert_own" on kv_store
  for insert with check (auth.uid() = user_id);

create policy "kv_store_update_own" on kv_store
  for update using (auth.uid() = user_id);
