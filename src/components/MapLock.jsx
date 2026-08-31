import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Su touch il drag di Leaflet cattura lo scroll: la pagina si blocca appena il
 * dito passa sopra la mappa. La mappa nasce quindi bloccata e si sblocca con un
 * tocco esplicito — su mouse non serve, il drag non compete con lo scroll.
 */
export function DragControl({ enabled }) {
  const map = useMap()
  useEffect(() => {
    if (enabled) {
      map.dragging.enable()
      map.touchZoom.enable()
    } else {
      map.dragging.disable()
      map.touchZoom.disable()
    }
  }, [enabled, map])
  return null
}

export function LockOverlay({ onUnlock }) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      className="absolute inset-0 z-[500] flex items-end justify-center bg-black/15 pb-6 text-[13px] font-semibold text-white backdrop-blur-[1px]"
    >
      <span className="rounded-full bg-black/70 px-3.5 py-2">Toccare per attivare la mappa</span>
    </button>
  )
}
