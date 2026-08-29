/* ============================================================
   Allerte Protezione Civile — lato browser
   ------------------------------------------------------------
   Fonte: open data ufficiale DPC su GitHub (CC-BY 4.0), repo
   pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica.
   Un bollettino al giorno (emissione mediana ~14:30, coda fino
   alle 16:05; un aggiornamento pomeridiano nel 2-7% dei giorni),
   oggi + domani, 187 zone di allertamento con tre rischi e la
   lista dei Comuni: il match con la località è per nome comune,
   niente geometrie.

   DUE PERCORSI, in quest'ordine:

   1. L'ESTRATTO PUBBLICATO (~250 KB), prodotto una volta sola dal
      job schedulato e servito da CDN. Un GET e basta.
   2. Il percorso diretto su GitHub, come ripiego: 2 chiamate alla
      loro API (limite 60/ora PER IP — dietro un CGNAT bastano
      poche persone a esaurirlo e la sezione sparisce per tutte)
      più due TopoJSON da 1,2 MB. Resta perché l'estratto può
      mancare, essere vecchio, o non essere ancora configurato.

   La scelta fra i due non guarda l'orologio ma il CONTENUTO: un
   estratto che non copre più la giornata di oggi viene scartato,
   qualunque sia la sua età.
   ============================================================ */

import { buildBulletin, localDate } from './dpcCore'

export { LEVEL_META, previewUrl } from './dpcCore'

const CACHE_KEY = 'wm.dpc.v2' // v2: ogni giorno porta il bollettino da cui prendere la mappa
const MAX_AGE_MS = 6 * 3600 * 1000

/* Impostato in fase di build. Senza, si va diretti su GitHub: l'app resta
   funzionante anche senza l'estratto configurato. */
const EXTRACT_URL = import.meta.env.VITE_DPC_EXTRACT_URL

/** Copre ancora oggi? Un bollettino di ieri non vale, per quanto recente. */
const coversToday = (data) => Boolean(data?.days?.[1]?.date >= localDate())

/** L'estratto pubblicato, o null se manca, è illeggibile o è scaduto. */
async function fromExtract() {
  if (!EXTRACT_URL) return null
  try {
    const res = await fetch(EXTRACT_URL, { cache: 'no-cache' })
    if (!res.ok) return null
    const data = await res.json()
    return coversToday(data) ? data : null
  } catch {
    return null // rete, CORS, JSON rotto: si passa al ripiego
  }
}

/**
 * Bollettino corrente: { fetchedAt, name, stem, days: [{date, zones}], maps }.
 *
 * Cache locale di 6 ore, ma se quello in cache non copre più oggi si riprova
 * ogni 30 minuti: il bollettino nuovo esce nel primo pomeriggio e non ha senso
 * aspettare la scadenza piena.
 */
export async function fetchDpcBulletin() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached?.days?.[0]?.date) {
      const maxAge = coversToday(cached) ? MAX_AGE_MS : 30 * 60 * 1000
      if (Date.now() - cached.fetchedAt < maxAge) return cached
    }
  } catch {
    /* cache illeggibile: si riscarica */
  }

  /* Il ripiego rifà lo stesso lavoro dell'estratto, mappe comprese: costa
     qualche HEAD in più al browser, ma quello che ne esce ha la stessa forma. */
  const bulletin = (await fromExtract()) ?? (await buildBulletin())
  const data = { ...bulletin, fetchedAt: Date.now() }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* quota piena: funziona lo stesso, senza cache */
  }
  return data
}

const norm = (s) =>
  s
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, "'")
    .trim()

/** Zona di allertamento che contiene il comune (match esatto sul nome). */
export function zoneForComune(day, comune) {
  const c = norm(comune)
  if (!c) return null
  return day.zones.find((z) => z.comuni.some((x) => norm(x) === c)) ?? null
}
