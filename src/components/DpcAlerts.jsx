import { useEffect, useState } from 'react'
import { LEVEL_META, fetchDpcBulletin, zoneForComune } from '../lib/dpc'

const RISKS = [
  { key: 'temporali', label: 'Temporali' },
  { key: 'idrogeologico', label: 'Idrogeologico' },
  { key: 'idraulico', label: 'Idraulico' },
]

/**
 * Stato allerte DPC per la località: null fuori Italia, senza dati o con
 * comune non riconosciuto — chi lo usa non renderizza niente in quel caso.
 */
export function useDpcAlert(location) {
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
        /* GitHub giù o rate limit: nessuna sezione */
      })
    return () => {
      dead = true
    }
  }, [isItaly, location.latitude, location.longitude])

  if (!isItaly || !data) return null

  const days = data.days
    .map((day) => {
      const zone = zoneForComune(day, location.name)
      return {
        label: day.label,
        zone,
        risks: zone ? RISKS.filter((r) => zone[r.key] > 0).map((r) => ({ ...r, level: zone[r.key] })) : [],
      }
    })
    .filter((d) => d.zone)
  if (!days.length) return null

  return {
    zoneName: days[0].zone.zone,
    bulletinName: data.name,
    days,
    hasAlerts: days.some((d) => d.risks.length > 0),
  }
}

function RiskChip({ label, level }) {
  const meta = LEVEL_META[level]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={{ background: `color-mix(in srgb, ${meta.color} 22%, rgba(8, 12, 24, 0.3))`, color: meta.color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
      {label}
      <span className="font-normal opacity-90">· {meta.label.replace('allerta ', '')}</span>
    </span>
  )
}

/** Fascia allerte dentro il riepilogo: chip per rischio, o LED verde. */
export function DpcAlertBand({ alert }) {
  if (!alert) return null
  return (
    <div className="relative z-[1] mx-4 mb-4 rounded-2xl border border-white/12 bg-black/20 px-3.5 py-2.5 text-[13px] sm:mx-6 sm:mb-5">
      {alert.hasAlerts ? (
        <div className="grid gap-2">
          {alert.days
            .filter((d) => d.risks.length > 0)
            .map((d) => (
              <div key={d.label} className="flex flex-wrap items-center gap-2">
                <span className="w-14 text-[13px] font-semibold">{d.label}</span>
                {d.risks.map((r) => (
                  <RiskChip key={r.key} label={r.label} level={r.level} />
                ))}
              </div>
            ))}
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: '#30d158', boxShadow: '0 0 6px #30d158' }}
          />
          Nessuna allerta per la giornata odierna
        </div>
      )}
    </div>
  )
}

/** Attribuzione: fuori dalla card, piccola, allineata a destra. */
export function DpcSource({ alert }) {
  if (!alert) return null
  return (
    <div className="mt-1.5 text-right text-[11px] leading-snug text-ink-muted">
      Fonte:{' '}
      <a
        href="https://github.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica"
        target="_blank"
        rel="noreferrer"
        className="underline decoration-hair underline-offset-2 hover:text-ink-sec"
      >
        Dipartimento della Protezione Civile
      </a>{' '}
      (CC-BY 4.0) · l&apos;allerta vale per l&apos;intera zona {alert.zoneName}, non per il singolo comune
    </div>
  )
}
