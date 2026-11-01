# Database voor de datumprikker

De datumprikker bewaart peilingen en stemmen in twee tabellen bij Nhost. Er is geen eigen functie voor nodig: de app en de stempagina praten rechtstreeks met Hasura, en de rechten hieronder bepalen wie wat mag.

Deze map heet bewust niet `nhost/`: als het project ooit aan deze repository wordt gekoppeld, zou Nhost een map `nhost/` als volledige projectinstelling lezen.

## 1. Tabellen aanmaken

Dashboard, Database, SQL Editor: plak `datumprikker.sql`, zet **Track this** aan en klik **Run**.

## 2. Relaties

Dashboard, Hasura (Data), tabel `stemmen`, tab Relationships: voeg de voorgestelde object-relatie toe en noem hem `peiling` (via `peiling_id`).
Tabel `peilingen`, tab Relationships: voeg de voorgestelde array-relatie toe en noem hem `stemmen`.

## 3. Rechten (tab Permissions per tabel)

**peilingen**

| Rol | Actie | Rijen | Kolommen | Verder |
|---|---|---|---|---|
| user | insert | zonder voorwaarde | titel, organisator, duur_min, locatie, notitie, opties | Column preset: `eigenaar` = `X-Hasura-User-Id` |
| user | select | `{"eigenaar":{"_eq":"X-Hasura-User-Id"}}` | alle | |
| user | update | `{"eigenaar":{"_eq":"X-Hasura-User-Id"}}` | gesloten, gekozen | |
| user | delete | `{"eigenaar":{"_eq":"X-Hasura-User-Id"}}` | | |
| public | select | zonder voorwaarde | id, organisator, titel, duur_min, locatie, notitie, opties, gesloten, gekozen | Root fields: alleen **select_by_pk** aan (geen lijst, geen aggregate, geen subscriptions) |

**stemmen**

| Rol | Actie | Rijen | Kolommen | Verder |
|---|---|---|---|---|
| public | insert | `{"peiling":{"gesloten":{"_eq":false}}}` | peiling_id, naam, email, keuzes | |
| user | insert | `{"peiling":{"gesloten":{"_eq":false}}}` | peiling_id, naam, email, keuzes | voor wie toevallig ingelogd stemt |
| user | select | `{"peiling":{"eigenaar":{"_eq":"X-Hasura-User-Id"}}}` | alle | |
| user | delete | `{"peiling":{"eigenaar":{"_eq":"X-Hasura-User-Id"}}}` | | |

Wat dit betekent:
- Je ziet, sluit en verwijdert alleen je eigen peilingen. Iemand anders met een account in hetzelfde project (bijvoorbeeld een reisgenoot van de AustralieApp) ziet ze niet.
- Een genodigde zonder account kan alleen één peiling openen als hij de link met de code heeft, en er een stem aan toevoegen zolang hij open is. Een lijst van peilingen opvragen of andermans stemmen lezen kan niet.
- `public` is de rol die Nhost gebruikt voor verzoeken zonder inlog.
