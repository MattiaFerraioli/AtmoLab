import { useEffect, useMemo, useRef, useState } from 'react'
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
import { TILE_ATTRIB } from '../lib/constants'
import { fmtDayHour, nf, windDir } from '../lib/format'
import { SEVERITY_COLORS, SEVERITY_LABELS, zoneSpecOf } from '../lib/hazards'
import { AGREEMENT_COUNT, fractionText } from '../lib/agreement'
import { FIELD_PAD, buildZones } from '../lib/zones'
import { DragControl, LockOverlay } from './MapLock'
import { useIsTouch, useRadar } from '../lib/hooks'
import { RADAR_ATTRIB, radarTileUrl } from '../lib/radar'

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
 * Strato radar che cambia fotogramma senza sfarfallare.
 *
 * Rifare il layer a ogni aggiornamento — o chiamare `setUrl`, che internamente
 * ridisegna — svuota le tile e le riscarica: per un istante la pioggia sparisce
 * dalla mappa. Qui il fotogramma nuovo viene aggiunto trasparente e scoperto
 * solo quando ha finito di caricare, e il vecchio si toglie dopo. Se le tile
 * non arrivano (rete assente, prodotto mancante) resta appeso un layer
 * invisibile e in mappa continua a vedersi il fotogramma precedente: meglio un
 * dato di cinque minuti fa che il vuoto.
 */
function RadarLayer({ url, opacity }) {
  const map = useMap()
  const shown = useRef(null)

  useEffect(() => {
    if (!url) return undefined
    const layer = L.tileLayer(url, {
      opacity: 0,
      zIndex: 350,
      attribution: RADAR_ATTRIB,
      /* Il radar è pubblicato solo dallo zoom 5 al 7: oltre, S3 risponde 403
         con un XML e Chrome lo blocca (ERR_BLOCKED_BY_ORB), quindi niente
         tile e nessun errore visibile. Con questi limiti Leaflet ingrandisce
         l'ultima disponibile invece di chiedere livelli inesistenti. */
      minNativeZoom: 5,
      maxNativeZoom: 7,
    })
    const reveal = () => {
      layer.setOpacity(opacity)
      if (shown.current && shown.current !== layer) map.removeLayer(shown.current)
      shown.current = layer
    }
    layer.on('load', reveal)
    layer.addTo(map)

    return () => {
      layer.off('load', reveal)
      if (shown.current === layer) shown.current = null
      map.removeLayer(layer)
    }
  }, [url, opacity, map])

  return null
}

/**
 * Inquadra l'area analizzata e ci costruisce attorno un recinto.
 *
 * `invalidateSize()` prima del fit, altrimenti al primo montaggio il
 * contenitore ha ancora dimensione zero e `fitBounds` calcola uno zoom
 * sbagliato.
 *
 * Poi due limiti: lo zoom di partenza diventa il MINIMO, così non si può
 * allargare oltre l'area calcolata, e `maxBounds` impedisce di trascinare
 * fuori. Si ingrandisce e si gira dentro il quadrato, non se ne esce: là
 * fuori non ci sono dati, e prenderne costerebbe ~130 chiamate pesate a tile.
 *
 * Il minimo va azzerato PRIMA di ogni nuovo fit: al ridimensionamento del
 * riquadro serve uno zoom diverso, e col vecchio minimo ancora in vigore
 * `fitBounds` non potrebbe scendere.
 */
function FitAndFence({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    const fit = () => {
      map.invalidateSize({ animate: false })
      map.setMinZoom(0)
      /* Nessun margine: il contenitore ha ormai la forma esatta dell'area, e
         un padding rimetterebbe le fasce vuote che si volevano togliere. */
      map.fitBounds(bounds, { padding: [0, 0], animate: false })
      map.setMinZoom(map.getZoom())
      map.setMaxBounds(bounds)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [bounds, map])
  return null
}

/**
 * Segnaposto della località scelta.
 *
 * Serve da quando la griglia è agganciata al reticolo fisso: il nodo più
 * vicino può stare fino a 24 km, quindi il centro della cella NON è dove sei
 * tu, e senza un riferimento la mappa si legge male. È il punto vero, non
 * quello arrotondato.
 *
 * Non interattivo di proposito: sotto ci sono i rettangoli invisibili che
 * aprono il dettaglio della cella, e un segnaposto cliccabile creerebbe un
 * buco morto proprio sulla località.
 */
const hereIcon = L.divIcon({
  className: '',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<div style="
    position:absolute; transform:translate(-50%,-50%);
    width:13px; height:13px; border-radius:50%;
    background:#fff; border:3px solid #2a78d6;
    box-shadow:0 0 0 2px rgba(0,0,0,.35), 0 1px 5px rgba(0,0,0,.5);
  "></div>`,
})

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
  /* Radar spento all'apertura: è osservazione, non fa parte della previsione
     che la sezione racconta, e acceso interroga la DPC ogni cinque minuti. */
  const [radarOn, setRadarOn] = useState(false)
  const radarTime = useRadar(radarOn)
  /* Su touch il trascinamento di Leaflet cattura lo scorrimento della pagina:
     la mappa nasce ferma e si attiva con un tocco. Su mouse non serve. */
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
   * Proporzione del contenitore = proporzione dell'area analizzata.
   *
   * In Mercatore un quadrato in gradi non è un quadrato sullo schermo: a
   * latitudine φ viene disegnato 1/cos(φ) volte più alto che largo (a 45°,
   * 1,41). Con un contenitore di forma diversa, `fitBounds` incastrava il
   * quadrato dentro e lasciava due fasce vuote ai lati — territorio NON
   * analizzato, in bella vista accanto ai dati. Dando al riquadro la stessa
   * forma, i due combaciano: si vede l'area analizzata e nient'altro, senza
   * ritagliarne via i bordi.
   */
  const aspect = useMemo(
    () => Math.cos((origin.latitude * Math.PI) / 180),
    [origin.latitude],
  )

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
    <div
      data-lenis-prevent
      style={{ aspectRatio: aspect }}
      className="relative z-[1] w-full overflow-hidden rounded-2xl border border-hair card-shadow"
    >
      <MapContainer
        center={[origin.latitude, origin.longitude]}
        zoom={7}
        /* Zoom continuo: con lo scatto agli interi il fitBounds inquadrava
           fino al doppio dell'area dei dati, lasciando margini vuoti larghi. */
        zoomSnap={0}
        /* Si può guardare più da vicino, non più da lontano: il minimo è lo
           zoom che inquadra l'area e `maxBounds` tiene il trascinamento dentro
           il quadrato (li imposta FitAndFence). La viscosità piena rende il
           bordo un muro invece che un elastico. La rotellina resta esclusa:
           sopra una mappa alta mezzo schermo ruberebbe lo scorrimento. */
        maxBoundsViscosity={1}
        scrollWheelZoom={false}
        boxZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <VectorBase key={theme} styleUrl={palette.mapStyle} />
        <FitAndFence bounds={bounds} />
        {/* Sopra il fondale, sotto le zone: il rischio previsto deve restare
            leggibile anche con la pioggia osservata accesa. */}
        {radarOn && radarTime && <RadarLayer url={radarTileUrl('VMI', radarTime)} opacity={0.65} />}
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

        <Marker position={[origin.latitude, origin.longitude]} icon={hereIcon} interactive={false} />

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

      <button
        type="button"
        onClick={() => setRadarOn((v) => !v)}
        className={`absolute bottom-8 left-2 z-[500] cursor-pointer rounded-full border px-3 py-1.5 text-[11.5px] font-semibold backdrop-blur-md transition duration-300 ${
          radarOn ? 'border-accent/60 bg-accent/25 text-ink' : 'border-hair bg-surface/75 text-ink-sec hover:bg-surface'
        }`}
        title="Pioggia osservata dal radar della Protezione Civile: è un rilevamento, non una previsione"
      >
        {radarOn
          ? `Radar · ${radarTime ? new Date(radarTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '…'}`
          : 'Radar'}
      </button>
      {locked && <LockOverlay onUnlock={() => setUnlocked(true)} />}
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
    </div>
  )
}
