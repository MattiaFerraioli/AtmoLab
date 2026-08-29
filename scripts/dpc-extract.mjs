/* ============================================================
   Estrattore del bollettino DPC → Supabase Storage
   ------------------------------------------------------------
   Gira su GitHub Actions, non nel browser. Fa una volta sola il
   lavoro che prima faceva ogni dispositivo: 2 chiamate alla API
   di GitHub per scoprire il bollettino più recente, i due
   TopoJSON da ~1,2 MB l'uno, e le due HEAD sulle mappe. Ne esce
   un JSON di poche centinaia di KB che l'app scarica e basta.

   Perché su Actions e non su una funzione serverless: il parsing
   dei TopoJSON non sta nei 10 ms di CPU dei Cloudflare Workers
   free, e il cron di Vercel Hobby ammette una sola esecuzione al
   giorno. Qui non ci sono limiti di CPU e gli orari sono liberi.

   Uso:
     SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/dpc-extract.mjs
     node scripts/dpc-extract.mjs --dry-run   (stampa e non pubblica)
   ============================================================ */

import { buildBulletin, mapAvailability } from '../src/lib/dpcCore.js'

const BUCKET = 'dpc'
const OBJECT = 'latest.json'

const dryRun = process.argv.includes('--dry-run')
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env

if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('Mancano SUPABASE_URL o SUPABASE_SERVICE_KEY.')
  process.exit(1)
}

const bulletin = await buildBulletin()
const payload = {
  ...bulletin,
  maps: await mapAvailability(bulletin.stem),
  generatedAt: Date.now(),
}

const body = JSON.stringify(payload)
const zones = payload.days[0].zones.length
const comuni = payload.days[0].zones.reduce((n, z) => n + z.comuni.length, 0)
console.log(
  `bollettino ${payload.stem} · ${payload.days.map((d) => d.date).join(' + ')} · ` +
    `${zones} zone · ${comuni} comuni · mappe ${JSON.stringify(payload.maps)} · ` +
    `${(body.length / 1024).toFixed(0)} KB`,
)

if (dryRun) {
  console.log('--dry-run: niente pubblicazione.')
  process.exit(0)
}

/* upsert: l'oggetto è sempre lo stesso, si sovrascrive. Il bucket è pubblico
   in lettura, quindi il client lo prende con un GET normale e senza chiavi.

   Le due intestazioni servono entrambe. Le chiavi nuove di Supabase
   (`sb_secret_…`) non sono JWT, e lo Storage con il solo `Authorization:
   Bearer` risponde "Invalid Compact JWS": vuole la chiave anche in `apikey`.
   Con le chiavi vecchie in formato JWT funzionano comunque tutte e due.

   La barra finale nell'URL del progetto si toglie: copiandolo dalla
   dashboard viene spesso con lo slash, e concatenando si otterrebbe `//`. */
const base = SUPABASE_URL.replace(/\/+$/, '')
const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${OBJECT}`, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=600',
    'x-upsert': 'true',
  },
  body,
})

if (!res.ok) {
  console.error(`Pubblicazione fallita: HTTP ${res.status} ${await res.text()}`)
  process.exit(1)
}

console.log(`Pubblicato su ${BUCKET}/${OBJECT}.`)
