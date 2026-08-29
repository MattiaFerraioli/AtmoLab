/* ============================================================
   Zone stile outlook dalla griglia
   ------------------------------------------------------------
   I quadretti indipendenti non si leggono: gli outlook convettivi
   tracciano POLIGONI di livello, annidati (il livello 2 sta dentro
   l'1, come SPC/ESTOFEX).

   Prima i contorni seguivano i LATI DELLE CELLE, con due passate di
   Chaikin a smussare gli spigoli: restavano comunque agganciati alla
   griglia da 0,35° e si leggevano come blocchi. Il bordo netto di un
   quadrato per giunta dice "qui il fenomeno finisce", che è falso —
   i 49 punti sono campioni di un campo continuo.

   Ora si disegna il campo: i valori vengono interpolati (bicubica
   Catmull-Rom, ritagliata sull'intervallo dei dati) su una maglia SUB
   volte più fitta, e i contorni escono da marching squares
   (`d3-contour`) sulle soglie delle fasce. Il risultato sono macchie
   morbide e annidate, con i buchi al posto giusto.

   NB: l'interpolazione NON aggiunge informazione. I dati restano 49
   punti a ~39 km: le macchie sono larghe, e più fitte di così non
   possono diventare senza pagare quota Open-Meteo. I lati diritti che
   restano sono il bordo della griglia, dove i dati finiscono davvero.
   ============================================================ */

import { contours } from 'd3-contour'

/** Sotto-passi per lato di cella nella maglia interpolata. */
const SUB = 12

/**
 * Margine del dominio oltre i nodi, in frazione di passo di griglia: d3-contour
 * posa il valore di indice i a coordinata i+0.5, quindi il campo sporge di
 * mezzo sotto-passo tutt'attorno. Serve a chi disegna la cornice dell'area,
 * che deve cadere esattamente dove finisce il riempimento.
 */
export const FIELD_PAD = 0.5 / SUB

const keyOf = (r, c) => `${r},${c}`

/**
 * Smussamento di Chaikin su anello chiuso: ogni lato viene sostituito dai
 * punti a 1/4 e 3/4. Due passate: sul campo bicubico i contorni escono già
 * morbidi, questo toglie solo i gradini da mezzo sotto-passo della maglia.
 */
function chaikin(ring, iterations = 2) {
  let pts = ring
  for (let it = 0; it < iterations; it += 1) {
    const out = []
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    pts = out
  }
  return pts
}

/** Come chaikin, ma su una spezzata aperta: gli estremi restano dove sono. */
function chaikinOpen(line, iterations = 2) {
  let pts = line
  for (let it = 0; it < iterations; it += 1) {
    const out = [pts[0]]
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]
      const b = pts[i + 1]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    out.push(pts[pts.length - 1])
    pts = out
  }
  return pts
}

/**
 * Spezzo l'anello nei tratti che NON stanno sul bordo del dominio.
 *
 * Dove la macchia arriva al limite della griglia, il contorno d3 corre lungo
 * il bordo: disegnarlo colorato faceva sembrare quel taglio una proprietà del
 * fenomeno ("qui il rischio finisce"), mentre è solo dove finiscono i dati.
 * Il riempimento resta, il tratto no — al bordo ci pensa una cornice neutra.
 *
 * Un segmento è "di bordo" quando entrambi gli estremi giacciono sullo STESSO
 * lato del dominio: due punti su lati diversi (una diagonale che taglia
 * l'angolo) sono un contorno vero e vanno disegnati.
 */
function openOutlines(ring, n) {
  const eps = 1e-6
  const onEdge = (a, b, get, at) => Math.abs(get(a) - at) < eps && Math.abs(get(b) - at) < eps
  /* Il dominio di d3-contour va da 0 a n, non a n-1: il valore di indice i
     sta a coordinata i+0.5, quindi attorno alla griglia resta mezzo passo di
     bordo. Verificato su una 3×3 tutta alta: l'anello passa per 0 e per 3. */
  const isBoundary = (a, b) =>
    onEdge(a, b, (p) => p[0], 0) ||
    onEdge(a, b, (p) => p[0], n) ||
    onEdge(a, b, (p) => p[1], 0) ||
    onEdge(a, b, (p) => p[1], n)

  // d3 chiude l'anello ripetendo il primo punto: si lavora sui punti unici
  const pts = ring.slice(0, -1)
  const m = pts.length
  if (!m) return []
  const keep = []
  for (let i = 0; i < m; i += 1) keep.push(!isBoundary(pts[i], pts[(i + 1) % m]))
  // nessun contatto col bordo: l'anello resta intero e chiuso
  if (keep.every(Boolean)) return [{ pts, closed: true }]
  if (!keep.some(Boolean)) return [] // tutto sul bordo: niente da disegnare

  // si parte da un segmento che apre un tratto (il precedente è di bordo)
  const start = keep.findIndex((k, i) => k && !keep[(i - 1 + m) % m])
  const lines = []
  let cur = null
  for (let s = 0; s < m; s += 1) {
    const i = (start + s) % m
    if (keep[i]) {
      if (!cur) cur = [pts[i]]
      cur.push(pts[(i + 1) % m])
    } else if (cur) {
      lines.push({ pts: cur, closed: false })
      cur = null
    }
  }
  if (cur) lines.push({ pts: cur, closed: false })
  return lines
}

/**
 * Catmull-Rom su quattro nodi: passa ESATTAMENTE per p1 e p2, quindi il valore
 * sui nodi della griglia resta quello misurato. È la differenza con una
 * sfocatura, che invece li sposterebbe tutti.
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/**
 * Campo interpolato bicubico (Catmull-Rom separabile): da side×side nodi a
 * N×N, con N = (side-1)·SUB+1. Ritorna l'array piatto che d3-contour si
 * aspetta (x scorre per primo).
 *
 * Bicubica e non bilineare perché quest'ultima è continua ma non derivabile
 * sui bordi di cella: i contorni ne uscivano con un angolo netto ogni 39 km,
 * cioè ancora la griglia in trasparenza. La cubica però sovraelonga, e su un
 * prodotto di rischio sovraelongare significa inventare un massimo che
 * nessun modello ha previsto: il risultato viene quindi RITAGLIATO
 * nell'intervallo dei valori davvero presenti nella griglia.
 */
function upsample(grid, side) {
  const n = (side - 1) * SUB + 1
  const out = new Float64Array(n * n)
  const flat = grid.flat()
  const lo = Math.min(...flat)
  const hi = Math.max(...flat)
  const at = (r, c) =>
    grid[Math.min(Math.max(r, 0), side - 1)][Math.min(Math.max(c, 0), side - 1)]

  for (let fy = 0; fy < n; fy += 1) {
    const fr = fy / SUB
    const r1 = Math.min(Math.floor(fr), side - 1)
    const tr = fr - r1
    for (let fx = 0; fx < n; fx += 1) {
      const fc = fx / SUB
      const c1 = Math.min(Math.floor(fc), side - 1)
      const tc = fc - c1
      const col = []
      for (let k = -1; k <= 2; k += 1)
        col.push(catmullRom(at(r1 + k, c1 - 1), at(r1 + k, c1), at(r1 + k, c1 + 1), at(r1 + k, c1 + 2), tc))
      const v = catmullRom(col[0], col[1], col[2], col[3], tr)
      out[fy * n + fx] = Math.min(hi, Math.max(lo, v))
    }
  }
  return { values: out, n }
}

/** Ray casting su un anello in coordinate di maglia. */
function inRing(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Dentro il poligono (anello esterno) e fuori da ogni buco. */
const inPolygon = (poly, x, y) =>
  inRing(poly[0], x, y) && !poly.slice(1).some((hole) => inRing(hole, x, y))

/**
 * cells: celle arricchite dal pericolo (row, col, gridLat, gridLon, severity,
 * metric). Restituisce zone per livello crescente; ogni zona porta i propri
 * poligoni (anello esterno + eventuali buchi) in coordinate [lat, lon] e
 * l'etichetta posata sulla cella di valore massimo che contiene.
 */
export function buildZones(cells, step, spec) {
  if (!cells?.length) return []
  const { valueOf, labels, probOf, bands } = spec
  const side = Math.max(...cells.map((c) => c.row)) + 1
  const latMin = Math.min(...cells.map((c) => c.gridLat))
  const lonMin = Math.min(...cells.map((c) => c.gridLon))

  const grid = Array.from({ length: side }, () => new Array(side).fill(0))
  for (const c of cells) grid[c.row][c.col] = valueOf(c) ?? 0
  const { values, n } = upsample(grid, side)

  /* d3-contour restituisce le coordinate nello spazio degli indici della
     maglia — (x, y) = (colonna, riga) in sotto-passi — ma con il valore di
     indice i posato a coordinata i+0.5 (verificato: su una 3×3 col massimo al
     centro l'anello è il rombo attorno a 1,5). Tolto quel mezzo passo, da lì a
     lat/lon è una scalatura lineare: la griglia è regolare in gradi. */
  const toLatLng = ([x, y]) => [
    latMin + ((y - 0.5) / SUB) * step,
    lonMin + ((x - 0.5) / SUB) * step,
  ]

  const zones = []
  const labelledCells = new Set()
  const placed = [] // posizioni [lat, lon] già occupate da un'etichetta

  // dal livello più alto: l'etichetta della zona più severa vince sulla stessa cella
  for (let level = 4; level >= 1; level -= 1) {
    const multi = contours().size([n, n]).thresholds([bands[level - 1]])(values)
    for (const poly of multi[0]?.coordinates ?? []) {
      /* Le celle dentro il poligono servono a due cose: la probabilità della
         zona (accordo fra modelli) e dove posare l'etichetta. */
      const inside = cells.filter((c) => inPolygon(poly, c.col * SUB + 0.5, c.row * SUB + 0.5))
      if (!inside.length) continue

      // Con etichette per fascia la zona di livello N contiene anche le celle
      // dei livelli superiori: si etichetta con la SUA fascia solo se ne ha.
      const own = labels ? inside.filter((c) => (valueOf(c) ?? 0) < (bands[level] ?? Infinity)) : inside
      const pool = (own.length ? own : inside).slice().sort((a, b) => valueOf(b) - valueOf(a))
      /* Il massimo assoluto può stare nella cella accanto all'etichetta di
         un'altra fascia: si preferisce la migliore cella che non collide,
         e solo in mancanza si accetta la collisione. */
      const clear = (c) =>
        placed.every((p) => Math.hypot(p[0] - c.gridLat, p[1] - c.gridLon) >= step * 1.05)
      const max = pool.find(clear) ?? pool[0]
      const maxKey = keyOf(max.row, max.col)
      const text = labels ? labels[level - 1] : max.metric.badge
      const label =
        text !== '—' && max.metric.badge !== '—' && !labelledCells.has(maxKey)
          ? { at: [max.gridLat, max.gridLon], text, severity: level }
          : null
      if (label) {
        labelledCells.add(maxKey)
        placed.push(label.at)
      }
      const prob = probOf(inside)
      zones.push({
        level,
        prob,
        // anello esterno per primo, poi i buchi: è il formato che Leaflet
        // accetta direttamente in <Polygon positions={...}>. Serve solo per il
        // riempimento, il tratto lo portano le spezzate qui sotto.
        polygon: poly.map((ring) => chaikin(ring.map(toLatLng))),
        outlines: poly
          .flatMap((ring) => openOutlines(ring, n))
          /* Agli angoli del dominio d3 taglia lo spigolo con una diagonale di
             mezzo sotto-passo: non giace su un lato solo, quindi passa per
             contorno vero. È lunga ~1,5 km e sarebbe solo un trattino sospeso
             nell'angolo: si scarta. */
          .filter(({ pts }) => {
            const xs = pts.map((q) => q[0])
            const ys = pts.map((q) => q[1])
            const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
            return span > SUB * 0.25
          })
          .map(({ pts, closed }) => {
            const ll = pts.map(toLatLng)
            /* Anello mai toccato dal bordo: si smussa da chiuso e si richiude,
               altrimenti resterebbe un angolo nel punto di partenza. */
            if (closed) {
              const smooth = chaikin(ll)
              return [...smooth, smooth[0]]
            }
            return chaikinOpen(ll)
          }),
        label: label && { ...label, prob },
      })
    }
  }
  // disegno dal livello basso all'alto, così i contorni severi stanno sopra
  return zones.sort((a, b) => a.level - b.level)
}
