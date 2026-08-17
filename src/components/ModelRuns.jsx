import { useState } from 'react'
import { MODELS } from '../lib/constants'
import { fmtDayHour, nf } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { runAgeHours } from '../lib/runs'

/** Ora locale dell'utente: "oggi alle 14:00", "ieri alle 20:00", "15 ago 08:00". */
function whenLabel(ms) {
  const d = new Date(ms)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86_400_000)
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return `oggi alle ${time}`
  if (days === -1) return `ieri alle ${time}`
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${time}`
}

const Row = ({ k, children }) => (
  <>
    <dt className="text-ink-muted">{k}</dt>
    <dd className="tnum">{children}</dd>
  </>
)

/**
 * Stato delle corse. Due informazioni diverse, tenute separate:
 *  - quando il modello ha calcolato e fin dove arriva — dal suo meta.json,
 *    uguale ovunque nel mondo;
 *  - se in QUESTA località i dati finiscono prima, che è l'unica cosa che
 *    spiega perché una linea sparisce dal grafico. Mostrata solo quando
 *    succede davvero: ripeterla per ogni modello sarebbe rumore.
 */
export default function ModelRuns({ runs, coverage, horizons, slots, selected, palette }) {
  const isMobile = useIsMobile()
  // null = ancora sull'automatico: chiuso su mobile (sei schede impilate sono
  // uno scroll infinito), aperto su desktop. Dopo un toggle vince la scelta.
  const [manual, setManual] = useState(null)
  const open = manual ?? !isMobile

  return (
    <details
      open={open}
      onToggle={(e) => setManual(e.currentTarget.open)}
      className="border-b border-hair px-4 pb-4"
    >
      <summary className="cursor-pointer list-none py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted marker:content-none">
        <span className="inline-flex items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          Aggiornamento modelli
        </span>
      </summary>

      <div className="grid gap-px overflow-hidden rounded-xl border border-hair bg-hair md:grid-cols-2 xl:grid-cols-3">
        {MODELS.map((m) => {
          const on = selected.includes(m.id)
          const slot = slots.get(m.id)
          const color = on && slot !== undefined ? palette.series[slot] : palette.axis
          const run = runs?.[m.id]
          const cov = coverage?.[m.id]
          const horizon = horizons?.[m.id]
          const late = run && runAgeHours(run.initialised) > run.updateIntervalHours * 2.5

          return (
            <div key={m.id} className={`bg-surface p-3 ${on ? '' : 'opacity-55'}`}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="text-[13px] font-semibold">{m.name}</span>
                <span className="truncate text-[11.5px] text-ink-muted">{run?.member ?? m.org}</span>
              </div>

              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[12px]">
                <Row k="Calcolato">
                  {run ? (
                    <>
                      {whenLabel(run.initialised)}
                      {late && <span className="ml-1.5 text-[#ec835a]">· in ritardo</span>}
                    </>
                  ) : (
                    '–'
                  )}
                </Row>

                <Row k="Pubblicato">
                  {run ? `${whenLabel(run.available)} · ogni ${run.updateIntervalHours} h` : '–'}
                </Row>

                <Row k="Arriva a">
                  {horizon
                    ? `${new Date(horizon.end).toLocaleDateString('it-IT', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })} · ${nf(horizon.days, 1)} giorni da adesso`
                    : '–'}
                </Row>
              </dl>

              {/* Solo quando c'è davvero qualcosa da segnalare per questa località. */}
              {cov && !cov.end && (
                <div className="mt-1.5 text-[12px] text-[#ec835a]">Non copre questa località</div>
              )}
              {cov?.end && cov.truncated && (
                <div className="mt-1.5 text-[12px] text-[#ec835a]">
                  Qui si ferma prima: {fmtDayHour(cov.end)}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </details>
  )
}
