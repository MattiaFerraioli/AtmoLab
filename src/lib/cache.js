/* ============================================================
   Cache locale delle griglie
   ------------------------------------------------------------
   La griglia dei temporali è la richiesta più pesante dell'app:
   49 località × 15 variabili, che Open-Meteo conta ~74 chiamate,
   più ~59 per quella delle probabilità. Il piano free dà 600
   chiamate al minuto, 5.000 all'ora e 10.000 al giorno, contate
   PER IP: una manciata di ricariche e la sezione si spegne per
   tutti quelli dietro quell'indirizzo.

   Qui la risposta già elaborata viene tenuta da parte, con una
   chiave che contiene la CORSA del modello. Non un TTL a tempo:
   finché la corsa è quella, il dato è esattamente lo stesso che
   risponderebbe l'API, e quando esce la corsa nuova la chiave
   cambia da sé. Niente da indovinare, niente dato stantio.

   IndexedDB e non localStorage: una griglia di tre giorni sono
   ~2 MB di JSON e localStorage si ferma a ~5 MB per tutta l'app.
   Tutto è avvolto in try/catch e in mancanza di IndexedDB (finestra
   anonima, storage negato) le funzioni non fanno nulla: la cache è
   un acceleratore, mai una dipendenza.
   ============================================================ */

const DB_NAME = 'atmolab'
const STORE = 'grids'
const MAX_AGE_MS = 12 * 3600 * 1000

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req
      try {
        req = indexedDB.open(DB_NAME, 1)
      } catch {
        resolve(null)
        return
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    })
  }
  return dbPromise
}

const tx = async (mode, run) => {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    let out = null
    try {
      const t = db.transaction(STORE, mode)
      const store = t.objectStore(STORE)
      run(store, (v) => {
        out = v
      })
      t.oncomplete = () => resolve(out)
      t.onerror = () => resolve(null)
      t.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Il record, o null: { value, at } con `at` = quando è stato scaricato. */
export async function cacheGet(key) {
  const rec = await tx('readonly', (store, set) => {
    const req = store.get(key)
    req.onsuccess = () => set(req.result ?? null)
  })
  if (!rec) return null
  if (Date.now() - rec.at > MAX_AGE_MS) return null
  return { value: rec.value, at: rec.at }
}

/**
 * Salva e fa pulizia dei record scaduti nello stesso giro: senza, una griglia
 * per località visitata resterebbe lì per sempre a occupare spazio.
 */
export async function cacheSet(key, value) {
  await tx('readwrite', (store) => {
    store.put({ key, value, at: Date.now() })
    const cutoff = Date.now() - MAX_AGE_MS
    const req = store.openCursor()
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return
      if (cur.value.at < cutoff) cur.delete()
      cur.continue()
    }
  })
}

/* Richieste in volo, per chiave. Serve contro le corse: all'avvio l'effetto
   può ripartire due o tre volte in rapida successione (arriva la previsione,
   poi arrivano i meta delle corse), e senza questo ognuna controllerebbe la
   cache PRIMA che la precedente abbia risposto — tre miss e tre griglie
   scaricate, cioè tre volte la quota. Chi arriva dopo aspetta la stessa
   promessa. Vale anche per il doppio montaggio di StrictMode in sviluppo. */
const inFlight = new Map()

/**
 * Legge dalla cache, altrimenti scarica e conserva. Restituisce anche QUANDO
 * il dato è stato scaricato davvero, che è l'ora da mostrare in interfaccia:
 * su un colpo di cache "aggiornato ora" sarebbe una bugia.
 */
export async function withCache(key, fetcher, { force = false } = {}) {
  /* Il controllo del registro deve venire PRIMA di qualunque await, altrimenti
     due chiamate ravvicinate restano entrambe in attesa della lettura da
     IndexedDB, mancano entrambe e partono entrambe: il registro le
     intercetterebbe troppo tardi. Qui la registrazione è sincrona. */
  const running = inFlight.get(key)
  if (running) return running

  const job = (async () => {
    const hit = force ? null : await cacheGet(key)
    if (hit) return { data: hit.value, at: hit.at, cached: true }
    const data = await fetcher()
    cacheSet(key, data) // non atteso: fallire qui non è un errore
    return { data, at: Date.now(), cached: false }
  })().finally(() => inFlight.delete(key))

  inFlight.set(key, job)
  return job
}
