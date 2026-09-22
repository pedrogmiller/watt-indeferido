# Schema mínimo

## Skeleton (`skeletons/<id>.json`)

```json
{
  "id": "mail-terreno-01",
  "phase": "post_win",
  "trigger": { "after": "trc_awarded", "month_offset": 1 },
  "priority": "high",
  "from_type": "PROPRIETARIO",
  "choices": [
    { "id": "open_dd", "label": "Abrir due diligence", "effects": ["land_option_open", "cash_at_risk_+1"] },
    { "id": "negotiate", "label": "Negociar condições", "effects": ["land_talk_+1", "delay_land_+1"] },
    { "id": "pass", "label": "Deixar passar", "effects": ["land_miss_+1"] }
  ],
  "notes_for_economy": "cash_at_risk_+1 = custo de opção/sinal — calibrar MEUR",
  "notes_for_ui": "drawer Correio; CTA primary no primeiro botão"
}
```

## Skin (`skins/<skeleton-id>.<skin-id>.json`)

```json
{
  "skeleton_id": "mail-terreno-01",
  "skin_id": "parcela-a-cara",
  "when": { "se_tags_any": [] },
  "from_name": "António Lopes",
  "subject": "Terreno junto à SE — janela de 30 dias",
  "body": "…",
  "params": { "sinal": "alto", "prazo_dias": 30 }
}
```

## SE sheet (`se-sheets/<se-id>.json`)

```json
{
  "se_id": "ourique",
  "se_name": "SE Ourique",
  "ren_real": true,
  "tags": {
    "camara": "hostil",
    "rede": "normal",
    "ambiente": "apa_first",
    "offtake": "normal"
  }
}
```

## Triggers (motor Gate 1+)

Preferir **fase + deadline** a `month_offset` puro:

```json
"trigger": {
  "when_phase": ["land", "pip"],
  "or_deadline": "grid_agreement",
  "month_offset": 1
}
```

| Campo | Uso |
|-------|-----|
| `when_phase` | Lista de `project_phase` em que a carta pode aterrar |
| `or_deadline` | Interrupt por data crítica (rede, TRC, CAR, joker) |
| `month_offset` | Seed / fallback MVP; não é o motor de progresso |

`project_phase` valores: `trc_won` · `land` · `pip` · `aia` · `licenca_producao` · `obra` · `cod`

Fase sobe só via `effects[]` / tags (Economy + UI). Comunicação prévia / `obra` implica já `licenca_producao` + `aia` (ou PIP + não sujeição).

