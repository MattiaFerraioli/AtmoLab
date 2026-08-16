import { useState } from 'react'
import { MODELS } from '../lib/constants'
import { fmtDayHour, nf } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { runAgeHours, runLabel } from '../lib/runs'

/**
 * Stato delle corse. Due informazioni diverse, tenute separate:
 *  - la CORSA arriva dal meta.json del modello (globale, uguale ovunque);
 *  - la COPERTURA arriva dai dati effettivi di questa località, che per i
 *    modelli regionali finisce prima o manca del tutto.
 */
export default function ModelRuns({ runs, coverage, horizons, slots, selected, palette }) {
  const isMobile = useIsMobile()
  // null = ancora sull'automatico: chiuso su mobile (sei card impilate sono uno
  // scroll infinito), aperto su desktop. Dopo un toggle vince la scelta manuale.
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
          Stato dei modelli
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
          const stale = run && runAgeHours(run.initialised) > run.updateIntervalHours * 2.5

          return (
            <div key={m.id} className={`bg-surface p-3 ${on ? '' : 'opacity-55'}`}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="text-[13px] font-semibold">{m.name}</span>
                <span className="truncate text-[11.5px] text-ink-muted">{run?.member ?? m.org}</span>
              </div>

              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[12px]">
                <dt className="text-ink-muted">Corsa</dt>
                <dd className="tnum">
                  {run ? (
                    <>
                      {runLabel(run.initialised)}
                      {stale && <span className="ml-1.5 text-[#ec835a]">· in ritardo</span>}
                    </>
                  ) : (
                    '–'
                  )}
                </dd>

                <dt className="text-ink-muted">Pubblicata</dt>
                <dd className="tnum">
                  {run
                    ? `${new Date(run.available).toLocaleString('it-IT', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })} · ogni ${run.updateIntervalHours} h`
                    : '–'}
                </dd>

                <dt className="text-ink-muted">Corsa fino a</dt>
                <dd className="tnum">
                  {horizon
                    ? `+${nf(horizon.days, 1)} g · ${new Date(horizon.end).toLocaleDateString('it-IT', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}`
                    : '–'}
                </dd>

                <dt className="text-ink-muted">Dati qui</dt>
                <dd className="tnum">
                  {!cov?.end ? (
                    <span className="text-[#ec835a]">nessuno in questa località</span>
                  ) : cov.truncated ? (
                    <>si fermano a {fmtDayHour(cov.end)}</>
                  ) : (
                    <span className="text-ink-muted">tutta la finestra vista</span>
                  )}
                </dd>
              </dl>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
        <strong className="text-ink-sec">Corsa</strong>: ora UTC di inizializzazione dell&apos;ultimo giro, uguale
        ovunque. <strong className="text-ink-sec">Corsa fino a</strong>: fin dove arriva <em>quella</em> corsa — le corse
        delle 06Z e 18Z sono spesso più corte di quelle delle 00Z e 12Z.{' '}
        <strong className="text-ink-sec">Dati qui</strong>: cosa l&apos;API serve davvero in questa località, ed è il
        dato che comanda nel grafico. Le due righe possono divergere: i prodotti <em>seamless</em> completano la coda con
        la corsa lunga precedente, quindi i dati arrivano più avanti dell&apos;ultima corsa. I modelli regionali invece
        si fermano prima, o mancano del tutto fuori dal loro dominio.
      </p>
    </details>
  )
}
