/** Numero localizzato IT con decimali fissi; `–` per valori assenti. */
export function nf(v, dec = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  return v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** Emoji bandiera da codice ISO-3166 alpha-2. */
export function flag(cc) {
  if (!cc || cc.length !== 2) return '🏳️'
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export const WIND_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
export const windDir = (deg) => WIND_POINTS[Math.round(deg / 22.5) % 16]

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

export const fmtDayShort = (iso) =>
  new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })

export const fmtDayHour = (iso) =>
  new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtLong = (iso) =>
  new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

/** Bande AQI europeo (EAQI). Colore = palette di stato, mai uno slot di serie. */
export function aqiBand(v, pal) {
  if (v === null || v === undefined) return { label: '–', color: pal.muted }
  if (v <= 20) return { label: 'Buona', color: pal.good }
  if (v <= 40) return { label: 'Discreta', color: pal.good }
  if (v <= 60) return { label: 'Moderata', color: pal.warn }
  if (v <= 80) return { label: 'Scarsa', color: pal.serious }
  if (v <= 100) return { label: 'Molto scarsa', color: pal.critical }
  return { label: 'Pessima', color: pal.critical }
}

/** Mediana ignorando i null. */
export function median(values) {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b)
  if (!v.length) return null
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

const R_EARTH = 6371 // km

/** Distanza great-circle in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.sqrt(a))
}

/** Punto cardinale (in italiano) della direzione da 1 verso 2. */
export function bearingLabel(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  return WIND_POINTS[Math.round(((deg + 360) % 360) / 22.5) % 16]
}

/** "42 km a NE" — vuoto se il punto coincide con l'origine. */
export function relativePosition(fromLat, fromLon, toLat, toLon) {
  const km = distanceKm(fromLat, fromLon, toLat, toLon)
  if (km < 6) return 'qui'
  return `${Math.round(km)} km a ${bearingLabel(fromLat, fromLon, toLat, toLon)}`
}
