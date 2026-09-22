# MVP iteração 1 — fluxo ↔ esqueletos (Ourique)

Objectivo: **um loop jogável** do leilão ganho até ~M6, com pool mínimo de correio.  
Analisa isto; depois cortamos / fundimos / acrescentamos.

## Como ler

```
[momento no jogo] → dispara esqueleto(s) → skin(s) conforme ficha SE / estado
                 → jogador escolhe CTA → tags → (Economy depois) → próximo mês
```

**Não é** uma história linear obrigatória. A coluna “quando” = candidato. Se a tag não existir, a carta não vem.

Ficha MVP: `se-sheets/ourique.json` (`camara: hostil`, `rede: normal`, `ambiente: apa_first`).

---

## Acto 0 — Leilão (já no jogo; fora deste pacote Correio)

Tutorial A1a/A1b/A2 → escolher lote → licitar → **ganhar TRC Ourique**.

Estado inicial gravado:
- `trc_awarded` + `se_id: ourique`
- capacities solares do lote (Economy/UI)
- tags da ficha SE

---

## M0 — ao ganhar (sem Play) → 3 cartas

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-consultor-m0` | `default` | O que ganhaste; solar sozinho não rentabiliza; urge híbrido/BESS |
| 2 | `mail-investidores-car-01` | `default` | Comunicado Cash at Risk |
| 3 | `mail-dica-01` | `m0-dossier` | Abre dossier / começa por terrenos |

Caps: as 3 contam para M0.

---

## M1 — 1º Play → terreno

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-terreno-01` | `parcela-a-cara` | Oferta terreno A |
| 2 | `mail-terreno-01` | `parcela-b-servidao` | Oferta terreno B (2º dono) |
| 3 | `mail-advogado-dd-01` | `default` | Só se escolheu Abrir DD / Negociar em algum terreno |
| 4 | `mail-fyi-01` | `recurso-solar` | FYI opcional |

Se `pass` nos dois terrenos → tag `land_miss` alta → M2/M3 concorrente mais cedo.

---

## M2 — Câmara + calendário rede

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-camara-01` | `hostil` (Ourique) | PIP / audiência — CTA pesado |
| 2 | `mail-rede-info-01` | `calendario` | REN/E-REDES: calendário (info, sem €) |
| 3 | `mail-fyi-01` | `obra-prep` | FYI se já há opção de terreno |

Ignorar Câmara → `risk_camara_+` → desbloqueia follow-up M3/M4.

---

## M3 — value-add + reputação

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-consultor-valueadd-01` | `hibrido-bess` | Empurra híbrido/sobreequipar (ainda **sem** reequipamento) |
| 2 | `mail-comunidade-01` **ou** `mail-media-01` | Ourique | Só um dos dois (cap) |
| 3 | `mail-camara-followup-01` | `hostil` | Só se ignorou Câmara em M2 |

---

## M4 — investidores olham para trás + concorrente

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-investidores-review-01` | `default` | Cash at Risk vs progresso; plano ou pressão |
| 2 | `mail-concorrente-01` | `terreno-ou-leilao` | Info: outro IPP mexeu |
| 3 | `mail-consultor-reequip-01` | `merchant-ppa` | **Primeira** menção a reequipamento (tardio) |

---

## M5 — ambiente + banco seed

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-apa-01` | `default` | Ourique = `apa_first` (não ICNF neste MVP) |
| 2 | `mail-banco-seed-01` | `default` | “Falamos com de-risk” — info |
| 3 | FYI | — | slot livre |

---

## M6 — rede com decisão + DGEG

| # | Esqueleto | Skin | Função |
|---|-----------|------|--------|
| 1 | `mail-rede-prazo-01` | `acordo-ou-caducidade` | CTA pesado REN/E-REDES |
| 2 | `mail-dgeg-obrigacoes-01` | `default` | Info caducidade / obrigações TRC |

---

## Joker (por cima — não no calendário fixo)

| Esqueleto | Quando | Nota |
|-----------|--------|------|
| `mail-joker-fa-bess-01` | `bess_dev_started` + aviso FA aberto | Grelha maturidade como RP-C21-I08 |

Máx. 1 joker / ~3 meses; não no mesmo mês que `mail-rede-prazo-01` / Câmara dura.

---

## Inventário MVP (lista fechada desta iteração)

### Esqueletos (16)
1. mail-consultor-m0  
2. mail-investidores-car-01  
3. mail-dica-01  
4. mail-terreno-01  
5. mail-advogado-dd-01  
6. mail-camara-01  
7. mail-rede-info-01  
8. mail-fyi-01  
9. mail-consultor-valueadd-01  
10. mail-comunidade-01  
11. mail-media-01  
12. mail-camara-followup-01  
13. mail-investidores-review-01  
14. mail-concorrente-01  
15. mail-consultor-reequip-01  
16. mail-apa-01  
17. mail-banco-seed-01  
18. mail-rede-prazo-01  
19. mail-dgeg-obrigacoes-01  
20. mail-joker-fa-bess-01  

*(~20 tipos — alinhado ao “pool finito”)*

### Fora do MVP 1
- ICNF (ficha Estremoz), ERSE, PPA/OMIE, 2º TRC, falhar leilão  
- Tutorial beats B–D vs Correio (Gate 3)  
- € reais (Economy)

---

## O que quero que analises

1. Falta alguma pressão óbvia no loop de 6 meses?  
2. Sobram cartas (fundir esqueletos)?  
3. M0–M6 ok como *candidatos*, ou mudas ordem?  
4. Reequipamento em M4 — cedo/tarde demais?  

Depois da tua análise: cortamos o inventário e fechamos Gate 1 → polimos copy no Gate 2.
