import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DragControl, LockOverlay } from './MapLock'
import { TILE_ATTRIB } from '../lib/constants'
import { fmtDayHour, nf, windDir } from '../lib/format'
import { useIsTouch } from '../lib/hooks'
import { SEVERITY_COLORS, SEVERITY_LABELS, zoneSpecOf } from '../lib/hazards'
import { buildZones } from '../lib/zones'

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

  /* Zone stile outlook: contorni per livello, un'etichetta per zona. */
  const zones = useMemo(() => buildZones(cells, step, zoneSpecOf(hazard)), [cells, step, hazard])

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
                dashArray: z.dashed ? '7 7' : null,
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
                  {hazard.label} · {SEVERITY_LABELS[c.severity]}
                </strong>
                <br />
                {c.metric.badge} · {c.metric.detail}
                {c.rotation && (
                  <>
                    {' '}
                    · <strong style={{ color: '#8b3fb5' }}>rotaz.</strong>
                  </>
                )}
                <br />
                {c.metric.at ? fmtDayHour(c.metric.at) : 'nessun picco'}
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
                icon={valueIcon(z.label.text, SEVERITY_COLORS[z.label.severity])}
                interactive={false}
              />
            ),
        )}
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
