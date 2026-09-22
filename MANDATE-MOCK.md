# Gate 1 — Mandate mock (Contas iniciais) · hybrid MVP

**MVP lock (2026-09-22):** product path = **`mandate_tier: boutique`**.  
Soft-lock **ON** — bands that don’t fit go grey.  
`?mandate=mid|infra` remain QA overrides. Progression stub can raise boutique → mid.

No € finals (bands S/M/L only). No Pages. No git push. No difficulty selector.

## Flow (order)

1. **Briefing** — one sentence: «Runway curto — um lote cabe no mandato; os outros ficam fora do runway.»
2. **Investor letter** — CAR purse banda S + equity S + máx 1 TRC; «não caçes os cinzentos ainda».
3. **Market** — Ourique open; Ferreira/Estremoz grey («fora do runway» / equity).
4. **Progression stub** — play well (phase → `land`/`pip`, e.g. terreno open_dd) → mandate → mid + toast; greys unlock on next market render.
5. Post-win M0 investidores letter = **runway review**, not first mandate reveal.

## Tiers (`MANDATE_TIERS`)

| id | Rótulo | CAR max | Equity max | max TRCs | MVP |
|----|--------|---------|------------|----------|-----|
| `boutique` | Boutique | S | S | 1 | **default / play** |
| `mid` | Mid / Meia-tabela | M | M | 2 | unlock via progression / QA |
| `infra` | Infra | L | L | 4 | QA (`?mandate=infra`) |

`BAND_RANK = { S:1, M:2, L:3 }`

Soft-lock always uses `lotFitsMandate` (no «infra never soft-locks» escape). Infra with L max effectively unlocks all lots.

## Lot bands (`AUCTION_WAVES`) — wave 0 hybrid

| Wave | Lot | car_band | equity_capex_band | boutique |
|------|-----|----------|-------------------|----------|
| 0 | **Ourique** | **S** | **S** | **open** |
| 0 | Ferreira | M | M | grey |
| 0 | Estremoz | L | L | grey |
| 1 | Évora | S | S | open |
| 1 | Alqueva | M | M | grey@boutique / open@mid |
| 1 | Falagueira | L | L | grey until infra |
| 2 | Portimão | S | S | open |
| 2 | Tavira | M | M | grey@boutique |
| 2 | Ponte de Sor | L | L | grey until infra |

Wave 0 for boutique = **exactly 1 open + 2 grey**.

## Progression stub (`maybePromoteMandate`)

Triggered from `raiseProjectPhase` when phase becomes `land` or `pip` (e.g. after winning Ourique + terreno `land_option_open`).

- boutique → mid: bump tier, toast «Mandato alargado · mid — novos lotes no próximo mercado», `renderMandateHud` + `renderAuctionLots`, persist in save.
- mid → infra: optional later (stub returns false).

## URLs

| URL | Effect |
|-----|--------|
| `http://127.0.0.1:8765/index.html` | Default **boutique**; briefing+letter gate first auction open |
| `?mandate=boutique` | Explicit boutique (same as default) |
| `?mandate=1` | Force fresh briefing (boutique) |
| `?mandate=skip` | Skip briefing/letter (QA; keeps boutique) |
| `?mandate=mid` | QA mid soft-lock |
| `?mandate=infra` | QA infra (L unlocks all under soft-lock) |
| `?auction=1&mandate=skip` | Open mesa immediately — Ourique open, greys visible |

## HUD

Quiet pills: `CAR · banda S` + `Equity · banda S` (HIPÓTESE). Auction chrome chip: `Boutique` (mid → `Mid`, infra → `Infra`).

The M0 CAR letter (`mail-investidores-car-01`) lets the player confirm **S** or ask for **M** / **L** (no euro amounts). That sets `mandateState.carBand`, refreshes the CAR pill and the auction strip, and drives `lotFitsMandate` so lots above the band stay grey and lots within the band open. Delay still applies `investor_patience_-1`.

## Persist

`mandateState: { tier, carBand, acknowledged, letterRead, skip }` in save blob (tier survives promote; `carBand` is `S`/`M`/`L` or `null` to follow the tier).

## Still PEDIR_ECONOMY

- Real € purse / equity headroom numbers (bands only today)
- Full mid → infra unlock curve / market “levels” UX
- Economy calibration on bid curve (still «economia por calibrar»)
