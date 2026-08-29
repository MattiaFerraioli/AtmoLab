/* ============================================================
   Bollettino DPC — nucleo condiviso
   ------------------------------------------------------------
   Le stesse funzioni girano in DUE posti: nel browser (percorso
   di ripiego, quando l'estratto pubblicato non c'è o è vecchio) e
   dentro il job schedulato che l'estratto lo produce. Per questo
   qui non si tocca né localStorage né altro che sappia di browser:
   solo `fetch`, che c'è in entrambi i mondi.

   Il lavoro pesante è tutto qui: scoprire il bollettino più
   recente costa 2 chiamate alla API di GitHub (limite 60/ora per
   IP) e i due TopoJSON pesano ~1,2 MB l'uno. Farlo fare a ogni
   dispositivo era lo spreco che l'estratto elimina.
   ============================================================ */

export const REPO = 'pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica'
const API = `https://api.github.com/repos/${REPO}`

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

/**
 * URL del bollettino più recente, via git trees (2 chiamate API).
 * Il nome file ha orario variabile (20260818_1434.json) e la contents API
 * tronca a 1000 voci mentre il repo ne ha migliaia: le trees sono l'unica via.
 */
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

/** Mappa nazionale ufficiale del bollettino (PNG pronto, ~160KB). */
export const previewUrl = (stem, day) =>
  `https://raw.githubusercontent.com/${REPO}/master/files/preview/${stem}_${day}.png`

/**
 * Quali mappe esistono davvero. Gli aggiornamenti pomeridiani pubblicano per
 * "oggi" un PNG segnaposto quasi vuoto (~4 KB contro i ~160 KB di una mappa
 * vera): il peso, letto con una HEAD, distingue la mappa dalla tavola bianca.
 * Nel dubbio si dice di sì, così l'immagine viene mostrata comunque.
 */
export async function mapAvailability(stem) {
  const entries = await Promise.all(
    ['oggi', 'domani'].map(async (k) => {
      try {
        const res = await fetch(previewUrl(stem, k), { method: 'HEAD' })
        const len = Number(res.headers.get('content-length')) || 0
        return [k, res.ok && len > 30000]
      } catch {
        return [k, true]
      }
    }),
  )
  return Object.fromEntries(entries)
}

/** YYYY-MM-DD nel fuso di chi esegue (il job gira in UTC, il browser in locale). */
export const localDate = (d = new Date()) => d.toLocaleDateString('sv')

/**
 * Scarica e riduce il bollettino corrente all'estratto pubblicabile.
 *
 * I giorni portano la DATA REALE, ricavata dal nome del file: "oggi/domani"
 * dentro il bollettino sono etichette fisse al momento dell'emissione, e dopo
 * mezzanotte slittano. L'etichetta la decide chi legge, confrontando le date.
 *
 * L'ora è ricavata a mezzogiorno apposta: costruendola a mezzanotte, un fuso
 * a ovest di Greenwich farebbe retrocedere la data di un giorno.
 */
export async function buildBulletin() {
  const bulletinUrl = await latestBulletinUrl()
  const stem = /(\d{8}_\d{4})\.json$/.exec(bulletinUrl)[1]
  const bulletin = await getJson(bulletinUrl)
  const [today, tomorrow] = await Promise.all([
    getJson(bulletin.today.topo_json),
    getJson(bulletin.tomorrow.topo_json),
  ])
  const issueDate = new Date(`${stem.slice(0, 4)}-${stem.slice(4, 6)}-${stem.slice(6, 8)}T12:00`)
  const nextDate = new Date(issueDate.getTime() + 24 * 3600 * 1000)
  return {
    name: bulletin.name,
    stem,
    days: [
      { date: localDate(issueDate), zones: extractZones(today) },
      { date: localDate(nextDate), zones: extractZones(tomorrow) },
    ],
  }
}
