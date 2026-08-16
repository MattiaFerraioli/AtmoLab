/* ============================================================
   Rischio grandine
   ------------------------------------------------------------
   Open-Meteo non pubblica un diametro di grandine previsto (il
   parametro `hail` è accettato dall'API ma torna sempre null).
   Si ricostruisce quindi l'indice SHIP — Significant Hail
   Parameter, lo stesso usato dallo Storm Prediction Center —
   dai parametri d'ambiente che l'API espone davvero.

   SHIP = MUCAPE · w · LR75 · (−T500) · shear / 42.000.000
   con correzioni per CAPE debole, lapse rate basso e zero
   termico basso. SHIP > 1 ⇒ ambiente favorevole a grandine
   significativa (≥ 5 cm).

   SHIP descrive l'AMBIENTE, non dice se il temporale si innesca:
   il valore va quindi pesato con la convezione effettivamente
   prevista dal modello (weather_code / precipitazione).
   ============================================================ */

export const HAIL_VARS = [
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
]

/** Griglie: sempre 7×7 = 49 punti, cambia solo il passo (costo API costante). */
export const GRIDS = [
  { id: 'local', label: 'Locale', step: 0.35, span: '≈ 230 km' },
  { id: 'region', label: 'Regionale', step: 0.7, span: '≈ 460 km' },
  { id: 'wide', label: 'Ampia', step: 1.4, span: '≈ 930 km' },
]
export const GRID_SIDE = 7

/**
 * La sezione mostra sempre UN giorno: cercare il picco su tutta la finestra
 * faceva comparire di default il massimo di domani anche stando su oggi.
 * L'offset è anche il numero di giorni da scaricare (offset + 1).
 */
export const HAIL_DAYS = [
  { offset: 0, label: 'Oggi' },
  { offset: 1, label: 'Domani' },
  { offset: 2, label: 'Dopodomani' },
]
export const MAX_HAIL_OFFSET = 2 // oltre 72 h i parametri convettivi non dicono più nulla

/** Punti della griglia centrata sulla località. */
export function buildGrid({ latitude, longitude }, step) {
  const half = (GRID_SIDE - 1) / 2
  const points = []
  for (let i = -half; i <= half; i += 1) {
    for (let j = -half; j <= half; j += 1) {
      points.push({
        lat: +(latitude + i * step).toFixed(4),
        lon: +(longitude + j * step).toFixed(4),
        row: i + half,
        col: j + half,
      })
    }
  }
  return points
}

/** Componenti u/v del vento (direzione meteorologica = da dove soffia), m/s. */
function windVector(speedKmh, deg) {
  const s = speedKmh / 3.6
  const r = (deg * Math.PI) / 180
  return [-s * Math.sin(r), -s * Math.cos(r)]
}

/** Rapporto di mescolanza in g/kg da dew point (°C) e pressione (hPa). */
function mixingRatio(dewPoint, pressure) {
  const e = 6.112 * Math.exp((17.67 * dewPoint) / (dewPoint + 243.5))
  return (622 * e) / (pressure - e)
}

/**
 * SHIP per una singola ora. Restituisce null se mancano gli ingredienti.
 * Ritorna anche i termini, così la UI può spiegare da cosa nasce il numero.
 */
export function shipAt(hourly, i) {
  const v = (k) => hourly[k]?.[i]
  const cape = v('cape')
  const t500 = v('temperature_500hPa')
  const t700 = v('temperature_700hPa')
  const z500 = v('geopotential_height_500hPa')
  const z700 = v('geopotential_height_700hPa')
  const dew = v('dew_point_2m')
  const pressure = v('surface_pressure')
  const freezing = v('freezing_level_height')
  const ws500 = v('wind_speed_500hPa')
  const wd500 = v('wind_direction_500hPa')
  const ws10 = v('wind_speed_10m')
  const wd10 = v('wind_direction_10m')

  const inputs = [cape, t500, t700, z500, z700, dew, pressure, freezing, ws500, wd500, ws10, wd10]
  if (inputs.some((x) => x === null || x === undefined)) return null
  if (cape <= 0) return { ship: 0, cape, shear: 0, lapse: 0, freezing, t500 }

  const thickness = (z500 - z700) / 1000
  if (thickness <= 0) return null
  const lapse = (t700 - t500) / thickness // °C/km fra 700 e 500 hPa

  const mixr = Math.min(13.6, Math.max(11, mixingRatio(dew, pressure)))
  const t500capped = Math.min(-5.5, t500)

  const [u5, v5] = windVector(ws500, wd500)
  const [u0, v0] = windVector(ws10, wd10)
  const shearRaw = Math.hypot(u5 - u0, v5 - v0) // proxy shear 0–6 km (500 hPa ≈ 5,6 km)
  const shear = Math.min(27, Math.max(7, shearRaw))

  let ship = (cape * mixr * lapse * -t500capped * shear) / 42_000_000
  if (cape < 1300) ship *= cape / 1300
  if (lapse < 5.8) ship *= lapse / 5.8
  if (freezing < 2400) ship *= freezing / 2400

  return { ship: Math.max(0, ship), cape, shear: shearRaw, lapse, freezing, t500 }
}

/**
 * Peso dell'innesco: quanta convezione il modello prevede davvero in quell'ora.
 * Senza temporale, un ambiente favorevole resta potenziale inespresso.
 */
export function triggerWeight(weatherCode, precipitation) {
  if (weatherCode === 96 || weatherCode === 99) return 1 // temporale con grandine
  if (weatherCode === 95) return 0.9 // temporale
  if (weatherCode >= 80 && weatherCode <= 82) return 0.55 // rovesci
  if ((precipitation ?? 0) > 0.3) return 0.3
  return 0.12 // solo potenziale, nessuna precipitazione prevista
}

export const RISK_LABELS = ['Trascurabile', 'Basso', 'Moderato', 'Alto', 'Molto alto']

/**
 * Bande di rischio combinato (SHIP × innesco). Restituisce solo lo step: il
 * colore lo prende il chiamante dalla stessa rampa sequenziale, così mappa,
 * lista e grafico parlano la stessa lingua cromatica.
 */
export function riskBand(risk) {
  const step = risk >= 1 ? 4 : risk >= 0.5 ? 3 : risk >= 0.2 ? 2 : risk >= 0.05 ? 1 : 0
  return { step, label: RISK_LABELS[step] }
}

/**
 * Diametro atteso: dipende dall'ambiente (SHIP), non dal peso d'innesco.
 * Stima da parametri, non output di un modello di grandine.
 */
export function hailSize(ship) {
  if (ship >= 1.5) return { label: '> 5 cm', note: 'grandine grossa, distruttiva' }
  if (ship >= 1) return { label: '3–5 cm', note: 'grandine significativa' }
  if (ship >= 0.7) return { label: '2–3 cm', note: 'danni a colture e carrozzerie' }
  if (ship >= 0.3) return { label: '1–2 cm', note: 'chicchi piccoli' }
  if (ship > 0.05) return { label: '< 1 cm', note: 'graupel / chicchi minuti' }
  return { label: '—', note: 'grandine non attesa' }
}

/** Ramp sequenziale blu (una sola tinta) — su tema scuro va dal cupo al chiaro. */
const RAMP_LIGHT = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#0d366b']
const RAMP_DARK = ['#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb']
export const rampFor = (theme) => (theme === 'dark' ? RAMP_DARK : RAMP_LIGHT)

/**
 * Riduce la risposta multi-località a una cella per punto, con la serie oraria
 * completa. Il picco NON si calcola qui: dipende dalla finestra visualizzata,
 * che la sezione decide (un giorno alla volta).
 */
export function summariseCells(results, points) {
  return results.map((res, k) => {
    const h = res.hourly
    const point = points[k]
    const series = []

    for (let i = 0; i < h.time.length; i += 1) {
      const s = shipAt(h, i)
      const trigger = triggerWeight(h.weather_code?.[i] ?? 0, h.precipitation?.[i])
      series.push({ t: h.time[i], risk: s ? s.ship * trigger : 0, ship: s?.ship ?? 0 })
    }

    return {
      lat: res.latitude,
      lon: res.longitude,
      gridLat: point.lat,
      gridLon: point.lon,
      row: point.row,
      col: point.col,
      utcOffset: res.utc_offset_seconds,
      series,
    }
  })
}

/** Picco di rischio dentro una serie già ristretta alla finestra visibile. */
export function peakOf(series) {
  return series.reduce((best, p) => (p.risk > best.risk ? p : best), { risk: 0, ship: 0, t: null })
}
