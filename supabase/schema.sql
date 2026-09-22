-- Baufortschritt-Tracker: Fortschrittstabelle
-- Im Supabase SQL-Editor ausführen (entweder im selben Projekt wie der
-- Poker-Tracker als neue Tabelle, oder in einem eigenen neuen Projekt).

create table if not exists lecture_progress (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  event_id text not null,
  done boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (student_name, event_id)
);

alter table lecture_progress enable row level security;

-- Kein Login-System (Namen ohne Passwort) -> jeder darf lesen und schreiben,
-- genau wie beim Poker-Tracker im Freundeskreis.
create policy "Allow read for everyone"
  on lecture_progress for select
  using (true);

create policy "Allow insert for everyone"
  on lecture_progress for insert
  with check (true);

create policy "Allow update for everyone"
  on lecture_progress for update
  using (true);

-- Realtime für Live-Bestenliste aktivieren
alter publication supabase_realtime add table lecture_progress;
