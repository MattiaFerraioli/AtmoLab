import { hailSize } from './hail'
import { fractionLabel } from './agreement'
import { nf } from './format'

/* ============================================================
   Tre pericoli convettivi sulla stessa griglia
   ------------------------------------------------------------
   Grandine, vento e pioggia si leggono dagli stessi 15 parametri
   già scaricati: cambia solo quale numero guardi. Ogni pericolo
   dichiara come estrarre il proprio valore di picco dalla serie
   oraria, con che soglie diventa severo e come si scrive.

   SCALA COLORE — deliberatamente calda e ordinale
   (giallo → arancio → rosso → viola), la convenzione degli
   outlook convettivi (SPC, ESTOFEX). È una scelta di dominio:
   una rampa a tinta unica sarebbe più ortodossa, ma su mappa
   scura tutte le celle finivano per somigliarsi e il livello non
   si leggeva. Il valore numerico è comunque stampato su ogni
   cella significativa, quindi il colore non porta mai da solo
   l'informazione.
   ============================================================ */

export const SEVERITY_LABELS = ['Trascurabile', 'Basso', 'Moderato', 'Alto', 'Molto alto']

export const SEVERITY_COLORS = ['#6b7280', '#fab219', '#ec835a', '#d03b3b', '#8b3fb5']

/** Severità 0–4 da un valore e quattro soglie crescenti. */
export function severityOf(value, bands) {
  if (value == null || Number.isNaN(value)) return 0
  if (value >= bands[3]) return 4
  if (value >= bands[2]) return 3
  if (value >= bands[1]) return 2
  if (value >= bands[0]) return 1
  return 0
}

/* Fasce di diametro atteso, sulle stesse soglie di hailSize(). Sono l'unica
   scala della grandine: colore della mappa, severità della cella e fascia in
   legenda vengono tutte da qui, così mappa, lista e riepilogo non possono
   più raccontare tre storie diverse. */
const SHIP_ZONE_BANDS = [0.05, 0.35, 0.8, 1.5]

export const hailZoneStep = (ship) => severityOf(ship, SHIP_ZONE_BANDS)

const peakBy = (series, pick) =>
  series.reduce(
    (best, p) => {
      const v = pick(p)
      return v != null && v > best.value ? { value: v, at: p.t, point: p } : best
    },
    { value: 0, at: null, point: null },
  )

export const HAZARDS = [
  {
    id: 'hail',
    label: 'Grandine',
    /* Una grandezza sola: il diametro atteso, che dipende dall'ambiente.
       L'ora di picco è quella con l'ambiente peggiore, non più quella del
       rischio combinato — così il diametro mostrato appartiene davvero
       all'ora e alla cella indicate. Quanto sia probabile che il temporale
       si formi lo dice la probabilità, di fianco e separata. */
    bands: SHIP_ZONE_BANDS,
    metric(series) {
      const peak = peakBy(series, (p) => p.ship)
      const ship = peak.value
      return {
        value: ship,
        at: peak.at,
        ship,
        badge: hailSize(ship).label,
        detail: `SHIP ${nf(ship, 2)}`,
        note: hailSize(ship).note,
      }
    },
    quietText: 'Grandine non attesa',
    hourly: { pick: (p) => p.ship, bands: SHIP_ZONE_BANDS, unit: '', dec: 2, label: 'Diametro atteso (indice SHIP)' },
  },
  {
    id: 'wind',
    label: 'Vento',
    /* Raffica massima prevista, in km/h. Sopra i 90 si entra nel campo dei
       danni strutturali leggeri; il downburst da temporale sta lì. */
    bands: [60, 75, 90, 105],
    metric(series) {
      const peak = peakBy(series, (p) => p.gust)
      // Se il picco cade in un'ora convettiva è un downburst, altrimenti vento sinottico
      const convective = (peak.point?.risk ?? 0) >= 0.05
      return {
        value: peak.value,
        at: peak.at,
        badge: peak.value ? `${Math.round(peak.value / 5) * 5} km/h` : '—',
        detail: convective ? 'nel temporale' : 'vento non temporalesco',
        note: convective ? 'raffica da downburst' : 'raffica di gradiente, non da temporale',
      }
    },
    quietText: 'Nessuna raffica rilevante',
    hourly: { pick: (p) => p.gust, bands: [60, 75, 90, 105], unit: 'km/h', dec: 0, label: 'Raffica' },
  },
  {
    id: 'rain',
    label: 'Pioggia',
    /* Accumulo totale sulla finestra visibile: è quello che allaga.
       L'intensità oraria di punta va nel dettaglio, perché 30 mm in un'ora
       e 30 mm in dodici ore non sono lo stesso evento. */
    bands: [10, 25, 50, 80],
    metric(series) {
      let total = 0
      let peakRate = 0
      let at = null
      for (const p of series) {
        const v = p.precip ?? 0
        total += v
        if (v > peakRate) {
          peakRate = v
          at = p.t
        }
      }
      return {
        value: total,
        at,
        badge: total >= 0.5 ? `${nf(total, total >= 10 ? 0 : 1)} mm` : '—',
        detail: peakRate >= 1 ? `punta ${nf(peakRate, 1)} mm/h` : 'nessun rovescio intenso',
        note: peakRate >= 30 ? 'intensità da nubifragio' : peakRate >= 15 ? 'rovescio intenso' : 'pioggia ordinaria',
      }
    },
    quietText: 'Accumuli irrilevanti',
    /* Soglie orarie, non giornaliere: 20 mm in un'ora è nubifragio, 20 mm in
       un giorno è pioggia normale. */
    hourly: { pick: (p) => p.precip, bands: [1, 4, 10, 20], unit: 'mm/h', dec: 1, label: 'Intensità' },
  },
]

export const hazardById = (id) => HAZARDS.find((h) => h.id === id) ?? HAZARDS[0]

/**
 * Applica un pericolo a tutte le celle già filtrate sul giorno visibile.
 * Restituisce le celle arricchite con value/badge/severity, ordinabili.
 */
export function applyHazard(cells, hazardId) {
  const hazard = hazardById(hazardId)
  return cells.map((c) => {
    const m = hazard.metric(c.series)
    return { ...c, metric: m, severity: severityOf(m.value, hazard.bands) }
  })
}


/* ------------------------------------------------------------
   Zonazione per la mappa.
   Per vento e pioggia la severità È la grandezza mostrata, quindi
   zona ed etichetta coincidono per costruzione. Per la grandine no:
   il colore seguiva il rischio d'innesco ma l'etichetta il diametro,
   e una zona "rischio basso" grande quanto mezzo nord-ovest finiva
   etichettata col diametro del suo punto peggiore. Qui la grandine
   si zona PER FASCIA DI DIAMETRO (stesse soglie di hailSize), così
   ogni zona contiene solo celle della sua fascia; la probabilità
   d'innesco passa nel tratto del contorno (tratteggiato = incerto).
   Da quando la severità della grandine È la fascia di diametro, zona
   e cella usano la stessa scala: `stepOf` qui sotto e `bands` del
   pericolo danno lo stesso numero.
   ------------------------------------------------------------ */

/** Massima frazione d'accordo nella zona: etichetta + valore, o null senza dati. */
function probFromCells(comp) {
  const fracs = comp.map((c) => c.prob).filter((x) => x != null)
  if (!fracs.length) return null
  const frac = Math.max(...fracs)
  return { label: fractionLabel(frac), frac }
}

export function zoneSpecOf(hazard) {
  if (hazard.id === 'hail') {
    return {
      stepOf: (c) => hailZoneStep(c.metric.ship ?? 0),
      valueOf: (c) => c.metric.ship ?? 0,
      labels: ['< 1 cm', '1–2 cm', '2–4 cm', '> 4 cm'],
      /* Probabilità = accordo fra modelli (cell.prob, frazione 0..1), non più
         SHIP × innesco di un run solo. Il massimo della zona decide il tratto. */
      probOf: (comp) => probFromCells(comp),
      legendTitle: 'Diametro',
    }
  }
  return {
    stepOf: (c) => c.severity,
    valueOf: (c) => c.metric.value,
    labels: null, // etichetta = valore massimo reale della zona
    probOf: (comp) => probFromCells(comp),
    legendTitle: 'Rischio',
  }
}
