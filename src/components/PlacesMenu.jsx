import { useCallback, useState } from 'react'
import { flag } from '../lib/format'
import { useClickOutside } from '../lib/hooks'

function Row({ place, onPick, onRemove }) {
  return (
    <div className="group flex items-center">
      <button
        onClick={() => onPick(place)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[13.5px] transition duration-300 hover:bg-fill"
      >
        <span className="shrink-0 text-[15px]">{flag(place.country_code)}</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{place.name}</span>
          {place.admin1 && <span className="block truncate text-[11.5px] text-ink-muted">{place.admin1}</span>}
        </span>
      </button>
      {onRemove && (
        <button
          onClick={() => onRemove(place)}
          title={`Rimuovi ${place.name} dai preferiti`}
          aria-label={`Rimuovi ${place.name} dai preferiti`}
          className="mr-2 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[15px] leading-none text-ink-muted transition duration-300 hover:bg-fill hover:text-ink"
        >
          ×
        </button>
      )}
    </div>
  )
}

function Heading({ children, action }) {
  return (
    <div className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{children}</span>
      {action}
    </div>
  )
}

/**
 * Preferiti + località recenti, dietro il bottone a stella in fondo alla
 * barra di ricerca. I preferiti si aggiungono con la stella nel riepilogo.
 */
export default function PlacesMenu({ favourites, recent, onPick, onRemoveFavourite, onClearRecent }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useClickOutside(close)

  const pick = (place) => {
    onPick(place)
    setOpen(false)
  }

  return (
    <div ref={ref} className="absolute right-1.5 top-1/2 -translate-y-1/2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Preferiti e recenti"
        aria-label="Preferiti e località recenti"
        aria-expanded={open}
        className={`flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full transition duration-300 ${
          open ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-fill-hover hover:text-ink'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-[17px] w-[17px]">
          <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
        </svg>
      </button>

      {open && (
        <div
          data-lenis-prevent
          className="absolute right-0 top-[calc(100%+10px)] z-50 max-h-[380px] w-[280px] overflow-auto rounded-[16px] border border-hair bg-surface py-1 card-shadow"
        >
          <Heading>Preferiti</Heading>
          {favourites.length ? (
            favourites.map((f) => (
              <Row key={`${f.latitude},${f.longitude}`} place={f} onPick={pick} onRemove={onRemoveFavourite} />
            ))
          ) : (
            <div className="px-3 pb-1.5 text-[12.5px] text-ink-muted">
              Nessun preferito: usa la stella accanto al nome della località.
            </div>
          )}

          {recent.length > 0 && (
            <>
              <Heading
                action={
                  <button
                    onClick={onClearRecent}
                    className="cursor-pointer text-[11px] text-ink-muted transition duration-300 hover:text-ink"
                  >
                    svuota
                  </button>
                }
              >
                Recenti
              </Heading>
              {recent.map((r) => (
                <Row key={`${r.latitude},${r.longitude}`} place={r} onPick={pick} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
