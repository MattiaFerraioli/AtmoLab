import { useCallback, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { PALETTE } from './constants'
import { fetchModelRuns } from './runs'
import { fetchLastRadar } from './radar'
import { reverseGeocode } from './api'

/** Stato persistito in localStorage, con fallback silenzioso se non disponibile. */
export function useLocalStorage(key, initial) {
  const storageKey = `wm.${key}`
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      /* quota piena o storage disabilitato: non è un errore fatale */
    }
  }, [storageKey, value])
  return [value, setValue]
}

/** Tema chiaro/scuro, applicato a `data-theme` sul root. */
export function useTheme() {
  const [theme, setTheme] = useLocalStorage('theme', 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // Anche la barra di sistema in PWA installata: con un theme-color fisso
    // resterebbe scura pure passando al tema chiaro.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f5f5f7')
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [setTheme])
  return { theme, toggle, palette: PALETTE[theme] }
}

/** Orologio che forza un render: serve a far scadere lo stato "fresco" da solo. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Media query reattiva, per le scelte che il CSS da solo non può fare. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export const useIsMobile = () => useMediaQuery('(max-width: 639px)')
export const useIsTouch = () => useMediaQuery('(hover: none) and (pointer: coarse)')

export function useDebounced(value, ms = 220) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Corse dei modelli: lettura unica, indipendente dalla località. */
export function useModelRuns() {
  const [runs, setRuns] = useState(null)
  useEffect(() => {
    /* Niente annullamento: il montaggio doppio di StrictMode faceva abortire
       la prima lettura, `fetchModelRuns` inghiottiva l'errore modello per
       modello e restituiva un oggetto con tutti i valori nulli. Chi costruisce
       la chiave di cache della griglia leggeva "corse sconosciute", ripiegava
       sulla finestra di 3 ore, e al giro successivo — con i meta finalmente
       arrivati — usava una chiave diversa: due volte la stessa griglia
       scaricata. Sono poche decine di KB, si lasciano finire. */
    let dead = false
    fetchModelRuns()
      .then((r) => !dead && setRuns(r))
      /* Oggetto vuoto, non null: null significa "sto ancora caricando", e chi
         costruisce la chiave di cache della griglia deve poter distinguere i
         due casi — altrimenti parte con la corsa ignota e salva sotto una
         chiave che al giro dopo non ritrova. */
      .catch(() => !dead && setRuns({}))
    return () => {
      dead = true
    }
  }, [])
  return runs
}

/**
 * Ultimo rilevamento radar disponibile, mentre lo strato è acceso.
 *
 * Si interroga solo quando serve — spento, non parte nessuna richiesta — e si
 * ricontrolla ogni cinque minuti, che è il passo con cui la Protezione Civile
 * pubblica i prodotti. Un errore lascia semplicemente lo strato vuoto: il
 * radar è un di più, non deve poter rompere la sezione.
 */
export function useRadar(enabled, type = 'VMI') {
  const [time, setTime] = useState(null)
  useEffect(() => {
    if (!enabled) {
      setTime(null)
      return undefined
    }
    let dead = false
    const check = () =>
      fetchLastRadar(type)
        .then((t) => !dead && setTime(t))
        .catch(() => !dead && setTime(null))
    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => {
      dead = true
      clearInterval(id)
    }
  }, [enabled, type])
  return time
}

/** Chiude un pannello al click fuori dal riferimento. */
export function useClickOutside(onOutside) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}


/* Cache di modulo per i nomi da coordinate: la cella peggiore cambia a ogni
   switch di pericolo o di giorno, ma spesso è la stessa. Chiave arrotondata
   a 0,1 grado, cioè la scala a cui il nome non cambia comunque. */
const nameCache = new Map()

/** Nome della località di una cella di griglia. null finché non risolve. */
export function useCellName(lat, lon) {
  const key = lat == null ? null : `${lat.toFixed(1)},${lon.toFixed(1)}`
  const [name, setName] = useState(() => (key ? (nameCache.get(key) ?? null) : null))

  useEffect(() => {
    if (!key) {
      setName(null)
      return
    }
    if (nameCache.has(key)) {
      setName(nameCache.get(key))
      return
    }
    let alive = true
    reverseGeocode(lat, lon).then((r) => {
      const label = r?.name ?? null
      nameCache.set(key, label)
      if (alive) setName(label)
    })
    return () => {
      alive = false
    }
  }, [key, lat, lon])

  return name
}

/**
 * Scroll di pagina con inerzia (Lenis). Solo rotella/trackpad: il touch
 * resta nativo. I contenitori con data-lenis-prevent (mappe, tabelle,
 * dropdown) mantengono la rotella nativa.
 */
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const lenis = new Lenis({
      duration: 1.1,
      // Eventi a dominante orizzontale restano nativi: servono alle strisce
      // scrollabili (giorni, tabelle), la pagina non scorre in orizzontale.
      virtualScroll: (e) => Math.abs(e.deltaY) >= Math.abs(e.deltaX),
    })
    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])
}

/**
 * Topbar a scomparsa: oltre il fondo dell'elemento in `limitRef` scendendo
 * si nasconde, risalendo riappare subito. Isteresi di 6px contro il jitter
 * dei micro-eventi di scroll (Lenis ne emette a raffica).
 */
export function useHideOnScroll(enabled, limitRef) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setHidden(false)
      return undefined
    }
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - last
      if (Math.abs(delta) < 6) return
      last = y
      const el = limitRef.current
      const limit = el ? el.offsetTop + el.offsetHeight : 400
      setHidden(delta > 0 && y > limit)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled, limitRef])
  return hidden
}
