/* ============================================================
   Zone stile outlook dalla griglia
   ------------------------------------------------------------
   I quadretti indipendenti non si leggono: gli outlook convettivi
   tracciano POLIGONI di livello, annidati (il livello 2 sta dentro
   l'1, come SPC/ESTOFEX). Qui si ricostruiscono dai 7×7 punti:

   per ogni livello s = 1..4, le celle con severità ≥ s vengono
   raggruppate in componenti connesse (4-adiacenza su riga/colonna)
   e di ogni componente si traccia il contorno seguendo i lati di
   cella non condivisi. Ogni zona porta UNA etichetta, sul massimo.
   ============================================================ */

const keyOf = (r, c) => `${r},${c}`

/** Componenti connesse (4-adiacenza) delle celle che passano il filtro. */
function components(cells, minSeverity) {
  const pool = new Map()
  for (const c of cells) if (c.severity >= minSeverity) pool.set(keyOf(c.row, c.col), c)
  const seen = new Set()
  const out = []
  for (const [k, start] of pool) {
    if (seen.has(k)) continue
    const comp = []
    const queue = [start]
    seen.add(k)
    while (queue.length) {
      const cur = queue.pop()
      comp.push(cur)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = keyOf(cur.row + dr, cur.col + dc)
        if (pool.has(nk) && !seen.has(nk)) {
          seen.add(nk)
          queue.push(pool.get(nk))
        }
      }
    }
    out.push(comp)
  }
  return out
}

/**
 * Contorno di una componente: per ogni cella, i lati il cui vicino è fuori
 * dalla componente, orientati in senso antiorario; poi i segmenti vengono
 * concatenati in anelli. Ne possono uscire più anelli (isole, buchi rari).
 */
function traceRings(comp) {
  const inComp = new Set(comp.map((c) => keyOf(c.row, c.col)))
  // segmenti orientati fra angoli di cella: chiave = angolo di partenza
  const edges = new Map()
  const addEdge = (a, b) => {
    const k = keyOf(...a)
    if (!edges.has(k)) edges.set(k, [])
    edges.get(k).push(b)
  }
  for (const c of comp) {
    const { row: r, col: q } = c
    if (!inComp.has(keyOf(r - 1, q))) addEdge([r, q], [r, q + 1]) // lato sud
    if (!inComp.has(keyOf(r, q + 1))) addEdge([r, q + 1], [r + 1, q + 1]) // est
    if (!inComp.has(keyOf(r + 1, q))) addEdge([r + 1, q + 1], [r + 1, q]) // nord
    if (!inComp.has(keyOf(r, q - 1))) addEdge([r + 1, q], [r, q]) // ovest
  }

  const rings = []
  while (edges.size) {
    const [startKey, targets] = edges.entries().next().value
    const start = startKey.split(',').map(Number)
    const ring = [start]
    let cur = targets.shift()
    if (!targets.length) edges.delete(startKey)
    while (cur && keyOf(...cur) !== startKey) {
      ring.push(cur)
      const k = keyOf(...cur)
      const next = edges.get(k)
      if (!next?.length) break // spezzato: non dovrebbe accadere, ci si ferma
      cur = next.shift()
      if (!next.length) edges.delete(k)
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/**
 * cells: celle arricchite dal pericolo (row, col, gridLat, gridLon, severity,
 * metric). Restituisce zone per livello crescente, ognuna con anelli in
 * coordinate [lat, lon] e l'etichetta posta sulla cella di valore massimo.
 */
export function buildZones(cells, step) {
  if (!cells?.length) return []
  const half = step / 2
  const latMin = Math.min(...cells.map((c) => c.gridLat))
  const lonMin = Math.min(...cells.map((c) => c.gridLon))
  const toLatLng = ([r, q]) => [latMin - half + r * step, lonMin - half + q * step]

  const zones = []
  const labelledCells = new Set()

  // dal livello più alto: l'etichetta della zona più severa vince sulla stessa cella
  for (let level = 4; level >= 1; level -= 1) {
    for (const comp of components(cells, level)) {
      const max = comp.reduce((a, b) => (b.metric.value > a.metric.value ? b : a))
      const maxKey = keyOf(max.row, max.col)
      const label =
        max.metric.badge !== '—' && !labelledCells.has(maxKey)
          ? { at: [max.gridLat, max.gridLon], text: max.metric.badge, severity: max.severity }
          : null
      if (label) labelledCells.add(maxKey)
      zones.push({
        level,
        rings: traceRings(comp).map((ring) => ring.map(toLatLng)),
        label,
      })
    }
  }
  // disegno dal livello basso all'alto, così i contorni severi stanno sopra
  return zones.sort((a, b) => a.level - b.level)
}
