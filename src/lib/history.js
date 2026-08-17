/* ============================================================
   Confronto nel tempo — snapshot giornalieri in localStorage
   ------------------------------------------------------------
   Per dire "quale dà valori migliori" servono tre cose per ogni
   giorno: cosa diceva il deterministico, cosa diceva l'ensemble,
   cosa è successo davvero. Le prime due si salvano al volo quando
   le sezioni sono aperte; la terza arriva da ERA5 (lag ~1 giorno)
   e copre pioggia e raffiche — la grandine osservata non esiste
   in nessun dataset gratuito, e la riga lo dice.

   Volutamente minimale: una riga per giorno e località, tetto a
   60 righe, nessun backend.
   ============================================================ */

const KEY = 'wm.history'
const MAX_ROWS = 60

const locKey = (loc) => `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

function save(rows) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX_ROWS)))
  } catch {
    /* storage pieno: si perde lo storico, non la app */
  }
}

/**
 * Registra (o aggiorna) lo snapshot del giorno per la località.
 * `det` e `ens` sono parziali: ognuno arriva quando la sua sezione è aperta.
 */
export function recordSnapshot(dateISO, loc, { det, ens }) {
  const rows = load()
  const id = `${dateISO}|${locKey(loc)}`
  const existing = rows.find((r) => r.id === id)
  if (existing) {
    if (det) existing.det = det
    if (ens) existing.ens = ens
    existing.name = loc.name
  } else {
    rows.push({ id, date: dateISO, name: loc.name, lat: loc.latitude, lon: loc.longitude, det, ens })
  }
  save(rows)
}

/** Snapshot della località, dal più recente. */
export function snapshotsFor(loc) {
  const k = locKey(loc)
  return load()
    .filter((r) => r.id.endsWith(`|${k}`))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Scrive l'osservato ERA5 dentro lo snapshot, una volta ottenuto. */
export function recordObserved(id, observed) {
  const rows = load()
  const row = rows.find((r) => r.id === id)
  if (row && observed) {
    row.obs = observed
    save(rows)
  }
}
