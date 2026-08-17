import { shipAt } from './hail'

/* ============================================================
   Ensemble su un punto (GFS 0,5°, 31 membri)
   ------------------------------------------------------------
   Qui la probabilità è quella vera: 31 versioni dello stesso
   modello con condizioni iniziali perturbate. Per ogni membro si
   calcola SHIP con i SUOI ingredienti — mai mediare CAPE o shear
   fra membri prima: le code sono l'informazione, la media le
   cancella.

   La risposta ha una serie senza suffisso (il run di controllo) e
   poi _member01…_memberNN. Peso: ~31 chiamate normali per punto —
   per questo si carica solo su richiesta e solo sulla località.
   ============================================================ */

const VARS = [
  'cape',
  'freezing_level_height',
  'temperature_500hPa',
  'temperature_700hPa',
  'geopotential_height_500hPa',
  'geopotential_height_700hPa',
  'wind_speed_500hPa',
  'wind_direction_500hPa',
  'wind_speed_10m',
  'wind_direction_10m',
  'dew_point_2m',
  'surface_pressure',
  'weather_code',
  'precipitation',
  'wind_gusts_10m',
]

/** Soglie delle frazioni mostrate: dichiarate qui, dichiarate in UI. */
export const ENSEMBLE_METRICS = [
  { id: 'ship08', label: 'SHIP > 0,8', hint: 'ambiente da grandine 2–4 cm' },
  { id: 'ship15', label: 'SHIP > 1,5', hint: 'ambiente da grandine oltre 4 cm' },
  { id: 'cape1000', label: 'CAPE ≥ 1000', hint: 'energia convettiva moderata o più' },
  { id: 'rain1', label: 'pioggia ≥ 1 mm/h', hint: 'precipitazione in atto' },
  { id: 'gust60', label: 'raffiche ≥ 60 km/h', hint: 'vento da danni leggeri' },
]

/** Elenco dei suffissi membro presenti nella risposta ('' = controllo). */
function memberSuffixes(hourly) {
  const out = new Set()
  for (const k of Object.keys(hourly)) {
    if (k === 'time') continue
    const m = k.match(/_member\d+$/)
    out.add(m ? m[0] : '')
  }
  return [...out].sort()
}

/**
 * Risposta ensemble → { time, memberCount, fractions } dove fractions è
 * [{ t, ship08, ship15, cape1000, rain1, gust60 }] con valori 0..1.
 */
export function ensembleFractions(json) {
  const h = json.hourly
  const time = h.time
  const suffixes = memberSuffixes(h)

  /* Vista per membro con le chiavi standard: così shipAt lavora invariato. */
  const memberView = (suffix) => {
    const view = {}
    for (const v of VARS) view[v] = h[`${v}${suffix}`] ?? []
    return view
  }
  const views = suffixes.map(memberView)

  const fractions = time.map((t, i) => {
    let ship08 = 0
    let ship15 = 0
    let cape1000 = 0
    let rain1 = 0
    let gust60 = 0
    for (const view of views) {
      const s = shipAt(view, i)
      if (s) {
        if (s.ship > 0.8) ship08 += 1
        if (s.ship > 1.5) ship15 += 1
      }
      if ((view.cape[i] ?? 0) >= 1000) cape1000 += 1
      if ((view.precipitation[i] ?? 0) >= 1) rain1 += 1
      if ((view.wind_gusts_10m[i] ?? 0) >= 60) gust60 += 1
    }
    const n = views.length
    return { t, ship08: ship08 / n, ship15: ship15 / n, cape1000: cape1000 / n, rain1: rain1 / n, gust60: gust60 / n }
  })

  return { time, memberCount: suffixes.length, fractions }
}
