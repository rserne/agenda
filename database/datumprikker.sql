-- Datumprikker: twee tabellen in de database van het Nhost-project.
-- Uitvoeren in het dashboard: Database, SQL Editor. Laat 'Track this' aan, zodat Hasura de tabellen kent.
-- De tabellen van andere apps in hetzelfde project (zoals de AustralieApp) blijven ongemoeid.

create table public.peilingen (
  id uuid primary key default gen_random_uuid(),
  eigenaar uuid not null references auth.users (id) on delete cascade,
  organisator text,                         -- naam die genodigden zien, bijvoorbeeld 'Robbert'
  titel text not null check (char_length(titel) between 1 and 200),
  duur_min integer not null check (duur_min between 5 and 1440),
  locatie text,
  notitie text,
  opties jsonb not null,                    -- lijst van begintijden als ISO-tekst, bijvoorbeeld ["2026-11-03T09:00:00.000Z", …]
  gesloten boolean not null default false,
  gekozen timestamptz,                      -- het moment dat je hebt ingepland
  aangemaakt timestamptz not null default now()
);
create index peilingen_eigenaar on public.peilingen (eigenaar, aangemaakt desc);

create table public.stemmen (
  id uuid primary key default gen_random_uuid(),
  peiling_id uuid not null references public.peilingen (id) on delete cascade,
  naam text not null check (char_length(naam) between 1 and 80),
  email text check (email is null or char_length(email) <= 200),
  keuzes jsonb not null,                    -- per begintijd 'ja', 'misschien' of 'nee'
  aangemaakt timestamptz not null default now()
);
create index stemmen_peiling on public.stemmen (peiling_id);
