import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBar from './components/TopBar'
import CurrentHero from './components/CurrentHero'
import DailyStrip from './components/DailyStrip'
import HourlyChart from './components/HourlyChart'
import ModelCompare from './components/ModelCompare'
import HailRisk from './components/HailRisk'
import Favourites from './components/Favourites'
import { Card, DayFilterBar, Message, Section } from './components/Ui'
import { fetchAirQuality, fetchForecast, fetchHailGrid, fetchModelComparison, reverseGeocode } from './lib/api'
import { DEFAULT_LOCATION, DEFAULT_MODELS, MAX_MODELS, MODELS } from './lib/constants'
import { GRIDS, GRID_SIDE, ICON2I_MODEL, MAX_HAIL_OFFSET, buildGrid, gridFitsIcon2i, summariseCells } from './lib/hail'
import { fmtLong, fmtTime } from './lib/format'
import { useLocalStorage, useModelRuns, useTheme } from './lib/hooks'

const sameSpot = (a, b) => a && b && a.latitude === b.latitude && a.longitude === b.longitude

/** Ora dell'ultimo scaricamento di una sezione: da PWA installata è l'unico
 *  segnale che il service worker sta servendo una risposta dalla cache. */
const Stamp = ({ at }) => <span className="tnum text-[12px] text-ink-muted">aggiornato {fmtTime(at)}</span>

const MAX_COMPARE_DAYS = 16 // limite Open-Meteo
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/* Le date si contano nel fuso della LOCALITÀ, non del browser: cercando una
   città dall'altra parte del mondo "oggi" non è lo stesso giorno. */

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 'YYYY-MM-DD' spostata di N giorni. */
function addDays(base, offset) {
  const d = new Date(`${base}T12:00`)
  d.setDate(d.getDate() + offset)
  return isoDate(d)
}

/** Giorni interi fra due date 'YYYY-MM-DD'. */
function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00`) - new Date(`${from}T12:00`)) / 86_400_000)
}

/**
 * Assegna a ogni modello uno slot di colore stabile: chi resta sul grafico non
 * cambia colore quando un altro modello viene tolto (il colore segue l'entità,
 * non la posizione nella lista).
 */
function useStableSlots(selected, max) {
  const assigned = useRef(new Map())
  return useMemo(() => {
    const map = assigned.current
    for (const id of [...map.keys()]) if (!selected.includes(id)) map.delete(id)
    const used = new Set(map.values())
    for (const id of selected) {
      if (map.has(id)) continue
      let slot = 0
      while (used.has(slot) && slot < max) slot += 1
      map.set(id, slot % max)
      used.add(slot % max)
    }
    return new Map(map)
  }, [selected, max])
}

export default function App() {
  const { theme, toggle: toggleTheme, palette } = useTheme()

  const [location, setLocation] = useLocalStorage('location', DEFAULT_LOCATION)
  const [favourites, setFavourites] = useLocalStorage('favourites', [])
  const [selected, setSelected] = useLocalStorage('models', DEFAULT_MODELS)
  const [varId, setVarId] = useLocalStorage('variable', 'temperature_2m')
  const [span, setSpan] = useLocalStorage('span', 7)

  const [forecast, setForecast] = useState(null)
  const [air, setAir] = useState(null)
  const [forecastError, setForecastError] = useState(null)

  const [comparison, setComparison] = useState(null)
  const [comparisonLoading, setComparisonLoading] = useState(true)
  const [comparisonError, setComparisonError] = useState(null)

  // Filtro giorno: volutamente non persistito, è una vista temporanea.
  const [selectedDay, setSelectedDay] = useState(null)
  const runs = useModelRuns()

  const [hailGrid, setHailGrid] = useLocalStorage('hailGrid', 'region')
  const [hailDayOffset, setHailDayOffset] = useLocalStorage('hailDayOffset', 0)
  const [hazardId, setHazardId] = useLocalStorage('hazard', 'hail')
  const [hailCells, setHailCells] = useState(null)
  const [hailHiRes, setHailHiRes] = useState(false)
  const [hailLoading, setHailLoading] = useState(true)
  const [hailError, setHailError] = useState(null)
  /* Non persistito e spento all'avvio: la griglia è 49 località × 14 variabili,
     di gran lunga la richiesta più pesante sulla quota Open-Meteo. Su un sito
     pubblico caricarla a ogni visita brucia il piano free in fretta. */
  const [hailEnabled, setHailEnabled] = useState(false)

  const [updatedAt, setUpdatedAt] = useState(null)
  const [comparisonUpdatedAt, setComparisonUpdatedAt] = useState(null)
  const [hailUpdatedAt, setHailUpdatedAt] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const slots = useStableSlots(selected, MAX_MODELS)

  // La selezione salvata può contenere modelli non più in elenco: vanno tolti,
  // altrimenti occupano uno slot di colore senza comparire nel grafico.
  useEffect(() => {
    const valid = selected.filter((id) => MODELS.some((m) => m.id === id))
    if (valid.length !== selected.length) setSelected(valid.length ? valid : DEFAULT_MODELS)
  }, [selected, setSelected])

  /* --- previsione dashboard --- */
  useEffect(() => {
    const ctrl = new AbortController()
    setForecast(null)
    setForecastError(null)
    Promise.all([fetchForecast(location, ctrl.signal), fetchAirQuality(location, ctrl.signal)])
      .then(([f, a]) => {
        setForecast(f)
        setAir(a)
        setUpdatedAt(Date.now())
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setForecastError(e.message)
      })
    return () => ctrl.abort()
  }, [location, reloadKey])

  /* Con un giorno selezionato la finestra da scaricare non è più lo span
     scelto, ma quanto serve per arrivare a quel giorno. */
  const locationToday = forecast?.current?.time?.slice(0, 10) ?? isoDate(new Date())
  const dayOffset = selectedDay ? daysBetween(locationToday, selectedDay) : null
  const compareDays = selectedDay ? clamp(dayOffset + 1, 1, MAX_COMPARE_DAYS) : span

  /* La grandine guarda sempre un giorno solo: quello scelto nella striscia, se
     c'è, altrimenti quello del selettore della sezione — che parte da oggi. */
  const hailOffset = selectedDay ? dayOffset : hailDayOffset
  const hailDayOutOfRange = hailOffset > MAX_HAIL_OFFSET || hailOffset < 0
  const hailDays = clamp(hailOffset + 1, 1, MAX_HAIL_OFFSET + 1)
  const hailTargetDay = selectedDay ?? addDays(locationToday, hailDayOffset)

  /* --- confronto modelli: una sola chiamata per tutti i modelli --- */
  useEffect(() => {
    const ctrl = new AbortController()
    setComparisonLoading(true)
    setComparisonError(null)
    fetchModelComparison(location, varId, compareDays, ctrl.signal)
      .then((c) => {
        setComparison(c)
        setComparisonUpdatedAt(Date.now())
        setComparisonLoading(false)
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setComparison(null)
        setComparisonError(e.message)
        setComparisonLoading(false)
      })
    return () => ctrl.abort()
  }, [location, varId, compareDays, reloadKey])

  /* --- rischio grandine su griglia --- */
  useEffect(() => {
    if (!hailEnabled || hailDayOutOfRange) return undefined
    const ctrl = new AbortController()
    const step = GRIDS.find((g) => g.id === hailGrid)?.step ?? 0.7
    const points = buildGrid(location, step)
    /* Dentro il dominio ICON-2I ed entro 48 h la griglia usa il modello a
       2,2 km: CAPE, raffiche e pioggia risolti alla scala della cella invece
       che lisciati dal blend globale. Fuori, o oltre, si torna al best-match. */
    const hiRes = gridFitsIcon2i(points, hailDays)
    setHailHiRes(hiRes)
    setHailLoading(true)
    setHailError(null)
    fetchHailGrid(points, hailDays, forecast?.timezone ?? location.timezone, hiRes ? ICON2I_MODEL : null, ctrl.signal)
      .then((results) => {
        setHailCells(summariseCells(results, points))
        setHailUpdatedAt(Date.now())
        setHailLoading(false)
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setHailCells(null)
        setHailError(e.message)
        setHailLoading(false)
      })
    return () => ctrl.abort()
  }, [location, hailGrid, hailDays, hailDayOutOfRange, hailEnabled, forecast?.timezone, reloadKey])

  // Cambiare località azzera il filtro giorno: le date restano valide ma il
  // contesto no, e un filtro invisibile in cima alla pagina confonde.
  useEffect(() => setSelectedDay(null), [location])

  const isFavourite = favourites.some((f) => sameSpot(f, location))

  const toggleFavourite = useCallback(() => {
    setFavourites((prev) =>
      prev.some((f) => sameSpot(f, location)) ? prev.filter((f) => !sameSpot(f, location)) : [...prev, location],
    )
  }, [location, setFavourites])

  const toggleModel = useCallback(
    (id) => {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev
        return prev.length >= MAX_MODELS ? prev : [...prev, id]
      })
    },
    [setSelected],
  )

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      window.alert('Geolocalizzazione non disponibile in questo browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const latitude = +p.coords.latitude.toFixed(4)
        const longitude = +p.coords.longitude.toFixed(4)
        // Il nome si risolve PRIMA di impostare la località: cambiarlo dopo
        // significherebbe una seconda identità di oggetto e quindi rifare
        // tutte e tre le chiamate.
        const place = await reverseGeocode(latitude, longitude)
        setLocation({
          name: place?.name ?? 'Posizione attuale',
          country: place?.country ?? '',
          country_code: place?.country_code ?? '',
          admin1: place?.admin1 ?? 'GPS',
          latitude,
          longitude,
        })
      },
      () => window.alert('Permesso di geolocalizzazione negato.'),
    )
  }, [setLocation])

  return (
    <>
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onPick={setLocation}
        onLocate={locate}
        updatedAt={updatedAt}
        dataLoading={!forecast || comparisonLoading}
        /* hailError escluso di proposito: la sezione grandine ha già il suo
           messaggio, e farla lampeggiare qui segnalerebbe un guasto inesistente. */
        dataError={forecastError || comparisonError}
        palette={palette}
        onRefresh={() => setReloadKey((k) => k + 1)}
      />

      <main className="safe-x mx-auto max-w-[1180px] px-4 pb-16 sm:px-5">
        <div className="pt-6">
          {forecastError ? (
            <Message tone="error">Impossibile caricare la previsione: {forecastError}</Message>
          ) : (
            <CurrentHero
              location={location}
              forecast={forecast}
              air={air}
              palette={palette}
              isFavourite={isFavourite}
              onToggleFavourite={toggleFavourite}
            />
          )}
        </div>

        <Favourites
          items={favourites}
          onSelect={setLocation}
          onRemove={(f) => setFavourites((prev) => prev.filter((x) => !sameSpot(x, f)))}
        />

        <Section
          title="Previsione 14 giorni"
          hint={selectedDay ? 'clicca di nuovo il giorno per togliere il filtro' : 'seleziona un giorno per filtrare'}
        >
          <DailyStrip forecast={forecast} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
          {selectedDay && (
            <div className="mt-2">
              <DayFilterBar label={fmtLong(`${selectedDay}T12:00`)} onClear={() => setSelectedDay(null)} />
            </div>
          )}
        </Section>

        <Section
          title={selectedDay ? 'Andamento del giorno' : 'Prossime 48 ore'}
          hint="temperatura e precipitazione ora per ora"
        >
          <HourlyChart forecast={forecast} palette={palette} selectedDay={selectedDay} />
        </Section>

        <Section
          title="Confronto tra modelli"
          hint="stessa località, previsioni diverse: differenze tra i modelli"
          action={comparisonUpdatedAt ? <Stamp at={comparisonUpdatedAt} /> : null}
        >
          <ModelCompare
            comparison={comparison}
            runs={runs}
            loading={comparisonLoading}
            error={comparisonError}
            varId={varId}
            onVarChange={setVarId}
            span={span}
            onSpanChange={setSpan}
            selected={selected}
            slots={slots}
            onToggleModel={toggleModel}
            selectedDay={selectedDay}
            palette={palette}
          />
        </Section>

        <Section
          title="Rischio temporali"
          hint="grandine, raffiche e accumuli: dove, quando, e con che intensità"
          action={hailEnabled && hailUpdatedAt ? <Stamp at={hailUpdatedAt} /> : null}
        >
          {!hailEnabled ? (
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[220px] flex-1 text-[13px] text-ink-sec">
                Analisi convettiva su una griglia di {GRID_SIDE}×{GRID_SIDE} punti. È la richiesta più pesante dell&apos;app
                — 49 località per 14 variabili — quindi non parte da sola.
              </div>
              <button
                onClick={() => setHailEnabled(true)}
                className="cursor-pointer rounded-xl border border-accent bg-accent/10 px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-accent/20"
              >
                Calcola rischio temporali
              </button>
            </Card>
          ) : (
            <HailRisk
              location={location}
              cells={hailCells}
              loading={hailLoading}
              error={hailError}
              grid={hailGrid}
              onGridChange={setHailGrid}
              targetDay={hailTargetDay}
              dayOffset={hailOffset}
              onDayOffsetChange={setHailDayOffset}
              hazardId={hazardId}
              onHazardChange={setHazardId}
              hiRes={hailHiRes}
              dayLocked={Boolean(selectedDay)}
              dayOutOfRange={hailDayOutOfRange}
              palette={palette}
              theme={theme}
            />
          )}
        </Section>

        <footer className="safe-bottom mt-9 border-t border-hair pt-4 text-[12.5px] text-ink-muted">
          Dati:{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="text-accent">
            Open-Meteo
          </a>{' '}
          (gratuito, senza API key, CC-BY 4.0) — modelli ECMWF IFS, NOAA GFS, DWD ICON, Météo-France ARPEGE/AROME,
          UK Met Office, ItaliaMeteo ARPAE ICON-2I. Geocoding Open-Meteo · qualità dell&apos;aria CAMS · mappa
          © OpenStreetMap contributors, tiles © CARTO.
        </footer>
      </main>
    </>
  )
}
