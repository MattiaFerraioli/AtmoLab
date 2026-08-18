import { useCallback, useEffect, useRef, useState } from 'react'
import { PALETTE } from './constants'
import { fetchModelRuns } from './runs'
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
    const ctrl = new AbortController()
    fetchModelRuns(ctrl.signal)
      .then(setRuns)
      .catch(() => setRuns(null))
    return () => ctrl.abort()
  }, [])
  return runs
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
