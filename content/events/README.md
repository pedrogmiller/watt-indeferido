# Watt Indeferido — pacote de conteúdo (Correio)

Autor: Pedro + Game Master.  
UI monta. Economy calibra tags com €. **Não editar `index.html` para conteúdo.**

## Estrutura

```
events/
  README.md                 ← este ficheiro
  SCHEMA.md                 ← campos obrigatórios
  skeletons/                ← 1 ficheiro = 1 tipo de carta (esqueleto)
  skins/                    ← peles por esqueleto (texto pt-PT + params)
  se-sheets/                ← ficha da SE (tags ao ganhar o lote)
```

## Regras rápidas

| | Esqueleto | Skin |
|--|-----------|------|
| O quê | trigger, botões, effects[] | nomes, assunto, corpo, params |
| Idioma ids | inglês | — |
| Copy jogador | — | **pt-PT** |
| Mudar botões | esqueleto **novo** | não |

## Fluxo de trabalho (Pedro offline)

1. Copia / edita um JSON em `skeletons/` ou `skins/`
2. Não inventes € — usa tags; marca `PEDIR_ECONOMY` nas notes se precisares
3. Pede opinião ao Game Master no chat (ou PR)
4. UI só publica quando Pedro + CoS mandarem

## Seed incluído

- `mail-consultor-m0`
- `mail-terreno-01` (+ skins parcela A/B)
- `mail-camara-01` (+ skins hostil/neutra)
- `mail-investidores-car-01`
- `mail-joker-fa-bess-01` (grelha FA)
- `se-sheets/ourique.json` (exemplo)


## MVP

Ver `MVP-ITERATION-1.md` — fluxo M0–M6 ↔ esqueletos (Ourique).

## DRAFT 2026-09-28 — prazos + LP → obra → COD

Proposta GM (não trancada): `deadlines.draft.json`, `lp-cod-rules.draft.json`, 22 esqueletos `mail-dgeg-lp-*`, `mail-banco-term-sheet-01`, `mail-epc-*`, `mail-investidores-fid-01`, `mail-obra-arranque-01`, `mail-rede-*`, `mail-dgeg-ensaios-01`, `mail-dgeg-le-cod-01`, `mail-prazo-*`, `mail-prorrogacao-*`, `mail-fyi-processo-01` + skins Ourique. Spec: `../deadlines-lp-cod-proposta.md`.
