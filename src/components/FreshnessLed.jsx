import { fmtTime } from '../lib/format'
import { useNow } from '../lib/hooks'

const STALE_AFTER_MS = 30 * 60 * 1000

/**
 * Freschezza del NOSTRO fetch, non della corsa del modello: quella sta in
 * ModelRuns. Da PWA installata questo LED è anche l'unico segnale che il
 * service worker sta servendo una risposta vecchia dalla cache.
 */
export default function FreshnessLed({ updatedAt, loading, error, palette, onRefresh }) {
  const now = useNow(30_000)
  const ageMs = updatedAt ? now - updatedAt : Infinity
  const stale = ageMs > STALE_AFTER_MS
  const bad = Boolean(error) || (!loading && stale)

  const color = loading ? palette.warn : bad ? palette.critical : palette.good
  const label = loading
    ? 'Aggiornamento in corso'
    : error
      ? `Aggiornamento non riuscito: ${error}`
      : stale
        ? `Dati non aggiornati da ${Math.round(ageMs / 60000)} min — toccare per aggiornare`
        : `Aggiornato alle ${fmtTime(updatedAt)}`

  return (
    <button
      type="button"
      onClick={onRefresh}
      title={label}
      aria-label={label}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-fill px-3 py-2 text-[12.5px] transition duration-300 hover:bg-fill-hover"
    >
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${bad ? 'led-blink' : ''}`}
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="tnum hidden text-ink-sec sm:inline" aria-live="polite">
        {loading ? 'Aggiorno…' : error ? 'Offline' : updatedAt ? fmtTime(updatedAt) : '–'}
      </span>
    </button>
  )
}
