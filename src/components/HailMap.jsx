import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, Rectangle, Tooltip, useMap } from 'react-leaflet'
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
import { buildZones } from '../lib/zones'

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
      layer = maplibreGL({
        style: styleUrl,
        attributionControl: { customAttribution: TILE_ATTRIB },
      })
      layer.addTo(map)
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

export default function HailMap({ cells, step, origin, palette, theme, steering, hazard, onSelectCell }) {
  const isTouch = useIsTouch()
  const [unlocked, setUnlocked] = useState(false)
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

  /* Zone stile outlook: contorni per livello, un'etichetta per zona. */
  const zones = useMemo(() => buildZones(cells, step, zoneSpecOf(hazard)), [cells, step, hazard])

  return (
    <div data-lenis-prevent className="relative z-[1] h-[320px] overflow-hidden rounded-2xl border border-hair card-shadow sm:h-[440px]">
      <MapContainer
        center={[origin.latitude, origin.longitude]}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <VectorBase key={theme} styleUrl={palette.mapStyle} />
        <FitToCells bounds={bounds} />
        <DragControl enabled={!locked} />

        {zones.map((z, zi) =>
          z.rings.map((ring, ri) => (
            <Polygon
              key={`z${zi}-${ri}`}
              positions={ring}
              interactive={false}
              pathOptions={{
                color: SEVERITY_COLORS[z.level],
                weight: 2,
                opacity: 0.9,
                dashArray:
                  z.prob?.label === 'bassa' ? '3 9' : z.prob?.label === 'media' ? '10 7' : null,
                fillColor: SEVERITY_COLORS[z.level],
                fillOpacity: 0.07 + z.level * 0.05,
              }}
            />
          )),
        )}

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
                <br />
                {c.metric.badge} · {c.metric.detail}
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
                <br />
                <span style={{ opacity: 0.7 }}>
                  {c.gridLat.toFixed(2)}°, {c.gridLon.toFixed(2)}°
                </span>
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
      {locked && <LockOverlay onUnlock={() => setUnlocked(true)} />}
    </div>
  )
}
