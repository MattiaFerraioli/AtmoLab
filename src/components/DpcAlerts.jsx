import { useEffect, useState } from 'react'
import { Card, Section } from './Ui'
import { LEVEL_META, fetchDpcBulletin, zoneForComune } from '../lib/dpc'

const RISKS = [
  { key: 'temporali', label: 'Temporali' },
  { key: 'idrogeologico', label: 'Idrogeologico' },
  { key: 'idraulico', label: 'Idraulico' },
]

function RiskPill({ label, level }) {
  const meta = LEVEL_META[level]
  const quiet = level === 0
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${meta.color} ${quiet ? 10 : 16}%, transparent)`,
        color: quiet ? 'var(--text-secondary)' : meta.color,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
      {label}
      {!quiet && <span className="font-normal opacity-90">· {meta.label.replace('allerta ', '')}</span>}
    </span>
  )
}

/**
 * Bollettino di criticità DPC per la località corrente. Compare solo per
 * comuni italiani presenti nelle zone di allertamento; fuori Italia o a
 * fetch fallito la sezione non esiste — è un di più, non deve rompere nulla.
 */
export default function DpcAlerts({ location }) {
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
        /* GitHub giù o rate limit: sezione assente */
      })
    return () => {
      dead = true
    }
  }, [isItaly, location.latitude, location.longitude])

  if (!isItaly || !data) return null

  const days = data.days.map((day) => ({ ...day, zone: zoneForComune(day, location.name) }))
  if (days.every((d) => !d.zone)) return null

  const worst = Math.max(...days.map((d) => (d.zone ? Math.max(...RISKS.map((r) => d.zone[r.key])) : 0)))
  const zoneName = days[0].zone?.zone ?? days[1].zone?.zone

  return (
    <Section
      title="Allerte meteo"
      hint={`zona di allertamento ${zoneName} · ${data.name.toLowerCase()}`}
    >
      <Card className="p-4">
        {worst === 0 ? (
          <div className="flex items-center gap-2.5 text-[13.5px] text-ink-sec">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: '#30d158' }} />
            Nessuna allerta per oggi e domani nella zona di {location.name}.
          </div>
        ) : (
          <div className="grid gap-3">
            {days.map((day) => (
              <div key={day.label} className="flex flex-wrap items-center gap-2">
                <span className="w-14 text-[13px] font-semibold">{day.label}</span>
                {day.zone ? (
                  RISKS.map((r) => <RiskPill key={r.key} label={r.label} level={day.zone[r.key]} />)
                ) : (
                  <span className="text-[13px] text-ink-muted">non disponibile</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-[12px] text-ink-muted">
          Fonte:{' '}
          <a
            href="https://github.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-hair underline-offset-2 hover:text-ink-sec"
          >
            Dipartimento della Protezione Civile
          </a>{' '}
          (CC-BY 4.0). L&apos;allerta vale per l&apos;intera zona di allertamento, non per il singolo comune.
        </div>
      </Card>
    </Section>
  )
}
