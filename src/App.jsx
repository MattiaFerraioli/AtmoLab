import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBar from './components/TopBar'
import CurrentHero from './components/CurrentHero'
import DailyStrip from './components/DailyStrip'
import HourlyChart from './components/HourlyChart'
import ModelCompare from './components/ModelCompare'
import HailRisk from './components/HailRisk'
import EnsemblePanel from './components/EnsemblePanel'
import { Card, DayFilterBar, Message, Section, Segmented } from './components/Ui'
import { fetchAirQuality, fetchForecast, fetchHailGrid, fetchModelComparison, fetchProbGrid, reverseGeocode } from './lib/api'
import Modal from './components/Modal'
import PrivacyContent from './components/PrivacyContent'
import { DEFAULT_LOCATION, DEFAULT_MODELS, MAX_MODELS, MODELS } from './lib/constants'
import { HAIL_GRID, ICON2I_MODEL, MAX_HAIL_OFFSET, buildGrid, gridFitsIcon2i, mergeTiles, snapToLattice, summariseCells } from './lib/hail'
import { cacheGet, withCache } from './lib/cache'
import { agreementCells } from './lib/agreement'
import { useDpcAlert } from './components/DpcAlerts'
import { fmtLong, fmtTime } from './lib/format'
import { useHideOnScroll, useIsMobile, useLocalStorage, useModelRuns, useSmoothScroll, useTheme } from './lib/hooks'

/* Vicinanza, non uguaglianza: la stessa città arriva con coordinate diverse
   a seconda della strada (geocoding vs GPS) — 0,03° ≈ 3 km. */
const sameSpot = (a, b) =>
  a && b && Math.abs(a.latitude - b.latitude) < 0.03 && Math.abs(a.longitude - b.longitude) < 0.03

/** Ora dell'ultimo scaricamento di una sezione: da PWA installata è l'unico
 *  segnale che il service worker sta servendo una risposta dalla cache. */
const Stamp = ({ at }) => <span className="tnum text-[12px] text-ink-muted">Aggiornato {fmtTime(at)}</span>

/* La vista d'insieme sugli ensemble resta nel codice ma fuori dall'interfaccia:
   finché non è affidabile, la sezione temporali mostra solo la previsione. */
const SHOW_ENSEMBLE_TAB = false

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

/**
 * Scarica UNA tile del reticolo: valori e, se riesce, accordo fra modelli.
 *
 * Le due griglie vanno in serie e non in parallelo: insieme esaurirebbero la
 * quota al minuto. L'accordo è un di più — se fallisce restano i valori, e le
 * celle semplicemente non mostrano la probabilità.
 */
async function fetchTile({ centre, days, tz, hiRes, run, force }) {
  const points = buildGrid(centre, HAIL_GRID.step)
  const base = `${centre.latitude},${centre.longitude}:${days}:${hiRes ? 'icon2i' : 'blend'}:${tz}:${run}`
  const { data: cells, at } = await withCache(
    `hail:v1:${base}`,
    () =>
      fetchHailGrid(points, days, tz, hiRes ? ICON2I_MODEL : null).then((r) =>
        summariseCells(r, points),
      ),
    { force },
  )
  let agreement = null
  try {
    agreement = (
      await withCache(
        `prob:v1:${base}`,
        () => fetchProbGrid(points, days, tz).then(agreementCells),
        { force },
      )
    ).data
  } catch {
    /* la probabilità è opzionale: senza, restano i valori */
  }
  return { cells, agreement, at }
}

export default function App() {
  const { theme, toggle: toggleTheme, palette } = useTheme()
  useSmoothScroll()
  const heroRef = useRef(null)
  const isMobile = useIsMobile()
  const barHidden = useHideOnScroll(isMobile, heroRef)

  const [location, setLocation] = useLocalStorage('location', DEFAULT_LOCATION)
  /* Letto in fase di render, PRIMA che useLocalStorage scriva il valore
     iniziale nel suo effetto: dopo, la chiave esisterebbe sempre e non si
     distinguerebbe più la prima visita da tutte le altre. */
  const firstVisit = useRef(localStorage.getItem('wm.location') === null)
  const dpcAlert = useDpcAlert(location)
  const [favourites, setFavourites] = useLocalStorage('favourites', [])
  const [recent, setRecent] = useLocalStorage('recent', [])

  // Cronologia: ogni località visitata, ultima in testa, senza doppioni vicini.
  useEffect(() => {
    setRecent((prev) => {
      const { name, latitude, longitude, admin1, country, country_code } = location
      const entry = { name, latitude, longitude, admin1, country, country_code }
      return [entry, ...prev.filter((r) => !sameSpot(r, entry))].slice(0, 8)
    })
  }, [location, setRecent])
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
  const runsRef = useRef(null)
  runsRef.current = runs

  /* La griglia aspetta che i meta delle corse abbiano risposto: la chiave di
     cache contiene la corsa, e partire prima vorrebbe dire salvare sotto la
     chiave di ripiego e non ritrovare niente al giro successivo. `useModelRuns`
     restituisce null finché carica e un oggetto (anche vuoto) quando ha finito,
     quindi qui basta guardare che non sia più null. */
  const runsSettled = runs !== null

  const [hailDayOffset, setHailDayOffset] = useLocalStorage('hailDayOffset', 0)
  const [hazardId, setHazardId] = useLocalStorage('hazard', 'hail')
  /* Una tile sola, quella della località: la mappa è ferma e mostra esattamente
     l'area analizzata. Resta una lista perché il motore sa già fondere più tile
     del reticolo — se un giorno servisse un'area più larga, il disegno è pronto
     e cambia solo chi decide quante caricarne. */
  const [hailTiles, setHailTiles] = useState([])
  const hailCells = useMemo(
    () => (hailTiles.length ? mergeTiles(hailTiles.map((t) => t.cells), HAIL_GRID.step) : null),
    [hailTiles],
  )
  const hailAgreement = useMemo(
    () => (hailTiles.some((t) => t.agreement) ? hailTiles.flatMap((t) => t.agreement ?? t.cells.map(() => null)) : null),
    [hailTiles],
  )
  const [hailHiRes, setHailHiRes] = useState(false)
  const [hailLoading, setHailLoading] = useState(true)
  const [hailError, setHailError] = useState(null)
  /* Non persistito e spento all'avvio: la griglia è 49 località × 14 variabili,
     di gran lunga la richiesta più pesante sulla quota Open-Meteo. Su un sito
     pubblico caricarla a ogni visita brucia il piano free in fretta. */
  const [hailEnabled, setHailEnabled] = useState(false)
  const [stormTab, setStormTab] = useState('previsione')
  const [showPrivacy, setShowPrivacy] = useState(false)

  const [updatedAt, setUpdatedAt] = useState(null)
  const [comparisonUpdatedAt, setComparisonUpdatedAt] = useState(null)
  const [hailUpdatedAt, setHailUpdatedAt] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const lastReload = useRef(0) // per distinguere "ricarica chiesta" da un semplice rerun

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

  /* Snapshot deterministico per il confronto nel tempo: i massimi di OGGI
     dalla griglia già scaricata. Solo quando la vista è su oggi — salvare i
     numeri di dopodomani sotto la data di oggi falserebbe la verifica. */
  const detSnapshot = useMemo(() => {
    if (!hailCells || hailTargetDay !== locationToday) return null
    let ship = 0
    let gust = 0
    let rain = 0
    for (const c of hailCells) {
      let cellRain = 0
      for (const p of c.series) {
        if (p.t.slice(0, 10) !== locationToday) continue
        if (p.ship > ship) ship = p.ship
        if ((p.gust ?? 0) > gust) gust = p.gust
        cellRain += p.precip ?? 0
      }
      if (cellRain > rain) rain = cellRain
    }
    return { ship, gust, rain }
  }, [hailCells, hailTargetDay, locationToday])

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

  /* La chiave di cache porta la CORSA del modello, non un tempo di scadenza:
     finché la corsa è quella, l'API risponderebbe gli stessi numeri, e quando
     ne esce una nuova la chiave cambia da sé. Se i meta non sono ancora
     arrivati si ripiega su una finestra di 3 ore. */
  const runKeyFor = useCallback((hiRes) => {
    const known = runsRef.current
    const run = !known
      ? null
      : hiRes
        ? (known[ICON2I_MODEL]?.initialised ?? null)
        : (() => {
            const all = Object.values(known).filter(Boolean).map((r) => r.initialised)
            return all.length ? Math.max(...all) : null
          })()
    return run ?? `~${Math.floor(Date.now() / (3 * 3600 * 1000))}`
  }, [])

  /**
   * Tutto ciò che identifica la griglia da mostrare: dove, quando, con che
   * modello, di quale corsa. Sta qui e non dentro l'effetto perché serve a
   * due cose — scaricare, e sbirciare se ce l'abbiamo già.
   *
   * Senza fuso non si costruisce: entrerebbe nella chiave e cambierebbe
   * all'arrivo della previsione, facendo scaricare la griglia due volte.
   */
  const hailKey = useMemo(() => {
    const tz = forecast?.timezone ?? location.timezone
    if (!tz || !runsSettled || hailDayOutOfRange) return null
    /* Griglia agganciata al reticolo fisso, non centrata sulla località: è
       quello che rende la richiesta identica per tutti quelli della stessa
       zona, e quindi riusabile dalla cache. */
    const centre = snapToLattice(location, HAIL_GRID.step)
    const points = buildGrid(centre, HAIL_GRID.step)
    /* Dentro il dominio ICON-2I ed entro 48 h la griglia usa il modello a
       2,2 km: CAPE, raffiche e pioggia risolti alla scala della cella invece
       che lisciati dal blend globale. Fuori, o oltre, si torna al best-match. */
    const hiRes = gridFitsIcon2i(points, hailDays)
    const run = runKeyFor(hiRes)
    return {
      centre,
      hiRes,
      tz,
      base: `${centre.latitude},${centre.longitude}:${hailDays}:${hiRes ? 'icon2i' : 'blend'}:${tz}:${run}`,
    }
  }, [location, hailDays, hailDayOutOfRange, forecast?.timezone, runsSettled, runKeyFor])

  /**
   * Se la griglia è già in cache, la sezione si apre da sola.
   *
   * Nasceva sempre spenta perché scaricarla è la richiesta più pesante
   * dell'app, e chiedere un click era il modo di non spenderla per chi non la
   * guarda. Ma con il dato già in casa quel click non protegge più niente:
   * chiude il temporale dietro un bottone e basta. Se manca, il bottone resta.
   */
  useEffect(() => {
    if (hailEnabled || !hailKey) return undefined
    let dead = false
    cacheGet(`hail:v1:${hailKey.base}`).then((hit) => {
      if (hit && !dead) setHailEnabled(true)
    })
    return () => {
      dead = true
    }
  }, [hailEnabled, hailKey])

  /* --- rischio grandine su griglia --- */
  useEffect(() => {
    if (!hailEnabled || !hailKey) return undefined
    const { centre, hiRes, tz } = hailKey
    /* Niente AbortController su queste richieste, ed è una scelta.
       `withCache` restituisce a chi arriva dopo LA STESSA promessa di chi era
       già in volo: annullandola per conto proprio, il primo che se ne va la fa
       fallire anche a tutti gli altri — che è esattamente il motivo per cui la
       griglia non compariva più. Le richieste vanno fino in fondo e finiscono
       in cache, utili a chiunque; qui ci si limita a ignorare il risultato se
       nel frattempo è cambiato tutto. */
    let dead = false
    /* Griglia agganciata al reticolo fisso, non centrata sulla località: è
       quello che rende la richiesta identica per tutti quelli della stessa
       zona, e quindi riusabile dalla cache. */
    setHailHiRes(hiRes)
    setHailLoading(true)
    setHailError(null)
    /* Il pulsante di ricarica manuale deve scavalcare la cache, altrimenti non
       ricarica niente — ma solo il giro innescato da lui: senza il confronto
       col valore precedente, dopo una ricarica manuale la cache resterebbe
       scavalcata per tutto il resto della sessione. */
    const force = reloadKey !== lastReload.current
    lastReload.current = reloadKey

    /* Cambiando località o giorno si riparte dalla sola tile centrale: le
       estensioni chieste per la vista precedente non c'entrano più. */
    fetchTile({ centre, days: hailDays, tz, hiRes, run: runKeyFor(hiRes), force })
      .then(({ cells, agreement, at }) => {
        if (dead) return
        setHailTiles([{ centre, cells, agreement }])
        setHailUpdatedAt(at)
        setHailLoading(false)
      })
      .catch((e) => {
        if (dead) return
        setHailTiles([])
        setHailError(
          /minutely api request limit/i.test(e.message)
            ? 'quota API al minuto esaurita — riprova fra un minuto'
            : e.message,
        )
        setHailLoading(false)
      })
    return () => {
      dead = true
    }
    /* `runs` di proposito NON è fra le dipendenze: si legge da un riferimento.
       Fosse una dipendenza, l'arrivo dei meta farebbe ripartire l'effetto e
       riscaricare la griglia. Se non sono ancora arrivati si usa la finestra di
       3 ore, che scade da sé. */
  }, [hailKey, hailEnabled, hailDays, reloadKey, runKeyFor])

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

  /**
   * Prima visita: la posizione si offre, non si strappa.
   *
   * Chiedere il permesso appena la pagina si apre, senza contesto, è il modo
   * migliore per farselo negare — e un rifiuto nel browser è appiccicoso, lo
   * paghi per sempre. Quindi: se il permesso c'è già, si usa in silenzio e
   * l'utente si ritrova a casa propria; se è ancora da chiedere, compare un
   * invito e a chiederlo è il suo click. Se è stato negato, niente.
   */
  const [locateInvite, setLocateInvite] = useState(false)
  useEffect(() => {
    if (!firstVisit.current || !navigator.geolocation) return undefined
    let dead = false
    const offri = () => !dead && setLocateInvite(true)
    if (!navigator.permissions?.query) {
      offri()
      return undefined
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((stato) => {
        if (dead) return
        if (stato.state === 'granted') locate()
        else if (stato.state === 'prompt') offri()
      })
      .catch(offri)
    return () => {
      dead = true
    }
  }, [locate])

  return (
    <>
      <TopBar
        hidden={barHidden}
        theme={theme}
        onToggleTheme={toggleTheme}
        onPick={setLocation}
        onLocate={locate}
        favourites={favourites}
        recent={recent}
        onRemoveFavourite={(f) => setFavourites((prev) => prev.filter((x) => !sameSpot(x, f)))}
        onClearRecent={() => setRecent([])}
        updatedAt={updatedAt}
        dataLoading={!forecast || comparisonLoading}
        /* hailError escluso di proposito: la sezione grandine ha già il suo
           messaggio, e farla lampeggiare qui segnalerebbe un guasto inesistente. */
        dataError={forecastError || comparisonError}
        palette={palette}
        onRefresh={() => setReloadKey((k) => k + 1)}
      />

      <main className="safe-x mx-auto max-w-[1180px] pb-16 [--safe-pad:20px] sm:[--safe-pad:24px]">
        {locateInvite && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-hair bg-surface/70 px-4 py-3 text-[13px] backdrop-blur-md">
            <span className="min-w-[200px] flex-1 text-ink-sec">
              Stai vedendo <strong className="text-ink">{DEFAULT_LOCATION.name}</strong>. Vuoi le
              previsioni per dove sei adesso?
            </span>
            <button
              type="button"
              onClick={() => {
                setLocateInvite(false)
                locate()
              }}
              className="cursor-pointer rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-white transition duration-300 hover:bg-[color-mix(in_srgb,var(--accent)_82%,white)]"
            >
              Usa la mia posizione
            </button>
            <button
              type="button"
              onClick={() => setLocateInvite(false)}
              className="cursor-pointer rounded-full px-3 py-2 text-[13px] font-semibold text-ink-muted transition duration-300 hover:text-ink"
            >
              No, grazie
            </button>
          </div>
        )}
        <div ref={heroRef} className="pt-6">
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
              dpcAlert={dpcAlert}
            />
          )}
        </div>

        <Section
          title="Previsione 14 giorni"
          hint={selectedDay ? 'Clicca di nuovo il giorno per togliere il filtro' : 'Seleziona un giorno per filtrare'}
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
          hint="Temperatura e precipitazione ora per ora"
        >
          <HourlyChart forecast={forecast} palette={palette} selectedDay={selectedDay} />
        </Section>

        <Section
          title="Confronto tra modelli"
          hint="Stessa località, previsioni diverse: differenze tra i modelli"
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
          hint={
            !SHOW_ENSEMBLE_TAB || stormTab === 'previsione'
              ? 'Grandine, raffiche e accumuli: dove, quando, e con che intensità'
              : 'Sperimentale — probabilità dai 31 membri di GFS, incrociata con la previsione'
          }
          action={
            <div className="flex items-center gap-3">
              {stormTab === 'previsione' && hailEnabled && hailUpdatedAt ? <Stamp at={hailUpdatedAt} /> : null}
              {SHOW_ENSEMBLE_TAB ? (
                <Segmented
                  ariaLabel="Vista della sezione temporali"
                  options={[
                    { value: 'previsione', label: 'Previsionale' },
                    { value: 'sperimentale', label: 'Sperimentale' },
                  ]}
                  value={stormTab}
                  onChange={setStormTab}
                />
              ) : null}
            </div>
          }
        >
          {SHOW_ENSEMBLE_TAB && stormTab === 'sperimentale' ? (
            <EnsemblePanel
              location={location}
              timezone={forecast?.timezone ?? location.timezone}
              detSnapshot={detSnapshot}
              detCells={hailCells}
              targetDay={hailTargetDay}
              palette={palette}
              theme={theme}
            />
          ) : !hailEnabled ? (
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[220px] flex-1 text-[13px] text-ink-sec">
                Dove e quando l&apos;area attorno alla località rischia grandine, raffiche e nubifragi.
              </div>
              <button
                onClick={() => setHailEnabled(true)}
                className="cursor-pointer rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-white transition duration-300 hover:bg-[color-mix(in_srgb,var(--accent)_82%,white)]"
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
              targetDay={hailTargetDay}
              dayOffset={hailOffset}
              onDayOffsetChange={setHailDayOffset}
              hazardId={hazardId}
              onHazardChange={setHazardId}
              agreement={hailAgreement}
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
          (CC-BY 4.0) · Modelli ECMWF IFS, NOAA GFS, DWD ICON, Météo-France ARPEGE/AROME,
          UK Met Office, ItaliaMeteo ARPAE ICON-2I. Geocoding Open-Meteo · Qualità dell&apos;aria CAMS · Allerte Dipartimento della Protezione
          Civile (CC-BY 4.0) · Radar-DPC · Mappa OpenFreeMap © OpenMapTiles, dati ©
          OpenStreetMap contributors.
          {/* Staccata dalla fila di attribuzioni: è una voce di navigazione, non
              una fonte, e in mezzo ai punti medi si perderebbe. */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="cursor-pointer font-semibold text-ink-sec transition duration-300 hover:text-ink"
            >
              Privacy
            </button>
          </div>
        </footer>
        {showPrivacy && (
          <Modal title="Privacy" subtitle="Cosa fa e cosa non fa AtmoLab con i tuoi dati" onClose={() => setShowPrivacy(false)} maxWidth={720}>
            <PrivacyContent />
          </Modal>
        )}
      </main>
    </>
  )
}
