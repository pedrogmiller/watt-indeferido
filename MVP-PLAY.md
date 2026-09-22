# MVP Correio loop — how to play (local)

Local server (already typical):

```bash
python3 -m http.server 8765 --directory /workspace/ipp-console-light
```

## Gate 1 truth (2026-09-22)

| Concept | Meaning |
|---------|---------|
| **Progress** | `mailLoop.projectPhase` along `trc_won → land → pip → aia → licenca_producao → obra → cod` |
| **Pressure clock** | `mailLoop.month` (=devMonth). Play jumps this; phase never rises from time alone |
| **Play** | Jump to next **landing** with phase+tag-eligible relevant mail, or a deadline interrupt |
| **Period chrome** | `M{month} · {PHASE}` e.g. `M0 · TRC`, `M2 · Terreno` |
| **HUD (Ourique card)** | Phase pill + próxima data crítica (from `mailLoop.deadlines`) |


## Gate 1 — Mandate (Contas iniciais) · hybrid MVP

MVP = **`boutique`**. Briefing one-liner before first market: «Runway curto — um lote cabe…». Investor letter = purse banda S, máx 1 TRC, «não caçes os cinzentos ainda». Soft-lock **ON**: wave 0 = Ourique open + Ferreira/Estremoz grey. The M0 CAR letter answers aceitar / cortar / plano on bands S/M/L (no amounts) and updates the HUD and `lotFitsMandate`. Progression stub: phase → land/pip promotes boutique → mid. See [MANDATE-MOCK.md](./MANDATE-MOCK.md). QA: `?mandate=infra|mid`, `?mandate=skip`.

Phase only rises via choice `effects[]` → `PHASE_BUMP` (conservative MVP: land / pip / aia). **No auto obra/cod.**

## Quick start (skip leilão)

| URL | Effect |
|-----|--------|
| [`http://127.0.0.1:8765/index.html?mvp=1`](http://127.0.0.1:8765/index.html?mvp=1) | Post-win Ourique + deliver **landing 0 / M0** (3 cartas). Phase=`trc_won`. Opens Correio. **Play** = next interrupt (phase-aware). |
| [`http://127.0.0.1:8765/index.html?mvp=1&pacing=month`](http://127.0.0.1:8765/index.html?mvp=1&pacing=month) | Same bootstrap; **Play** uses legacy month step (default +1). QA escape hatch. |
| [`http://127.0.0.1:8765/index.html?mvp=1&play=3`](http://127.0.0.1:8765/index.html?mvp=1&play=3) | Event pacing: `play=3` caps **max jump** at 3 months when scanning. |

Then Press **Play** (`#btnNextQ`).

### Expected smoke path

1. `?mvp=1` → HUD shows **TRC** + próxima data (janela terreno ~ M1); Correio has M0 trio.
2. Play → landing 1 (terrenos) while still `trc_won`.
3. Choose terreno **Abrir DD** (`land_option_open`) → phase → **land**; HUD updates.
4. Play → landing 2 (câmara / rede / advogado se tags) — only if phase ∈ `{land,pip}`.
5. Play alone never raises phase.

## Play semantics (default = event / interrupt jump)

- Scan next landings `0..6` (seed order = old M0–M6) for undelivered **relevant** entries where:
  - `projectPhase ∈ landing.when_phase` **OR** `skeleton.trigger.when_phase`
  - `requires_any_effects` satisfied
  - not already delivered
- Also consider unfired `deadlines[].atMonth` within max jump.
- Jump `mailLoop.month` by delta (cap `caps.max_jump_months` = 6); deliver that landing.
- **Phase does not increment on Play.**

## Landings ↔ old M0–M6

| Landing | when_phase (seed) | Content |
|---------|-------------------|---------|
| 0 | trc_won | consultor + investidores CAR + dica |
| 1 | trc_won, land | terrenos A/B + FYI |
| 2 | land, pip | câmara + advogado DD + rede info |
| 3 | pip, aia | value-add + comunidade/media + follow-up |
| 4 | pip, aia | investidores review + concorrente + reequip |
| 5 | pip, aia, licenca_producao | APA + banco |
| 6 | aia, licenca_producao | rede prazo + DGEG |

`mvp-schedule.json` v2 keeps a `months` mirror for backward compat; motor prefers `landings`.

## PHASE_BUMP (MVP1 — conservative)

| Effect | → phase |
|--------|---------|
| `land_option_open` / `land_talk_+1` / `dd_started` | land |
| `risk_camara_-1` (meet) | pip |
| `apa_track_start` | aia |
| `value_add_commit` | *(no bump — placeholder)* |
| `capex_rede_flag` / `lp_granted` | → licenca_producao *(not wired)* |
| obra / cod | never auto in MVP1 |

`obra` requires already `licenca_producao` AND (`aia` OR pip+`nao_sujeicao`) if ever raised manually.

## Seed deadlines (hipótese, relative to win)

| id | label | atMonth |
|----|-------|---------|
| land_option | Janela opção terreno | 1 |
| pip_camara | PIP / Câmara | 2 |
| main_permit | Licença principal (APA) | 5 |
| grid_agreement | Acordo rede | 6 |

Cleared softly when related effects fire.

## Query flags

| Flag | Meaning |
|------|---------|
| `?mvp=1` | Bootstrap M0 + event-jump Play |
| `?pacing=event` | Default. Jump to next relevant mail / deadline |
| `?pacing=month` | Legacy: advance `play` months per click |
| `?play=N` | **Event:** max jump override (1–12). **Month:** step size (1–6) |

## DevTools

```js
WattInbox.loop                 // mailLoop (projectPhase, month, deadlines, tags, …)
WattInbox.deliverMonth(2)
WattInbox.planMonth(2)         // no side effects
WattInbox.findNextMail(0)
WattInbox.monthHasRelevant(1)
WattInbox.applyEffects(['land_option_open'])  // also raises phase via PHASE_BUMP
WattInbox.raisePhase('pip')
WattInbox.phaseBump
WattInbox.phases
WattInbox.nearestDeadline()
WattInbox.playStep()
WattInbox.playPacing()
```

## Not in this MVP

Economy €, Pages deploy, git push, ICNF / 2º TRC / fail-leilão arcs, full deadline engine, obra/cod path.
