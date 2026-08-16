import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DragControl, LockOverlay } from './MapLock'
import { TILE_ATTRIB } from '../lib/constants'
import { useIsTouch } from '../lib/hooks'

/** Pin custom: evita del tutto il problema degli asset PNG di default sotto bundler. */
function pinIcon(color) {
  return L.divIcon({
    className: '',
    iconSize: [28, 38],
    iconAnchor: [14, 36],
    html: `<svg viewBox="0 0 28 38" width="28" height="38">
      <path d="M14 37C14 37 26 22.5 26 14A12 12 0 1 0 2 14c0 8.5 12 23 12 23Z"
            fill="${color}" stroke="rgba(255,255,255,.85)" stroke-width="2"/>
      <circle cx="14" cy="14" r="4.6" fill="rgba(255,255,255,.9)"/>
    </svg>`,
  })
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({
        name: `${e.latlng.lat.toFixed(3)}°, ${e.latlng.lng.toFixed(3)}°`,
        country: '',
        country_code: '',
        admin1: 'Punto sulla mappa',
        latitude: +e.latlng.lat.toFixed(4),
        longitude: +e.latlng.lng.toFixed(4),
      })
    },
  })
  return null
}

function Recenter({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true })
  }, [lat, lon, map])
  return null
}

export default function MapPanel({ location, palette, theme, onPick }) {
  const icon = useMemo(() => pinIcon(palette.series[0]), [palette])
  const isTouch = useIsTouch()
  const [unlocked, setUnlocked] = useState(false)
  const center = [location.latitude, location.longitude]
  const locked = isTouch && !unlocked

  return (
    <div className="relative z-[1] h-[300px] overflow-hidden rounded-2xl border border-hair card-shadow sm:h-[380px]">
      <MapContainer center={center} zoom={8} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer key={theme} url={palette.tiles} attribution={TILE_ATTRIB} maxZoom={19} />
        <Marker position={center} icon={icon} />
        <Recenter lat={location.latitude} lon={location.longitude} />
        <ClickHandler onPick={onPick} />
        <DragControl enabled={!locked} />
      </MapContainer>
      {locked && <LockOverlay onUnlock={() => setUnlocked(true)} />}
    </div>
  )
}
