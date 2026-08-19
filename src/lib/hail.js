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
   significativa (oltre i 4 cm).

   SHIP descrive l'AMBIENTE, non dice se il temporale si innesca:
   il valore va quindi pesato con la convezione effettivamente
   prevista dal modello (weather_code / precipitazione).
   ============================================================ */

import { bearingLabel, distanceKm, nf, windDir } from './format'

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
  'wind_gusts_10m',
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
  if (ship >= 1.5) return { label: '> 4 cm', note: 'Grandine grossa, distruttiva' }
  if (ship >= 0.8) return { label: '2–4 cm', note: 'Danni a colture, coperture e veicoli' }
  if (ship >= 0.35) return { label: '1–2 cm', note: 'Chicchi piccoli' }
  if (ship > 0.05) return { label: '< 1 cm', note: 'Graupel / chicchi minuti' }
  return { label: '—', note: 'Grandine non attesa' }
}

/**
 * Potenziale di rotazione (supercella): CAPE ≥ 1000 J/kg e shear 0–6 km
 * ≥ 18 m/s in un'ora con innesco. Sono le soglie classiche della
 * letteratura sulle supercelle, non una nostra invenzione.
 */
export function hasRotationPotential(series) {
  return series.some((p) => p.risk >= 0.05 && (p.cape ?? 0) >= 1000 && (p.shear ?? 0) >= 18)
}

/** Bbox conservativo del dominio ICON-2I: fuori, l'API risponde `nan`. */
const ICON2I = { latMin: 35, latMax: 48.8, lonMin: 4.5, lonMax: 20.5 }
export const ICON2I_MODEL = 'italia_meteo_arpae_icon_2i'

export function gridFitsIcon2i(points, days) {
  if (days > 2) return false // oltre ~48 h l'orizzonte del 2,2 km non è garantito
  return points.every(
    (p) => p.lat >= ICON2I.latMin && p.lat <= ICON2I.latMax && p.lon >= ICON2I.lonMin && p.lon <= ICON2I.lonMax,
  )
}

/**
 * Riduce la risposta multi-località a una cella per punto, con la serie oraria
 * completa. Il picco NON si calcola qui: dipende dalla finestra visualizzata,
 * che la sezione decide (un giorno alla volta).
 * Ogni punto orario porta anche CAPE, raffica prevista e le componenti u/v del
 * vento a 500 hPa: servono a energia, rischio downburst e direzione di
 * spostamento delle celle temporalesche.
 */
export function summariseCells(results, points) {
  return results.map((res, k) => {
    const h = res.hourly
    const point = points[k]
    const series = []

    for (let i = 0; i < h.time.length; i += 1) {
      const s = shipAt(h, i)
      const trigger = triggerWeight(h.weather_code?.[i] ?? 0, h.precipitation?.[i])
      const ws5 = h.wind_speed_500hPa?.[i]
      const wd5 = h.wind_direction_500hPa?.[i]
      const r = wd5 != null ? (wd5 * Math.PI) / 180 : null
      series.push({
        t: h.time[i],
        risk: s ? s.ship * trigger : 0,
        ship: s?.ship ?? 0,
        cape: h.cape?.[i] ?? null,
        gust: h.wind_gusts_10m?.[i] ?? null,
        precip: h.precipitation?.[i] ?? null,
        shear: s?.shear ?? null, // 0–6 km, m/s: serve al potenziale di rotazione
        // componenti del vento in quota (km/h): media vettoriale ⇒ steering
        u5: r === null || ws5 == null ? null : -ws5 * Math.sin(r),
        v5: r === null || ws5 == null ? null : -ws5 * Math.cos(r),
      })
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
  return series.reduce((best, p) => (p.risk > best.risk ? p : best), {
    risk: 0,
    ship: 0,
    t: null,
    cape: null,
    gust: null,
  })
}

/** Fascia descrittiva del CAPE (energia disponibile alla convezione, J/kg). */
export function capeBand(v) {
  if (v === null || v === undefined) return null
  if (v >= 4000) return 'estrema'
  if (v >= 2500) return 'alta'
  if (v >= 1000) return 'moderata'
  if (v >= 300) return 'debole'
  return 'quasi nulla'
}

/**
 * Direzione e velocità di spostamento delle celle temporalesche, come media
 * vettoriale del vento a 500 hPa su tutte le celle e ore visibili. È lo
 * steering flow: approssima il moto dei temporali, non lo determina — ma è
 * l'informazione che spiega "i fenomeni scenderanno verso sud-est".
 */
export function steeringOf(cells) {
  let u = 0
  let v = 0
  let n = 0
  for (const c of cells) {
    for (const p of c.series) {
      if (p.u5 === null || p.v5 === null) continue
      u += p.u5
      v += p.v5
      n += 1
    }
  }
  if (!n) return null
  u /= n
  v /= n
  const speed = Math.hypot(u, v)
  if (speed < 8) return { speed, towardsDeg: null } // quasi fermo: direzione senza senso
  const towardsDeg = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360
  return { speed, towardsDeg }
}


/* ------------------------------------------------------------
   Sintesi testuale — due o tre frasi generate dai numeri, nello
   stile degli outlook convettivi: dove, quando, con che cosa.
   Regole rigide e soglie esplicite: meglio una frase povera ma
   vera che una ricca e inventata.
   ------------------------------------------------------------ */

const DAY_PARTS = [
  { label: 'nella notte', from: 0, to: 6 },
  { label: 'al mattino', from: 6, to: 12 },
  { label: 'nel pomeriggio', from: 12, to: 18 },
  { label: 'in serata', from: 18, to: 24 },
]

const joinList = (items) =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`

/**
 * cells: già ristrette al giorno visibile (serie filtrate).
 * centre: {latitude, longitude} della località.
 */
export function buildNarrative(cells, centre) {
  const sentences = []
  // Deve restare allineato alle etichette di hailSize(): con chiavi vecchie
  // sizeRank[label] è undefined e la grandine spariva dalla sintesi.
  const sizeRank = { '—': 0, '< 1 cm': 1, '1–2 cm': 2, '2–4 cm': 3, '> 4 cm': 4 }

  for (const part of DAY_PARTS) {
    const active = []
    let partMaxShip = 0
    let partMaxRisk = 0
    for (const c of cells) {
      let best = 0
      let bestShip = 0
      for (const p of c.series) {
        const h = new Date(p.t).getHours()
        if (h < part.from || h >= part.to) continue
        if (p.risk > best) {
          best = p.risk
          bestShip = p.ship
        }
      }
      if (best >= 0.2) {
        const km = distanceKm(centre.latitude, centre.longitude, c.gridLat, c.gridLon)
        active.push({ km, sector: km < 40 ? null : bearingLabel(centre.latitude, centre.longitude, c.gridLat, c.gridLon) })
        partMaxShip = Math.max(partMaxShip, bestShip)
        partMaxRisk = Math.max(partMaxRisk, best)
      }
    }
    if (!active.length) continue

    const here = active.some((a) => a.sector === null)
    const sectors = [...new Set(active.filter((a) => a.sector).map((a) => a.sector))].slice(0, 3)
    const where =
      here && sectors.length
        ? `sulla zona e verso ${joinList(sectors)}`
        : here
          ? 'sulla zona'
          : `nelle aree a ${joinList(sectors)}`
    const size = hailSize(partMaxShip)
    const strength = partMaxRisk >= 0.5 ? 'temporali forti' : 'temporali'
    const hailTxt =
      sizeRank[size.label] >= 2
        ? `, possibile grandine ${size.label === '> 4 cm' ? 'superiore a 4 cm' : `fino a ${size.label}`}`
        : ''
    sentences.push(`${part.label[0].toUpperCase()}${part.label.slice(1)} ${strength} ${where}${hailTxt}.`)
  }

  if (!sentences.length) {
    // Niente sopra la soglia "moderato": distinguere il debole dal nulla,
    // altrimenti la frase smentisce i numeri mostrati due righe sotto.
    let weak = 0
    for (const c of cells) for (const p of c.series) if (p.risk > weak) weak = p.risk
    return {
      sentences: [
        weak >= 0.05
          ? 'Solo convezione debole e isolata nell\u2019area: qualche rovescio o breve temporale possibile, grandine improbabile.'
          : 'Giornata senza convezione rilevante nell\u2019area: ambiente poco favorevole alla grandine, o nessun temporale previsto dai modelli.',
      ],
      quiet: true,
    }
  }

  /* Rotazione: se una cella intensa ha CAPE e shear da supercella, va detto. */
  const anyRotation = cells.some(
    (c) => hasRotationPotential(c.series) && c.series.some((p) => p.risk >= 0.2),
  )
  if (anyRotation) sentences.push('Nelle celle più intense l\u2019ambiente è da temporale rotante (supercella).')

  /* Raffiche: massimo previsto nelle sole ore convettive. */
  let gustMax = 0
  for (const c of cells)
    for (const p of c.series) if (p.risk >= 0.05 && p.gust > gustMax) gustMax = p.gust
  if (gustMax >= 60)
    sentences.push(`Nei temporali raffiche fino a ~${Math.round(gustMax / 5) * 5} km/h.`)

  const steering = steeringOf(cells)
  if (steering?.towardsDeg != null)
    sentences.push(`Celle in spostamento verso ${windDir(steering.towardsDeg)} a ~${nf(steering.speed, 0)} km/h.`)

  return { sentences, quiet: false }
}
