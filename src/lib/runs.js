/* ============================================================
   Stato delle corse dei modelli
   ------------------------------------------------------------
   L'endpoint /v1/forecast non dice da quale corsa arrivano i dati.
   Open-Meteo pubblica però un meta.json per ogni modello sorgente
   (CORS aperto), con l'inizializzazione dell'ultima corsa, quando
   è diventata disponibile e fin dove arrivano i dati.

   I modelli "seamless" sono composizioni di più sorgenti: nel
   breve termine usano il membro ad alta risoluzione, poi passano
   al globale. Qui si legge il membro GLOBALE, che è quello che
   determina l'orizzonte complessivo.
   ============================================================ */

const META = 'https://api.open-meteo.com/data'

export const MODEL_SOURCES = {
  ecmwf_ifs025: { dir: 'ecmwf_ifs025', member: 'IFS 0.25° globale' },
  gfs_seamless: { dir: 'ncep_gfs025', member: 'GFS 0.25° globale' },
  icon_seamless: { dir: 'dwd_icon', member: 'ICON globale 11 km' },
  meteofrance_seamless: { dir: 'meteofrance_arpege_world025', member: 'ARPEGE 0.25° globale' },
  ukmo_seamless: { dir: 'ukmo_global_deterministic_10km', member: 'UKMO globale 10 km' },
  italia_meteo_arpae_icon_2i: { dir: 'italia_meteo_arpae_icon_2i', member: 'ICON-2I 2.2 km' },
}

/** Una sola lettura per sessione: i meta cambiano ogni 6 ore. */
let cache = null

export async function fetchModelRuns(signal) {
  if (cache) return cache

  const entries = await Promise.all(
    Object.entries(MODEL_SOURCES).map(async ([id, src]) => {
      try {
        const res = await fetch(`${META}/${src.dir}/static/meta.json`, { signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const m = await res.json()
        return [
          id,
          {
            member: src.member,
            initialised: m.last_run_initialisation_time * 1000,
            available: m.last_run_availability_time * 1000,
            dataEnd: m.data_end_time * 1000,
            updateIntervalHours: Math.round(m.update_interval_seconds / 3600),
            stepHours: Math.round(m.temporal_resolution_seconds / 3600),
          },
        ]
      } catch {
        return [id, null] // un meta mancante non deve far cadere gli altri
      }
    }),
  )

  const runs = Object.fromEntries(entries)
  if (Object.values(runs).some(Boolean)) cache = runs
  return runs
}

/** "corsa 06Z" — le corse si identificano con l'ora UTC di inizializzazione. */
export function runLabel(ms) {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}Z del ${d.getUTCDate()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Età della corsa in ore, per segnalare un modello fermo da troppo. */
export function runAgeHours(ms) {
  return (Date.now() - ms) / 3_600_000
}
