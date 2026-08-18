import { fmtDayHour, nf } from '../lib/format'

function Tile({ k, value, sub }) {
  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{k}</div>
      <div className="tnum mt-1 text-[22px] font-semibold tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] leading-snug text-ink-sec">{sub}</div>}
    </div>
  )
}

/**
 * Statistiche di divergenza. `spread` = differenza fra il modello che dà il
 * valore più alto e quello che lo dà più basso, ora per ora.
 * Le soglie di accordo sono per variabile (VARS[].agree).
 */
export default function SpreadStats({ times, spread, meta, seriesNames, palette }) {
  const valid = spread.filter((v) => v !== null)
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
  const max = valid.length ? Math.max(...valid) : null
  const iMax = max === null ? -1 : spread.indexOf(max)

  const [tight, loose] = meta.agree
  let level = '–'
  let color = palette.muted
  if (avg !== null) {
    if (avg <= tight) {
      level = 'Alto'
      color = palette.good
    } else if (avg <= loose) {
      level = 'Medio'
      color = palette.warn
    } else {
      level = 'Basso'
      color = palette.critical
    }
  }

  return (
    <div className="grid border-t border-hair sm:grid-cols-2 lg:grid-cols-3">
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Quanto concordano</div>
        <div className="mt-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold"
            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {level}
          </span>
        </div>
        <div className="mt-1 text-[12.5px] leading-snug text-ink-sec">
          Fra il modello più alto e il più basso corrono in media{' '}
          <strong className="tnum font-semibold">
            {nf(avg, meta.dec)} {meta.unit}
          </strong>
        </div>
      </div>

      <Tile
        k="Momento peggiore"
        value={`${nf(max, meta.dec)} ${meta.unit}`}
        sub={iMax >= 0 ? `di distanza fra i modelli, ${fmtDayHour(times[iMax])}` : '–'}
      />

      <Tile k="Modelli a confronto" value={seriesNames.length} sub={seriesNames.join(', ')} />
    </div>
  )
}
