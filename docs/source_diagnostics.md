# Diagnostics sources (MEMW Partie F2 + audit)

Suivi par pays / média : actions **ops** (RSS, Playwright, paywall) — complété après chaque campagne de collecte.

## Arabie saoudite

| Source | ID typique | Action |
|--------|------------|--------|
| Al-Arabiya | `sa_alarabiya` | Si 0 article : vérifier fil RSS généraliste vs opinion |
| Okaz, Al-Watan | `sa_okaz`, `sa_al_watan` | Arabe — priorité Anthropic si besoin ; vérifier hubs |
| Saudi Gazette | `sa_saudi_gazette` | Diagnostiquer timeouts |

## Turquie

| Source | Action |
|--------|--------|
| Cumhuriyet, Sabah, Milliyet, Sozcu | Hubs opinion dans CSV ; vérifier blocage géographique |

## Qatar

| Source | Action |
|--------|--------|
| Al Raya, Al Sharq, Al Watan | Vérifier URLs opinion + stabiliser `id` après import CSV |

## Koweït

| Source | Action |
|--------|--------|
| Al Qabas, Al Seyassah, Al Anba, Al Jarida | Ajouter flux RSS opinion si hubs instables |

## Oman

| Source | Action |
|--------|--------|
| Oman Observer, Al Roya, etc. | Nouvelles entrées CSV — premier run : curl + feedparser |

## Irak

| Source | Action |
|--------|--------|
| Rudaw, Iraqi News | P1 — santé RSS |
| Al Mada | P2 si arabe |

## Syrie

| Source | Action |
|--------|--------|
| Syria TV, Al Hal, Ultra Syria, al Thawra, Kassioun, Levant24 | Vérifier disponibilité + WAF |

## Iran

| Source | Action |
|--------|--------|
| Kayhan, Shargh, Donya-e-Eqtesad | Farsi — coût Haiku/Anthropic ; sites « doesn't open » dans CSV |
| Iran International | Vérifier flux RSS |

## Israël

| Source | ID | Action |
|--------|-----|--------|
| Haaretz | `il_haaretz` | Paywall : résumé RSS si configuré |
| Israel Hayom | `il_israelhayom` | Vérifier URL RSS + User-Agent |
| Ynet | — | Diagnostiquer 0 article |
| Times of Israel | — | Ajouter RSS opinion si manquant (P0 spec) |
| Maariv, Yediot | — | Hébreu — P2 coût traduction |

## Bahreïn

| Source | Action |
|--------|--------|
| Akhbar el-Khaleej, Al-Watan | Valider collecte post-import CSV |

## Algérie

| Source | Action |
|--------|--------|
| El Chourouk el-Yom | Vérifier hub opinion |

## Égypte (existant)

| Source | ID | Action |
|--------|-----|--------|
| Al-Ahram | `eg_ahram` | Playwright / WAF |
| Mada Masr | `eg_madamasr` | Idem |
| Al-Akhbar el-Yom | `eg_al_akhbar_el_yom` | Fallback URL — import CSV |

## Émirats

| Source | ID | Action |
|--------|-----|--------|
| Khaleej Times | `ae_khaleej` | Playwright |

## Jordanie

| Source | ID | Action |
|--------|-----|--------|
| Jordan Times | `jo_jordantimes` | Playwright |

---

## P0 — file d’attente (audit sprint 2)

| Source | ID registre | Action |
|--------|-------------|--------|
| Haaretz | `il_haaretz` | Paywall : résumé RSS uniquement si configuré |
| Israel Hayom | `il_israelhayom` | Vérifier URL RSS + User-Agent |
| Iran International | `ir_iranintl` | Vérifier disponibilité flux |
| Al-Ahram | `eg_ahram` | Playwright : timeouts / WAF |
| Mada Masr | `eg_madamasr` | Idem |
| Khaleej Times | `ae_khaleej` | Playwright |
| Jordan Times | `jo_jordantimes` | Playwright |

À mettre à jour après chaque run (curl + feedparser sur l’URL RSS du registre).
