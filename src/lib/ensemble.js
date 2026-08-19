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
/* Soglie tarate sul metro di GFS 0,5°, non su quello dei modelli km-scale:
   misurato sullo stesso punto e ora, ICON-2I dà CAPE 1950 dove il GFS
   deterministico dà 910 e il miglior membro 960. Una soglia assoluta presa
   dall'alta risoluzione qui non scatterebbe mai. */
export const ENSEMBLE_METRICS = [
  { id: 'ship08', label: 'SHIP > 0,8', hint: 'Ambiente da grandine 2–4 cm' },
  { id: 'ship15', label: 'SHIP > 1,5', hint: 'Ambiente da grandine oltre 4 cm' },
  { id: 'cape500', label: 'CAPE ≥ 500', hint: 'Energia convettiva significativa, sul metro di GFS' },
  { id: 'rain1', label: 'Pioggia ≥ 1 mm/h', hint: 'Precipitazione in atto' },
  { id: 'gust60', label: 'Raffiche ≥ 60 km/h', hint: 'Vento da danni leggeri' },
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
    let cape500 = 0
    let rain1 = 0
    let gust60 = 0
    for (const view of views) {
      const s = shipAt(view, i)
      if (s) {
        if (s.ship > 0.8) ship08 += 1
        if (s.ship > 1.5) ship15 += 1
      }
      if ((view.cape[i] ?? 0) >= 500) cape500 += 1
      if ((view.precipitation[i] ?? 0) >= 1) rain1 += 1
      if ((view.wind_gusts_10m[i] ?? 0) >= 60) gust60 += 1
    }
    const n = views.length
    return { t, ship08: ship08 / n, ship15: ship15 / n, cape500: cape500 / n, rain1: rain1 / n, gust60: gust60 / n }
  })

  return { time, memberCount: suffixes.length, fractions }
}


/* ------------------------------------------------------------
   Griglia ensemble: frazione di membri oltre soglia, per cella.
   Stessa definizione di evento dell'accordo fra modelli
   deterministici, così i numeri sono confrontabili fra sezioni.
   ------------------------------------------------------------ */

export const ENSEMBLE_MAP_METRICS = [
  { id: 'storm', label: 'Temporali', hint: 'Membri con convezione in atto' },
  { id: 'wind', label: 'Raffiche ≥ 60', hint: 'Membri con vento da danni' },
  { id: 'rain', label: 'Pioggia ≥ 10 mm', hint: 'Membri con accumulo giornaliero' },
]

const STORM_CODES = new Set([95, 96, 99])

/** Riduce la griglia ensemble a celle con serie di frazioni orarie. */
export function ensembleGridCells(results, points) {
  return results.map((res, k) => {
    const h = res.hourly
    const t = h.time
    const suffixes = memberSuffixes(h)
    const n = suffixes.length

    const series = []
    const rainTotals = new Map() // giorno -> accumulo per membro

    for (let i = 0; i < t.length; i += 1) {
      let storm = 0
      let gust = 0
      const day = t[i].slice(0, 10)
      if (!rainTotals.has(day)) rainTotals.set(day, new Array(n).fill(0))
      const totals = rainTotals.get(day)

      suffixes.forEach((suf, m) => {
        const cape = h[`cape${suf}`]?.[i]
        const precip = h[`precipitation${suf}`]?.[i]
        const wgust = h[`wind_gusts_10m${suf}`]?.[i]
        const wcode = h[`weather_code${suf}`]?.[i]
        if (STORM_CODES.has(wcode) || ((precip ?? 0) >= 1 && (cape ?? 0) >= 500)) storm += 1
        if ((wgust ?? 0) >= 60) gust += 1
        totals[m] += precip ?? 0
      })
      series.push({ t: t[i], storm: storm / n, gust: gust / n })
    }

    const rainByDay = new Map()
    for (const [day, totals] of rainTotals) rainByDay.set(day, totals.filter((x) => x >= 10).length / n)

    const point = points[k]
    return {
      gridLat: point.lat,
      gridLon: point.lon,
      row: point.row,
      col: point.col,
      memberCount: n,
      utcOffset: res.utc_offset_seconds ?? 0,
      series,
      rainByDay,
    }
  })
}

/** Severità 0–4 di una frazione: soglie 10% / un terzo / due terzi / 90%. */
export const fractionStep = (f) => (f >= 0.9 ? 4 : f > 2 / 3 ? 3 : f >= 1 / 3 ? 2 : f >= 0.1 ? 1 : 0)

/* ------------------------------------------------------------
   Incrocio deterministico × ensemble: NESSUNA fusione numerica
   (metri diversi: ICON-2I 2,2 km vs GFS 0,5°). Si affiancano le
   due letture e si giudica solo se concordano.
   ------------------------------------------------------------ */

const VERDICTS = {
  solid: { label: 'Segnale solido', color: '#30d158', hint: 'Dettaglio e membri concordano' },
  lone: { label: 'Solo il dettaglio', color: '#f97316', hint: 'I membri non lo vedono: possibile abbaglio della risoluzione' },
  tepid: { label: 'Membri tiepidi', color: '#eab308', hint: 'Qualche membro concorda, la maggioranza no' },
  spread: { label: 'Scenario diffuso', color: '#3987e5', hint: 'Membri caldi ma dettaglio quieto: minoritario ma da seguire' },
  quiet: { label: 'Concordano sul quieto', color: '#8e8e93', hint: 'Nessuna delle due letture vede l\u2019evento' },
}

const verdictOf = (strong, frac) => {
  if (strong && frac >= 1 / 3) return VERDICTS.solid
  if (strong && frac >= 0.1) return VERDICTS.tepid
  if (strong) return VERDICTS.lone
  if (frac >= 1 / 3) return VERDICTS.spread
  return VERDICTS.quiet
}

/**
 * Righe di confronto per il giorno: [{label, detText, frac, verdict}] o null
 * se manca uno dei due lati. detSeries = serie oraria della cella centrale
 * della griglia (stessa località del punto ensemble). Soglie deterministiche
 * allineate a quelle delle frazioni, così il confronto è omogeneo.
 */
export function crossVerdicts(fractions, detSeries, targetDay) {
  if (!fractions?.length || !detSeries?.length || !targetDay) return null
  const fr = fractions.filter((f) => f.t.startsWith(targetDay))
  const det = detSeries.filter((p) => p.t.startsWith(targetDay))
  if (!fr.length || !det.length) return null
  const maxFr = (k) => Math.max(...fr.map((f) => f[k]), 0)
  const maxDet = (k) => Math.max(...det.map((p) => p[k] ?? 0), 0)

  const ship = maxDet('ship')
  const gust = maxDet('gust')
  const rain = maxDet('precip')
  return [
    { label: 'Grandine', detText: `SHIP ${ship.toFixed(2)}`, frac: maxFr('ship08'), verdict: verdictOf(ship >= 0.8, maxFr('ship08')) },
    { label: 'Raffiche', detText: `${Math.round(gust)} km/h`, frac: maxFr('gust60'), verdict: verdictOf(gust >= 60, maxFr('gust60')) },
    { label: 'Pioggia', detText: `${rain.toFixed(1)} mm/h max`, frac: maxFr('rain1'), verdict: verdictOf(rain >= 1, maxFr('rain1')) },
  ]
}
