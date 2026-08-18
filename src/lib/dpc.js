/* ============================================================
   Allerte Protezione Civile — bollettino di criticità
   ------------------------------------------------------------
   Fonte: open data ufficiale DPC su GitHub (CC-BY 4.0), repo
   pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica.
   Un bollettino al giorno (~14:30-15:30), oggi + domani, 187 zone
   di allertamento con tre rischi (idraulico, temporali,
   idrogeologico) e la lista dei Comuni di ogni zona: il match con
   la località è per nome comune, niente geometrie.

   Pesi misurati: listing trees ~0,8MB + bollettino 5KB + due
   TopoJSON da 1,2MB l'uno. Per questo l'estratto (solo livelli e
   comuni, ~300KB) va in localStorage e si riscarica al più ogni
   6 ore: il costo pieno è una tantum al giorno per dispositivo.

   Il nome file ha orario variabile (20260818_1434.json): l'unico
   modo affidabile di scoprirlo è la git trees API — la contents
   API tronca a 1000 voci e il repo ne ha migliaia.
   ============================================================ */

const REPO = 'pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica'
const API = `https://api.github.com/repos/${REPO}`
const CACHE_KEY = 'wm.dpc'
const MAX_AGE_MS = 6 * 3600 * 1000

const LEVELS = { 'NESSUNA ALLERTA': 0, 'ALLERTA GIALLA': 1, 'ALLERTA ARANCIONE': 2, 'ALLERTA ROSSA': 3 }

/** Colori ufficiali dell'allertamento; lo 0 è un "tutto regolare" discreto. */
export const LEVEL_META = [
  { label: 'nessuna allerta', color: '#8e8e93' },
  { label: 'allerta gialla', color: '#eab308' },
  { label: 'allerta arancione', color: '#f97316' },
  { label: 'allerta rossa', color: '#dc2626' },
]

/** "Ordinaria / ALLERTA GIALLA" → 1 */
function levelOf(text) {
  const m = /NESSUNA ALLERTA|ALLERTA (?:GIALLA|ARANCIONE|ROSSA)/.exec(text ?? '')
  return m ? LEVELS[m[0]] : 0
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`)
  return res.json()
}

/** URL del bollettino più recente, via git trees (2 chiamate API). */
async function latestBulletinUrl() {
  const root = await getJson(`${API}/git/trees/master`)
  const filesSha = root.tree.find((t) => t.path === 'files')?.sha
  if (!filesSha) throw new Error('cartella files assente nel repo DPC')
  const files = await getJson(`${API}/git/trees/${filesSha}`)
  const names = files.tree.map((t) => t.path).filter((p) => /^\d{8}_\d{4}\.json$/.test(p))
  if (!names.length) throw new Error('nessun bollettino nel repo DPC')
  const name = names.sort()[names.length - 1]
  return `https://raw.githubusercontent.com/${REPO}/master/files/${name}`
}

/** TopoJSON del giorno → zone col solo necessario: livelli e comuni. */
function extractZones(topo) {
  const key = Object.keys(topo.objects)[0]
  return topo.objects[key].geometries.map((g) => {
    const p = g.properties
    return {
      zone: p['Nome zona'],
      comuni: p.Comuni ?? [],
      temporali: levelOf(p['Per rischio temporali']),
      idrogeologico: levelOf(p['Per rischio idrogeologico']),
      idraulico: levelOf(p['Per rischio idraulico']),
    }
  })
}

/**
 * Bollettino corrente: { fetchedAt, name, days: [{label, zones}] }.
 * Dal localStorage se scoperto da meno di 6 ore, altrimenti riscaricato.
 */
export async function fetchDpcBulletin() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached && cached.stem && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached
  } catch {
    /* cache illeggibile: si riscarica */
  }

  const bulletinUrl = await latestBulletinUrl()
  const stem = /(\d{8}_\d{4})\.json$/.exec(bulletinUrl)[1]
  const bulletin = await getJson(bulletinUrl)
  const [today, tomorrow] = await Promise.all([
    getJson(bulletin.today.topo_json),
    getJson(bulletin.tomorrow.topo_json),
  ])
  const data = {
    fetchedAt: Date.now(),
    name: bulletin.name,
    stem,
    days: [
      { label: 'Oggi', zones: extractZones(today) },
      { label: 'Domani', zones: extractZones(tomorrow) },
    ],
  }
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

/** Mappa nazionale ufficiale del bollettino (PNG pronto, ~160KB). */
export const previewUrl = (stem, day) =>
  `https://raw.githubusercontent.com/${REPO}/master/files/preview/${stem}_${day}.png`
