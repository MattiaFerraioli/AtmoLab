/* ============================================================
   Modelli, variabili, palette
   ============================================================ */

/** Slot categorici validati disponibili: oltre 8 serie il colore non resta
 *  distinguibile in modo affidabile (CVD-safe). Con i modelli attuali il tetto
 *  non si raggiunge, ma resta il vincolo se se ne riattiva qualcuno. */
export const MAX_MODELS = 8

/**
 * Modelli meteo esposti da Open-Meteo (tutti gratuiti, senza API key).
 * Open-Meteo ne offre altri — GEM (ECCC Canada), JMA, HARMONIE KNMI e DMI —
 * esclusi perché sull'Italia aggiungono poco: per riattivarne uno basta
 * rimetterlo qui con il suo id.
 */
export const MODELS = [
  { id: 'ecmwf_ifs025', name: 'ECMWF IFS', org: 'ECMWF · Europa', res: '0.25°', scope: 'globale' },
  { id: 'gfs_seamless', name: 'GFS', org: 'NOAA · USA', res: '0.11–0.25°', scope: 'globale' },
  { id: 'icon_seamless', name: 'ICON', org: 'DWD · Germania', res: '2–11 km', scope: 'globale' },
  { id: 'meteofrance_seamless', name: 'ARPEGE/AROME', org: 'Météo-France', res: '1.5–25 km', scope: 'globale' },
  { id: 'ukmo_seamless', name: 'UKMO', org: 'Met Office · UK', res: '2–10 km', scope: 'globale' },
  { id: 'italia_meteo_arpae_icon_2i', name: 'ICON-2I', org: 'ItaliaMeteo ARPAE', res: '2.2 km', scope: 'regionale · Italia' },
]

/** UKMO resta disponibile ma spento all'avvio: si accende con un click sul chip. */
export const DEFAULT_MODELS = MODELS.filter((m) => m.id !== 'ukmo_seamless').map((m) => m.id)

/** Variabili orarie confrontabili tra modelli. */
export const VARS = [
  { id: 'temperature_2m', label: 'Temperatura', unit: '°C', dec: 1, agree: [1.5, 3.5] },
  { id: 'precipitation', label: 'Pioggia', unit: 'mm', dec: 1, zeroBase: true, agree: [0.5, 2] },
  { id: 'wind_speed_10m', label: 'Vento', unit: 'km/h', dec: 0, zeroBase: true, agree: [6, 14] },
  { id: 'cloud_cover', label: 'Nuvolosità', unit: '%', dec: 0, domain: [0, 100], agree: [20, 45] },
  { id: 'relative_humidity_2m', label: 'Umidità', unit: '%', dec: 0, domain: [0, 100], agree: [10, 25] },
  { id: 'pressure_msl', label: 'Pressione', unit: 'hPa', dec: 0, agree: [1.5, 4] },
]

export const SPANS = [
  { d: 3, label: '3 giorni' },
  { d: 7, label: '7 giorni' },
  { d: 10, label: '10 giorni' },
]

/* ------------------------------------------------------------
   Palette categorica validata (worst adjacent CVD ΔE 9.1 light /
   8.4 dark). L'ordine degli slot È il meccanismo di sicurezza CVD:
   assegnare sempre in ordine fisso, mai ciclare.
   ------------------------------------------------------------ */
export const PALETTE = {
  light: {
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    surface: '#fcfcfb',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    ink: '#0b0b0b',
    inkSec: '#52514e',
    muted: '#898781',
    good: '#0ca30c',
    warn: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
    tiles: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  },
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    surface: '#1a1a19',
    grid: '#2c2c2a',
    axis: '#383835',
    ink: '#ffffff',
    inkSec: '#c3c2b7',
    muted: '#898781',
    good: '#0ca30c',
    warn: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
    tiles: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  },
}

export const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const DEFAULT_LOCATION = {
  name: 'Verona',
  country: 'Italia',
  country_code: 'IT',
  admin1: 'Veneto',
  latitude: 45.43854,
  longitude: 10.9938,
  timezone: 'Europe/Rome',
}

