import { MODELS } from './constants'
import { HAIL_VARS } from './hail'

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const AIRQUALITY = 'https://air-quality-api.open-meteo.com/v1/air-quality'

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
export async function fetchHailGrid(points, days, timezone, signal) {
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
  const json = await getJSON(`${FORECAST}?${p}`, signal)
  return Array.isArray(json) ? json : [json]
}

/** Ricerca località. I risultati portano già il paese, quindi disambiguare
 *  fra omonimi è questione di leggere la riga giusta, non di pre-filtrare. */
export async function searchPlaces(name, signal) {
  const p = new URLSearchParams({ name, count: 10, language: 'it', format: 'json' })
  const json = await getJSON(`${GEOCODE}?${p}`, signal)
  return json.results || []
}
