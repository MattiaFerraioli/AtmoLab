import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Rectangle, Tooltip, useMap } from 'react-leaflet'
import { TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DragControl, LockOverlay } from './MapLock'
import { TILE_ATTRIB } from '../lib/constants'
import { useIsTouch } from '../lib/hooks'
import { hailSize, rampFor, riskBand } from '../lib/hail'
import { fmtDayHour, nf, windDir } from '../lib/format'

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
    // Al primo montaggio il container può essere ancora a dimensione zero:
    // finché non si stabilizza, fitBounds calcolerebbe uno zoom troppo basso.
    const observer = new ResizeObserver(fit)
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [bounds, map])
  return null
}

export default function HailMap({ cells, step, origin, palette, theme, steering, onSelectCell }) {
  const ramp = rampFor(theme)
  const isTouch = useIsTouch()
  const [unlocked, setUnlocked] = useState(false)
  const locked = isTouch && !unlocked
  const half = step / 2

  // Memoizzato: un array nuovo a ogni render rilancerebbe il fit di continuo.
  const bounds = useMemo(() => {
    if (!cells.length) return null
    const lats = cells.map((c) => c.gridLat)
    const lons = cells.map((c) => c.gridLon)
    return [
      [Math.min(...lats) - half, Math.min(...lons) - half],
      [Math.max(...lats) + half, Math.max(...lons) + half],
    ]
  }, [cells, half])

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
          const band = riskBand(c.risk)
          const size = hailSize(c.ship)
          return (
            <Rectangle
              key={`${c.gridLat},${c.gridLon}`}
              bounds={[
                [c.gridLat - half, c.gridLon - half],
                [c.gridLat + half, c.gridLon + half],
              ]}
              pathOptions={{
                color: ramp[band.step],
                weight: band.step === 0 ? 0.5 : 1,
                opacity: band.step === 0 ? 0.25 : 0.7,
                fillColor: ramp[band.step],
                fillOpacity: band.step === 0 ? 0.06 : 0.2 + band.step * 0.15,
              }}
              eventHandlers={{ click: () => onSelectCell?.(c) }}
            >
              <Tooltip sticky>
                <div className="text-[12px] leading-snug">
                  <strong>{band.label}</strong>
                  <br />
                  SHIP {nf(c.ship, 2)} · diametro {size.label}
                  <br />
                  {c.when ? fmtDayHour(c.when) : 'nessun picco'}
                  <br />
                  <span style={{ opacity: 0.7 }}>
                    {c.gridLat.toFixed(2)}°, {c.gridLon.toFixed(2)}°
                  </span>
                </div>
              </Tooltip>
            </Rectangle>
          )
        })}
      </MapContainer>
      {/* Spostamento delle celle temporalesche: steering flow a 500 hPa.
          Overlay DOM, non layer Leaflet: non deve ruotare/spostarsi col pan. */}
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
