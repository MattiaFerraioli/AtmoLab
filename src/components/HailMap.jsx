import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DragControl, LockOverlay } from './MapLock'
import { TILE_ATTRIB } from '../lib/constants'
import { fmtDayHour, nf, windDir } from '../lib/format'
import { useIsTouch } from '../lib/hooks'
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../lib/hazards'

/** Quante celle portano l'etichetta: oltre, la mappa diventa illeggibile. */
const MAX_LABELS = 8

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

/** Etichetta col valore vero della cella: il colore da solo non basta a dire "2–3 cm". */
function valueIcon(text, color) {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<span style="
      position:absolute; transform:translate(-50%,-50%); white-space:nowrap;
      background:${color}; color:#fff; font:600 11px/1 system-ui,sans-serif;
      padding:3px 6px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.45);
    ">${text}</span>`,
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

  /* Etichette solo sui MASSIMI LOCALI da "moderato" in su: etichettare tutte le
     celle sopra soglia le faceva accavallare, perché celle adiacenti hanno
     valori simili e distano pochi pixel. Un massimo locale è una cella che non
     ha vicini (8-connessi) con valore più alto. */
  const labelled = useMemo(() => {
    const key = (c) => `${c.row},${c.col}`
    const byCell = new Map(cells.map((c) => [key(c), c]))
    const isLocalMax = (c) => {
      for (let dr = -1; dr <= 1; dr += 1)
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue
          const n = byCell.get(`${c.row + dr},${c.col + dc}`)
          if (n && n.metric.value > c.metric.value) return false
        }
      return true
    }
    return new Set(
      cells
        .filter((c) => c.severity >= 2 && c.metric.badge !== '—' && isLocalMax(c))
        .sort((a, b) => b.metric.value - a.metric.value)
        .slice(0, MAX_LABELS)
        .map((c) => `${c.gridLat},${c.gridLon}`),
    )
  }, [cells])

  return (
    <div className="relative z-[1] h-[320px] overflow-hidden rounded-2xl border border-hair card-shadow sm:h-[440px]">
      <MapContainer
        center={[origin.latitude, origin.longitude]}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer key={theme} url={palette.tiles} attribution={TILE_ATTRIB} maxZoom={19} />
        <FitToCells bounds={bounds} />
        <DragControl enabled={!locked} />

        {cells.map((c) => {
          const color = SEVERITY_COLORS[c.severity]
          const showLabel = labelled.has(`${c.gridLat},${c.gridLon}`)
          return (
            <Rectangle
              key={`${c.gridLat},${c.gridLon}`}
              bounds={[
                [c.gridLat - half, c.gridLon - half],
                [c.gridLat + half, c.gridLon + half],
              ]}
              pathOptions={{
                color,
                weight: c.severity === 0 ? 0.4 : 1.1,
                opacity: c.severity === 0 ? 0.15 : 0.75,
                fillColor: color,
                fillOpacity: c.severity === 0 ? 0.04 : 0.1 + c.severity * 0.12,
              }}
              eventHandlers={{ click: () => onSelectCell?.(c) }}
            >
              <Tooltip sticky>
                <div className="text-[12px] leading-snug">
                  <strong>
                    {hazard.label} · {SEVERITY_LABELS[c.severity]}
                  </strong>
                  <br />
                  {c.metric.badge} · {c.metric.detail}
                  <br />
                  {c.metric.at ? fmtDayHour(c.metric.at) : 'nessun picco'}
                  <br />
                  <span style={{ opacity: 0.7 }}>
                    {c.gridLat.toFixed(2)}°, {c.gridLon.toFixed(2)}°
                  </span>
                </div>
              </Tooltip>
              {showLabel && (
                <Marker
                  position={[c.gridLat, c.gridLon]}
                  icon={valueIcon(c.metric.badge, color)}
                  interactive={false}
                />
              )}
            </Rectangle>
          )
        })}
      </MapContainer>

      {steering?.towardsDeg != null && (
        <div
          className="absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded-lg border border-hair bg-surface/90 px-2 py-1.5 text-[11.5px] font-semibold text-ink backdrop-blur-sm"
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
