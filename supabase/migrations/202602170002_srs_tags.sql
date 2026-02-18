alter table if exists srs_cards
  add column if not exists tags jsonb not null default '[]'::jsonb;
