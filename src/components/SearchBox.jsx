import { useCallback, useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/api'
import { flag } from '../lib/format'
import { useClickOutside, useDebounced } from '../lib/hooks'

export default function SearchBox({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(-1)
  const [loading, setLoading] = useState(false)
  const debounced = useDebounced(query, 220)
  const inputRef = useRef(null)

  const close = useCallback(() => setOpen(false), [])
  const wrapRef = useClickOutside(close)

  useEffect(() => {
    const term = debounced.trim()
    if (term.length < 2) {
      setResults([])
      setOpen(false)
      setError(null)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    searchPlaces(term, ctrl.signal)
      .then((r) => {
        setResults(r)
        setCursor(-1)
        setError(null)
        setOpen(true)
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setError(e.message)
        setResults([])
        setOpen(true)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [debounced])

  function choose(place) {
    if (!place) return
    onPick({
      name: place.name,
      country: place.country,
      country_code: place.country_code,
      admin1: place.admin1,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    })
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => {
        const next = c + (e.key === 'ArrowDown' ? 1 : -1)
        return Math.max(0, Math.min(results.length - 1, next))
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[cursor >= 0 ? cursor : 0])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 sm:max-w-[440px]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Cerca città"
          autoComplete="off"
          spellCheck={false}
          aria-label="Cerca località"
          className="w-full rounded-full bg-fill py-2.5 pl-9 pr-4 text-ink outline-none transition duration-300 placeholder:text-ink-muted hover:bg-ink/15 focus:bg-surface focus:shadow-md focus:ring-2 focus:ring-accent/50"
        />

        {open && (
          <div data-lenis-prevent className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[340px] overflow-auto glass rounded-[16px]">
            {error ? (
              <div className="p-3 text-[13.5px] text-[#d03b3b]">Errore ricerca: {error}</div>
            ) : results.length ? (
              results.map((r, i) => (
                <button
                  key={`${r.id}-${i}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(r)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                    i === cursor ? 'bg-accent/12' : ''
                  }`}
                >
                  <span className="text-lg leading-none">{flag(r.country_code)}</span>
                  <span className="min-w-0">
                    <span className="font-semibold">{r.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {[r.admin1, r.country].filter(Boolean).join(' · ')}
                      {r.population ? ` · ${r.population.toLocaleString('it-IT')} ab.` : ''}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="p-3 text-[13.5px] text-ink-muted">
                {loading ? 'Ricerca…' : 'Nessun risultato.'}
              </div>
            )}
          </div>
      )}
    </div>
  )
}
