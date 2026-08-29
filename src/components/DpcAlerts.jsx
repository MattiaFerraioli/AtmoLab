import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LEVEL_META, fetchDpcBulletin, previewUrl, zoneForComune } from '../lib/dpc'

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

  /* Il bollettino porta date fisse: dopo mezzanotte il suo "domani" È oggi.
     Etichetta dalla data reale, e i giorni già passati si buttano. */
  const today = new Date().toLocaleDateString('sv')
  const days = data.days
    .filter((day) => day.date >= today)
    .map((day) => {
      const zone = zoneForComune(day, location.name)
      return {
        label: day.date === today ? 'Oggi' : 'Domani',
        map: day.map ?? null,
        zone,
        risks: zone ? RISKS.filter((r) => zone[r.key] > 0).map((r) => ({ ...r, level: zone[r.key] })) : [],
      }
    })
    .filter((d) => d.zone)
  if (!days.length) return null

  return {
    zoneName: days[0].zone.zone,
    bulletinName: data.name,
    stem: data.stem,
    days,
    hasAlerts: days.some((d) => d.risks.length > 0),
  }
}

/* Il bollettino copre oggi e domani, ma dopo la pubblicazione serale può
   restare il solo domani (o il solo oggi): la frase nomina i giorni che ci
   sono davvero, invece di promettere una copertura che non c'è. */
const quietPhrase = (days) => {
  const names = days.map((d) => d.label.toLowerCase())
  return names.length > 1
    ? `Nessuna allerta per le giornate di ${names.slice(0, -1).join(', di ')} e di ${names.at(-1)}`
    : `Nessuna allerta per la giornata di ${names[0]}`
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
    </span>
  )
}

/** Fascia allerte dentro il riepilogo: chip per rischio, o LED verde. */
export function DpcAlertBand({ alert }) {
  const [showMap, setShowMap] = useState(false)
  if (!alert) return null
  return (
    <div className="relative z-[1] mx-4 mb-4 w-fit max-w-full rounded-2xl border border-white/12 bg-black/20 px-3.5 py-2.5 pr-2 text-[13px] sm:mx-6 sm:mb-5">
      <div className="flex items-start gap-2">
        <div className="grid gap-2 py-0.5">
          {alert.hasAlerts ? (
            alert.days
              .filter((d) => d.risks.length > 0)
              .map((d) => (
                <div key={d.label} className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">Allerte {d.label.toLowerCase()}</span>
                  {d.risks.map((r) => (
                    <RiskChip key={r.key} label={r.label} level={r.level} />
                  ))}
                </div>
              ))
          ) : (
            <div className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: '#30d158', boxShadow: '0 0 6px #30d158' }}
              />
              {quietPhrase(alert.days)}
            </div>
          )}
        </div>

        {alert.stem && (
          <button
            type="button"
            title="Mappa nazionale delle allerte"
            aria-label="Apri la mappa nazionale delle allerte"
            onClick={() => setShowMap(true)}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 transition duration-300 hover:bg-white/15 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-[16px] w-[16px]">
              <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          </button>
        )}
      </div>

      {/* Il DPC non allerta il singolo comune: il livello vale per tutta la
          zona. Va detto, ma sottovoce: è la didascalia della fascia. */}
      <div className="mt-0.5 pr-1.5 text-right text-[10.5px] leading-tight opacity-75">
        {alert.zoneName}
      </div>
      {showMap && <DpcMapModal alert={alert} onClose={() => setShowMap(false)} />}
    </div>
  )
}

/** Popup con la mappa nazionale ufficiale: nessuna espansione della hero. */
function DpcMapModal({ alert, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mappa nazionale delle allerte"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-[20px] border border-hair bg-surface card-shadow"
      >
        <div className="flex items-start gap-3 border-b border-hair p-4 pb-3">
          <div>
            <div className="text-[15px] font-bold">Mappa nazionale delle allerte</div>
            <div className="mt-0.5 text-[12px] text-ink-muted">
              {alert.bulletinName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fill text-[17px] leading-none text-ink transition duration-300 hover:bg-fill-hover"
          >
            ×
          </button>
        </div>
        <div data-lenis-prevent className="grid gap-3 overflow-auto p-4 sm:grid-cols-2">
          {/* Ogni giorno sa da quale bollettino viene la SUA mappa: quella di
              oggi spesso è pubblicata solo nel bollettino di ieri, come
              "domani". Il riquadro di ripiego resta per il caso in cui non
              esista in nessuno dei due. */}
          {alert.days.map((day) => (
            <figure key={day.label}>
              {day.map ? (
                <img
                  src={previewUrl(day.map.stem, day.map.slot)}
                  alt={`Mappa nazionale delle allerte di ${day.label.toLowerCase()}`}
                  className="w-full rounded-xl bg-white"
                />
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-hair p-6 text-center text-[12.5px] text-ink-muted">
                  Mappa di {day.label.toLowerCase()} non ancora pubblicata.
                </div>
              )}
              <figcaption className="mt-1 text-[12px] text-ink-muted">{day.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
