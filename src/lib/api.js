import { MODELS } from './constants'
import { HAIL_VARS } from './hail'

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const AIRQUALITY = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

async function getJSON(url, signal) {
  const res = await fetch(url, { signal })
  const json = await res.json()
  // Open-Meteo restituisce 400 con {error:true, reason:"…"} — il reason è l'informazione utile.
  if (json && json.error) throw new Error(json.reason || 'Errore API')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return json
}

/** Dashboard classica: condizioni attuali, 48h orarie, 14 giorni. */
export function fetchForecast({ latitude, longitude }, signal) {
  const p = new URLSearchParams({
    latitude,
    longitude,
    timezone: 'auto',
    forecast_days: 14,
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
  })
  return getJSON(`${FORECAST}?${p}`, signal)
}

/** Qualità dell'aria (CAMS). Fallisce in silenzio: è un contorno, non il piatto. */
export async function fetchAirQuality({ latitude, longitude }, signal) {
  const p = new URLSearchParams({
    latitude,
    longitude,
    timezone: 'auto',
    current: 'european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide',
  })
  try {
    return await getJSON(`${AIRQUALITY}?${p}`, signal)
  } catch {
    return null
  }
}

/**
 * Stessa variabile, tutti i modelli in una sola chiamata.
 * Le chiavi tornano come `<variabile>_<modello>`; i modelli regionali
 * restituiscono `null` fuori dal loro dominio e oltre il loro orizzonte.
 */
export function fetchModelComparison({ latitude, longitude }, variable, days, signal) {
  const p = new URLSearchParams({
    latitude,
    longitude,
    timezone: 'auto',
    forecast_days: days,
    hourly: variable,
    models: MODELS.map((m) => m.id).join(','),
  })
  return getJSON(`${FORECAST}?${p}`, signal)
}

/**
 * Parametri convettivi su una griglia di punti. Open-Meteo accetta liste di
 * coordinate su latitude/longitude e risponde con un array nello stesso ordine:
 * 49 punti × 3 giorni × 14 variabili stanno in una sola richiesta (~250 kB).
 */
export async function fetchHailGrid(points, days, timezone, model, signal) {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat).join(','),
    longitude: points.map((x) => x.lon).join(','),
    // Fuso esplicito, non 'auto': con auto ogni punto prende il proprio (una
    // cella sul mare finisce in Etc/GMT-1), e le ore delle celle non sarebbero
    // più confrontabili né allineabili al giorno scelto.
    timezone: timezone || 'auto',
    forecast_days: days,
    hourly: HAIL_VARS.join(','),
  })
  // Un punto fuori dal dominio di un modello regionale produce `latitude: nan`
  // nella risposta — JSON invalido: chi chiama deve garantire il bbox.
  if (model) p.set('models', model)
  const json = await getJSON(`${FORECAST}?${p}`, signal)
  return Array.isArray(json) ? json : [json]
}

/**
 * Nome della località da coordinate. Open-Meteo non fa reverse geocoding, quindi
 * si usa BigDataCloud: gratuito, senza chiave, pensato per l'uso da browser.
 * Non è critico — se fallisce si resta sulle coordinate.
 */
export async function reverseGeocode(latitude, longitude) {
  const p = new URLSearchParams({ latitude, longitude, localityLanguage: 'it' })
  // Timeout esplicito: è un contorno, e senza di questo un endpoint lento
  // bloccherebbe del tutto l'impostazione della località.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`${REVERSE}?${p}`, { signal: ctrl.signal })
    if (!res.ok) return null
    const d = await res.json()
    const name = d.city || d.locality || d.principalSubdivision
    if (!name) return null
    return {
      name,
      admin1: d.principalSubdivision || '',
      country: d.countryName || '',
      country_code: d.countryCode || '',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Accordo fra modelli per la probabilità: stessi punti della griglia, set
 * ridotto di variabili, tre modelli globali che coprono ovunque (niente nan).
 * Le chiavi tornano come `<variabile>_<modello>`.
 */
export const AGREEMENT_MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless']

export async function fetchProbGrid(points, days, timezone, signal) {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat).join(','),
    longitude: points.map((x) => x.lon).join(','),
    timezone: timezone || 'auto',
    forecast_days: days,
    hourly: 'cape,precipitation,wind_gusts_10m,weather_code',
    models: AGREEMENT_MODELS.join(','),
  })
  const json = await getJSON(`${FORECAST}?${p}`, signal)
  return Array.isArray(json) ? json : [json]
}

/**
 * Ensemble su UN punto. gfs05 è l'unico con i livelli in quota per membro
 * (SHIP calcolabile con gli ingredienti del membro); ECMWF ha più membri ma
 * manca lo zero termico. Una chiamata pesa come ~31 normali: mai su griglia.
 */
const ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble'
export const ENSEMBLE_MODEL = 'gfs05'

export function fetchEnsemblePoint({ latitude, longitude }, days, timezone, signal) {
  const p = new URLSearchParams({
    latitude,
    longitude,
    timezone: timezone || 'auto',
    forecast_days: days,
    models: ENSEMBLE_MODEL,
    hourly: HAIL_VARS.join(','),
  })
  return getJSON(`${ENSEMBLE}?${p}`, signal)
}

/**
 * Ensemble su griglia: SOLO le 4 variabili di superficie. Con i livelli in
 * quota per membro (SHIP) la stessa griglia peserebbe ~7 MB: misurato. Così
 * sono ~1,6 MB — accettabile per un click esplicito, mai automatico.
 */
export function fetchEnsembleGrid(points, days, timezone, signal) {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat).join(','),
    longitude: points.map((x) => x.lon).join(','),
    timezone: timezone || 'auto',
    forecast_days: days,
    models: ENSEMBLE_MODEL,
    hourly: 'cape,precipitation,wind_gusts_10m,weather_code',
  })
  return getJSON(`${ENSEMBLE}?${p}`, signal).then((json) => (Array.isArray(json) ? json : [json]))
}

/** Osservato (ERA5/ERA5T, lag ~1 giorno): per la verifica a posteriori. */
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'

export async function fetchObserved({ latitude, longitude }, dateISO, signal) {
  const p = new URLSearchParams({
    latitude,
    longitude,
    start_date: dateISO,
    end_date: dateISO,
    daily: 'precipitation_sum,wind_gusts_10m_max',
    timezone: 'auto',
  })
  try {
    const d = await getJSON(`${ARCHIVE}?${p}`, signal)
    const rain = d.daily?.precipitation_sum?.[0]
    const gust = d.daily?.wind_gusts_10m_max?.[0]
    if (rain == null && gust == null) return null
    return { rain, gust }
  } catch {
    return null // non ancora disponibile: normale per il giorno in corso
  }
}

/** Ricerca località. I risultati portano già il paese, quindi disambiguare
 *  fra omonimi è questione di leggere la riga giusta, non di pre-filtrare. */
export async function searchPlaces(name, signal) {
  const p = new URLSearchParams({ name, count: 10, language: 'it', format: 'json' })
  const json = await getJSON(`${GEOCODE}?${p}`, signal)
  return json.results || []
}
