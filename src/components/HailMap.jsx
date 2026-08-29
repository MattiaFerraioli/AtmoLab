import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, Polyline, Rectangle, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
/* MapLibre calcola l'URL del suo worker a runtime (`new URL('./' + nome,
   import.meta.url)`): essendo costruito da una template string, nessun
   bundler può vederlo, quindi il file non finisce mai in dist e il worker
   non parte. Senza worker la mappa disegna sfondo e sprite ma NON chiede
   una sola tile: schermo vuoto, e in produzione pure senza errori in
   console. `?worker&url` fa impacchettare a Vite il worker con tutte le sue
   dipendenze e ci restituisce l'URL vero, da passare a setWorkerUrl(). */
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { DragControl, LockOverlay } from './MapLock'
import { TILE_ATTRIB } from '../lib/constants'
import { fmtDayHour, nf, windDir } from '../lib/format'
import { useIsTouch } from '../lib/hooks'
import { SEVERITY_COLORS, SEVERITY_LABELS, zoneSpecOf } from '../lib/hazards'
import { AGREEMENT_COUNT, fractionText } from '../lib/agreement'
import { FIELD_PAD, buildZones } from '../lib/zones'
import { neighbourTiles } from '../lib/hail'

/**
 * Sfondo della mappa. OpenFreeMap serve tile VETTORIALI, non raster: il
 * fondale lo disegna MapLibre su canvas, montato dal ponte dentro il
 * `tilePane` di Leaflet. Sopra restano i pane normali, quindi zone, marker
 * e tooltip qui sotto non cambiano di una riga.
 *
 * L'import è dinamico perché maplibre-gl pesa quanto tutto il resto del
 * bundle: la sezione temporali parte comunque da un click, un attimo in più
 * sul primo disegno della mappa non si nota, mentre il peso su chi non la
 * apre mai si noterebbe.
 */
/**
 * Etichette in italiano. Lo stile OpenFreeMap mette il nome inglese per primo
 * (`["coalesce", ["get","name_en"], ["get","name"]]`), quindi in Italia usciva
 * Milan, Venice, Turin. Qui si scarica lo stile e si riscrivono i campi di
 * testo perché preferiscano `name:it` e, in mancanza, il nome locale — che in
 * Italia è già l'italiano. Gli scudi stradali usano `ref` e restano com'erano.
 */
async function italianStyle(url) {
  const style = await (await fetch(url)).json()
  for (const layer of style.layers ?? []) {
    const field = layer.layout?.['text-field']
    if (!field || !JSON.stringify(field).includes('name')) continue
    layer.layout['text-field'] = ['coalesce', ['get', 'name:it'], ['get', 'name']]
  }
  return style
}

function VectorBase({ styleUrl }) {
  const map = useMap()

  useEffect(() => {
    let layer = null
    let cancelled = false

    /* Anche il CSS di maplibre viaggia nel chunk pigro: da solo pesava
       +10 KB gzip sul foglio critico, per una mappa che molti non aprono. */
    Promise.all([
      import('maplibre-gl'),
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]).then(([maplibre, mod]) => {
      if (cancelled) return
      maplibre.setWorkerUrl(maplibreWorkerUrl) // prima di creare la mappa
      const maplibreGL = mod.maplibreGL ?? mod.default
      /* Lo stile non dichiara la sua attribuzione: passandola qui il ponte la
         usa al posto di quella (vuota) letta dalle sources. */
      italianStyle(styleUrl).then((style) => {
        if (cancelled) return
        layer = maplibreGL({ style, attributionControl: { customAttribution: TILE_ATTRIB } })
        layer.addTo(map)
      })
    })

    return () => {
      cancelled = true
      if (layer) layer.remove()
    }
  }, [map, styleUrl])

  return null
}

/**
 * La griglia cambia estensione con il preset: la vista deve seguirla.
 * invalidateSize() prima del fit, altrimenti al primo montaggio il container
 * ha ancora dimensione zero e fitBounds calcola uno zoom sbagliato.
 */
function FitToCells({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    const fit = () => {
      map.invalidateSize({ animate: false })
      map.fitBounds(bounds, { padding: [14, 14], animate: false })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [bounds, map])
  return null
}

/** Etichetta di zona: valore sopra, probabilità d'innesco sotto (se nota). */
function valueIcon(text, color, prob) {
  const count = prob ? `${Math.round(prob.frac * AGREEMENT_COUNT)}/${AGREEMENT_COUNT}` : ''
  const text2 = prob ? `Prob. ${prob.label} · ${count}` : ''
  const sub = text2 ? `<div style="font:500 9px/1.1 system-ui;opacity:.85;margin-top:1px">${text2}</div>` : ''
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="
      position:absolute; transform:translate(-50%,-50%); white-space:nowrap; text-align:center;
      background:${color}; color:#fff; font:600 11px/1.1 system-ui,sans-serif;
      padding:3px 6px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.45);
    ">${text}${sub}</div>`,
  })
}

/** Riporta al genitore i confini della vista, a ogni spostamento e zoom. */
function ViewportWatch({ onView }) {
  const map = useMap()
  useEffect(() => {
    const fire = () => onView(map.getBounds())
    map.on('moveend', fire)
    map.on('zoomend', fire)
    fire()
    return () => {
      map.off('moveend', fire)
      map.off('zoomend', fire)
    }
  }, [map, onView])
  return null
}

export default function HailMap({
  cells,
  tiles,
  extending,
  onExtend,
  step,
  origin,
  palette,
  theme,
  steering,
  hazard,
  onSelectCell,
}) {
  const isTouch = useIsTouch()
  const [unlocked, setUnlocked] = useState(false)
  const [view, setView] = useState(null)
  const locked = isTouch && !unlocked
  const half = step / 2

  const bounds = useMemo(() => {
    if (!cells.length) return null
    const lats = cells.map((c) => c.gridLat)
    const lons = cells.map((c) => c.gridLon)
    return [
      [Math.min(...lats) - half, Math.min(...lons) - half],
      [Math.max(...lats) + half, Math.max(...lons) + half],
    ]
  }, [cells, half])

  /**
   * Le tile del reticolo che la vista attuale scopre e che non abbiamo.
   *
   * Non si caricano da sole: ognuna vale ~130 chiamate pesate sulla quota, e
   * un paio di trascinamenti distratti la brucerebbero. Se ce ne sono, compare
   * un pulsante e decide chi guarda.
   */
  const missing = useMemo(() => {
    if (!view || !tiles?.length || !onExtend) return []
    const loaded = new Set(tiles.map((t) => `${t.latitude},${t.longitude}`))
    const seen = new Set()
    const out = []
    for (const t of tiles) {
      for (const n of neighbourTiles(t, step)) {
        const key = `${n.latitude},${n.longitude}`
        if (loaded.has(key) || seen.has(key)) continue
        seen.add(key)
        /* Criterio: il CENTRO della tile deve essere inquadrato. Contare la
           sovrapposizione non funzionava — Leaflet scatta a zoom interi e al
           primo caricamento inquadra fino al doppio dell'area dei dati, così
           le vicine risultavano già "in vista" senza che nessuno avesse mosso
           niente. Il centro dentro lo schermo invece vuol dire che quell'area
           la stai guardando davvero. */
        if (view.contains([n.latitude, n.longitude])) {
          const dLat = n.latitude - view.getCenter().lat
          const dLon = n.longitude - view.getCenter().lng
          out.push({ ...n, far: Math.hypot(dLat, dLon) })
        }
      }
    }
    /* Le più vicine al centro dello schermo per prime, e non più di due per
       volta: ogni tile vale ~130 chiamate pesate, e proporne cinque con un
       pulsante solo significa bruciare mezza giornata di quota per un click
       distratto. */
    return out.sort((a, b) => a.far - b.far).slice(0, 2)
  }, [view, tiles, step, onExtend])

  /* Zone stile outlook: contorni per livello, un'etichetta per zona. */
  const zones = useMemo(() => buildZones(cells, step, zoneSpecOf(hazard)), [cells, step, hazard])

  /* Cornice dell'area analizzata: il rettangolo dei NODI (non delle celle,
     che sporgono di mezzo passo), con gli angoli arrotondati. Serve a dare un
     limite dichiarato alle macchie che arrivano fino in fondo: senza, il
     taglio sembra un difetto di disegno invece che la fine dei dati. */
  const frame = useMemo(() => {
    if (!cells.length) return []
    const lats = cells.map((c) => c.gridLat)
    const lons = cells.map((c) => c.gridLon)
    const pad = step * FIELD_PAD
    const [s0, n0] = [Math.min(...lats) - pad, Math.max(...lats) + pad]
    const [w0, e0] = [Math.min(...lons) - pad, Math.max(...lons) + pad]
    const r = Math.min(step * 0.6, (n0 - s0) / 2, (e0 - w0) / 2)
    const arc = (clat, clon, from) =>
      Array.from({ length: 7 }, (_, i) => {
        const a = from + (i / 6) * (Math.PI / 2)
        return [clat + r * Math.sin(a), clon + r * Math.cos(a)]
      })
    return [
      ...arc(s0 + r, e0 - r, -Math.PI / 2), // angolo sud-est
      ...arc(n0 - r, e0 - r, 0), // nord-est
      ...arc(n0 - r, w0 + r, Math.PI / 2), // nord-ovest
      ...arc(s0 + r, w0 + r, Math.PI), // sud-ovest
    ]
  }, [cells, step])

  return (
    <div data-lenis-prevent className="relative z-[1] h-[320px] overflow-hidden rounded-2xl border border-hair card-shadow sm:h-[440px]">
      <MapContainer
        center={[origin.latitude, origin.longitude]}
        zoom={7}
        /* Zoom continuo: con lo scatto agli interi il fitBounds inquadrava
           fino al doppio dell'area dei dati, lasciando margini vuoti larghi. */
        zoomSnap={0}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <VectorBase key={theme} styleUrl={palette.mapStyle} />
        <FitToCells bounds={bounds} />
        <ViewportWatch onView={setView} />
        <DragControl enabled={!locked} />

        {/* Riempimento e contorno viaggiano separati: il poligono porta solo
            il colore, il tratto lo portano le spezzate, che saltano i pezzi
            appoggiati al bordo della griglia. Là il contorno non esiste, c'è
            solo la fine dei dati — e la dice la cornice qui sotto. */}
        {zones.map((z, zi) => (
          <Polygon
            key={`z${zi}`}
            positions={z.polygon}
            interactive={false}
            pathOptions={{
              stroke: false,
              fillColor: SEVERITY_COLORS[z.level],
              fillOpacity: 0.07 + z.level * 0.05,
            }}
          />
        ))}

        {zones.map((z, zi) =>
          z.outlines.map((line, li) => (
            <Polyline
              key={`o${zi}-${li}`}
              positions={line}
              interactive={false}
              pathOptions={{
                color: SEVERITY_COLORS[z.level],
                weight: 2,
                opacity: 0.9,
                dashArray:
                  z.prob?.label === 'bassa' ? '3 9' : z.prob?.label === 'media' ? '10 7' : null,
                fill: false,
              }}
            />
          )),
        )}

        <Polygon
          positions={frame}
          interactive={false}
          pathOptions={{ color: palette.axis, weight: 1, opacity: 0.55, fill: false }}
        />

        {cells.map((c) => (
          <Rectangle
            key={`${c.gridLat},${c.gridLon}`}
            bounds={[
              [c.gridLat - half, c.gridLon - half],
              [c.gridLat + half, c.gridLon + half],
            ]}
            pathOptions={{ stroke: false, fillColor: '#000', fillOpacity: 0 }}
            eventHandlers={{ click: () => onSelectCell?.(c) }}
          >
            <Tooltip sticky>
              <div className="text-[12px] leading-snug">
                <strong>
                  {hazard.label} ·{' '}
                  {hazard.id === 'hail'
                    ? `chicchi ${c.metric.badge}`
                    : `rischio ${SEVERITY_LABELS[c.severity].toLowerCase()}`}
                </strong>
                {/* Per la grandine il diametro è già nella riga sopra: qui
                    resta solo il dettaglio degli altri pericoli, se c'è. */}
                {c.metric.detail && (
                  <>
                    <br />
                    {c.metric.badge} · {c.metric.detail}
                  </>
                )}
                {c.rotation && (

                  <>
                    {' '}
                    · <strong style={{ color: '#8b3fb5' }}>possibile supercella</strong>
                  </>
                )}
                <br />
                {c.metric.at ? fmtDayHour(c.metric.at) : 'nessun picco'}
                {c.prob != null && (
                  <>
                    <br />
                    {hazard.id === 'hail' ? 'Innesco previsto da' : 'Previsto da'} {fractionText(c.prob)}
                  </>
                )}
              </div>
            </Tooltip>
          </Rectangle>
        ))}

        {zones.map(
          (z, zi) =>
            z.label && (
              <Marker
                key={`l${zi}`}
                position={z.label.at}
                icon={valueIcon(z.label.text, SEVERITY_COLORS[z.label.severity], z.label.prob)}
                interactive={false}
              />
            ),
        )}
      </MapContainer>

      {steering?.towardsDeg != null && (
        <div
          className="absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded-full border border-hair bg-surface/70 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink backdrop-blur-md"
          title="Direzione media di spostamento dei temporali (vento a 500 hPa)"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            style={{ transform: `rotate(${steering.towardsDeg}deg)` }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20V4M6 10l6-6 6 6" />
          </svg>
          {windDir(steering.towardsDeg)} · {nf(steering.speed, 0)} km/h
        </div>
      )}
      {missing.length > 0 && !locked && (
        <button
          type="button"
          onClick={() => onExtend(missing)}
          disabled={extending}
          className="absolute bottom-8 left-1/2 z-[500] -translate-x-1/2 cursor-pointer rounded-full border border-hair bg-surface/85 px-3.5 py-2 text-[12.5px] font-semibold text-ink backdrop-blur-md transition duration-300 hover:bg-surface disabled:cursor-default disabled:opacity-70"
        >
          {extending
            ? 'Carico…'
            : `Estendi l'analisi ${missing.length > 1 ? `(${missing.length} aree)` : 'qui'}`}
        </button>
      )}
      {locked && <LockOverlay onUnlock={() => setUnlocked(true)} />}
    </div>
  )
}
