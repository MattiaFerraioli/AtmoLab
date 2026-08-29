import { AGREEMENT_MODELS } from './api'

/* ============================================================
   Probabilità come accordo fra modelli
   ------------------------------------------------------------
   Prima la "probabilità" era SHIP × un peso d'innesco letto dal
   weather_code di UN solo run deterministico: un numero utile ma
   che non è una probabilità. Qui diventa una frequenza reale:
   quanti modelli, sugli stessi punti e ore, prevedono l'evento.

   Le soglie d'evento sono deliberatamente basse: misurano "il
   modello ci mette convezione/vento/pioggia vera", non l'entità —
   quella resta al modello ad alta risoluzione.
   ============================================================ */

export const AGREEMENT_COUNT = AGREEMENT_MODELS.length

const STORM_CODES = new Set([95, 96, 99])

/** Evento convettivo per un modello in un'ora. */
const isConvective = (wcode, precip, cape) =>
  STORM_CODES.has(wcode) || ((precip ?? 0) >= 1 && (cape ?? 0) >= 500)

/**
 * Riduce la risposta multi-modello della griglia a, per ogni cella:
 *   series: [{ t, conv, gust }]  — frazione di modelli 0..1, ora per ora
 *   rainByDay: Map 'YYYY-MM-DD' → frazione di modelli con accumulo ≥ 10 mm
 * L'ordine delle celle è quello dei punti richiesti.
 */
export function agreementCells(results) {
  return results.map((res) => {
    const h = res.hourly
    const t = h.time
    const series = []
    const rainTotals = new Map() // giorno -> [tot modello0, tot modello1, ...]

    for (let i = 0; i < t.length; i += 1) {
      let conv = 0
      let gust = 0
      const day = t[i].slice(0, 10)
      if (!rainTotals.has(day)) rainTotals.set(day, AGREEMENT_MODELS.map(() => 0))
      const totals = rainTotals.get(day)

      AGREEMENT_MODELS.forEach((m, k) => {
        const cape = h[`cape_${m}`]?.[i]
        const precip = h[`precipitation_${m}`]?.[i]
        const wgust = h[`wind_gusts_10m_${m}`]?.[i]
        const wcode = h[`weather_code_${m}`]?.[i]
        if (isConvective(wcode, precip, cape)) conv += 1
        if ((wgust ?? 0) >= 60) gust += 1
        totals[k] += precip ?? 0
      })

      series.push({ t: t[i], conv: conv / AGREEMENT_COUNT, gust: gust / AGREEMENT_COUNT })
    }

    const rainByDay = new Map()
    for (const [day, totals] of rainTotals)
      rainByDay.set(day, totals.filter((x) => x >= 10).length / AGREEMENT_COUNT)

    return { series, rainByDay }
  })
}

/**
 * Frazione di picco per una cella sul giorno visibile, per pericolo.
 * hoursFilter: (iso) => bool, lo stesso filtro usato per le serie dei valori.
 */
export function cellFraction(agreement, hazardId, hoursFilter, targetDay) {
  if (!agreement) return null
  if (hazardId === 'rain') return agreement.rainByDay.get(targetDay) ?? 0
  const key = hazardId === 'wind' ? 'gust' : 'conv'
  let best = 0
  for (const p of agreement.series) {
    if (!hoursFilter(p.t)) continue
    if (p[key] > best) best = p[key]
  }
  return best
}

/**
 * Etichetta di probabilità dalla frazione: tre gradini, nient'altro.
 * Lo zero era una quarta voce a sé ("solo ambiente"), ma si leggeva come una
 * categoria misteriosa invece dell'estremo basso della stessa scala. Ora 0/3
 * è "bassa", e accanto resta sempre scritto il conteggio: chi vuole sapere se
 * è 0 o 1 modello su 3 lo legge lì, senza gergo.
 */
export function fractionLabel(frac) {
  if (frac == null) return null
  if (frac > 2 / 3) return 'alta'
  if (frac >= 1 / 3) return 'media'
  return 'bassa'
}

/** "2 su 3 modelli" — la forma leggibile della frazione. */
export const fractionText = (frac) =>
  frac == null ? null : `${Math.round(frac * AGREEMENT_COUNT)} su ${AGREEMENT_COUNT} modelli`
