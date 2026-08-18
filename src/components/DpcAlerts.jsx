import { useEffect, useState } from 'react'
import { LEVEL_META, fetchDpcBulletin, zoneForComune } from '../lib/dpc'

const RISKS = [
  { key: 'temporali', label: 'temporali' },
  { key: 'idrogeologico', label: 'idrogeologico' },
  { key: 'idraulico', label: 'idraulico' },
]

/**
 * Striscia di allerta DPC dentro il riepilogo, stile Apple Weather: esiste
 * solo se il bollettino prevede almeno un'allerta su oggi o domani per la
 * zona del comune. Verde, fuori Italia, comune non trovato o fetch fallito:
 * niente striscia, la hero resta com'è.
 */
export default function DpcAlertStrip({ location }) {
  const [data, setData] = useState(null)
  const isItaly = location.country_code === 'IT'

  useEffect(() => {
    if (!isItaly) return undefined
    let dead = false
    setData(null)
    fetchDpcBulletin()
      .then((d) => {
        if (!dead) setData(d)
      })
      .catch(() => {
        /* GitHub giù o rate limit: striscia assente */
      })
    return () => {
      dead = true
    }
  }, [isItaly, location.latitude, location.longitude])

  if (!isItaly || !data) return null

  const days = data.days
    .map((day) => {
      const zone = zoneForComune(day, location.name)
      const risks = zone ? RISKS.filter((r) => zone[r.key] > 0).map((r) => ({ ...r, level: zone[r.key] })) : []
      return { label: day.label.toLowerCase(), zone, risks }
    })
    .filter((d) => d.risks.length > 0)
  if (!days.length) return null

  const worst = Math.max(...days.flatMap((d) => d.risks.map((r) => r.level)))
  const meta = LEVEL_META[worst]
  const zoneName = days[0].zone.zone

  return (
    <div
      className="relative z-[1] mx-4 mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 rounded-2xl px-3.5 py-2.5 text-[13px] sm:mx-6 sm:mb-5"
      style={{
        background: `color-mix(in srgb, ${meta.color} 26%, rgba(8, 12, 24, 0.35))`,
        border: `1px solid color-mix(in srgb, ${meta.color} 55%, transparent)`,
      }}
    >
      <span className="flex items-center gap-1.5 font-bold">
        <svg viewBox="0 0 24 24" fill={meta.color} className="h-4 w-4 shrink-0" aria-hidden="true">
          <path d="M12 2.5 23 21H1L12 2.5Zm0 6a1.2 1.2 0 0 0-1.2 1.3l.35 4.4a.85.85 0 0 0 1.7 0l.35-4.4A1.2 1.2 0 0 0 12 8.5Zm0 8.1a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
        </svg>
        Allerta {meta.label.replace('allerta ', '')}
      </span>
      {days.map((d) => (
        <span key={d.label} className="opacity-95">
          <span className="font-semibold">{d.label}</span>:{' '}
          {d.risks
            .map((r) => `${r.label}${r.level !== worst ? ` (${LEVEL_META[r.level].label.replace('allerta ', '')})` : ''}`)
            .join(' · ')}
        </span>
      ))}
      <span className="ml-auto basis-full text-right text-[10.5px] leading-snug opacity-70 sm:basis-auto">
        Fonte: Dipartimento della Protezione Civile (CC-BY 4.0) · vale per la zona {zoneName}
      </span>
    </div>
  )
}
