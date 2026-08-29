/* ============================================================
   Radar meteorologico — Dipartimento della Protezione Civile
   ------------------------------------------------------------
   Fonte ufficiale italiana: radar-api.protezionecivile.it, con
   le tile su una cache S3. Licenza CC-BY-SA, uso commerciale
   permesso citando "Radar-DPC" — è il motivo per cui si usa
   questa e non RainViewer, che il commerciale lo esclude e
   sarebbe incompatibile con un salvadanaio sul sito.

   Nessuna chiave, nessuna registrazione, e l'API riflette
   l'origine nell'header CORS. Le tile sono raster z/x/y, quindi
   basta un TileLayer di Leaflet.

   ATTENZIONE a cosa è e cosa non è: il radar è OSSERVAZIONE, la
   sezione temporali è PREVISIONE. Vanno tenuti distinti anche a
   schermo, con l'ora del rilevamento sempre in vista. La DPC
   avverte inoltre che il dato in tempo reale non è validato e
   può contenere anomalie: si mostra per quello che è.

   I percorsi delle tile non sono nella documentazione pubblica:
   sono stati ricavati osservando le richieste del loro visore e
   verificati uno per uno.
   ============================================================ */

const API = 'https://radar-api.protezionecivile.it'
const TILES = 'https://s3-prod-dpc-radar-webp-cache.s3.eu-south-1.amazonaws.com'

/** Attribuzione richiesta dalla licenza. */
export const RADAR_ATTRIB =
  '<a href="https://radar.protezionecivile.it/" target="_blank" rel="noreferrer">Radar-DPC</a>'

/**
 * Prodotti con le tile pubblicate. POH (probabilità di grandine) esiste come
 * prodotto ma le sue tile rispondono 403: resta fuori finché non le pubblicano.
 */
export const RADAR_TYPES = {
  VMI: 'Intensità massima verticale',
  SRI: 'Intensità di pioggia al suolo',
}

const pad = (n) => String(n).padStart(2, '0')

/** Istante dell'ultimo rilevamento disponibile, in millisecondi. */
export async function fetchLastRadar(type = 'VMI') {
  const res = await fetch(`${API}/findLastProductByType?type=${type}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json?.lastProducts?.[0]?.time ?? null
}

/**
 * Modello di URL per Leaflet. Il percorso porta la data del rilevamento in
 * UTC a passi di 5 minuti, e il nome del file è il tipo in minuscolo.
 */
export function radarTileUrl(type, time) {
  const d = new Date(time)
  const path = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  return `${TILES}/${type}/${path}/{z}/{x}/{y}/${type.toLowerCase()}.webp`
}
