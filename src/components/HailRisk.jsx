import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HailMap from './HailMap'
import { Card, Message, Segmented, Skeleton } from './Ui'
import { GRIDS, GRID_SIDE, HAIL_DAYS, RISK_LABELS, hailSize, peakOf, rampFor, riskBand } from '../lib/hail'
import { fmtDayHour, nf, relativePosition } from '../lib/format'
import { useIsMobile } from '../lib/hooks'

const CENTRE = (GRID_SIDE - 1) / 2

function Tile({ k, children, sub }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{k}</div>
      <div className="tnum mt-1 text-[22px] font-semibold tracking-[-0.02em]">{children}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-ink-sec">{sub}</div>}
    </div>
  )
}

function RiskTooltip({ active, payload, label, palette, ramp }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const band = riskBand(p.risk)
  return (
    <div
      className="rounded-xl border p-2.5 text-[12.5px] card-shadow"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1 font-semibold" style={{ color: palette.inkSec }}>
        {fmtDayHour(label)}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ramp[band.step] }} />
        {band.label}
      </div>
      <div className="tnum mt-1 text-ink-sec">
        SHIP ambiente {nf(p.ship, 2)} · diametro {hailSize(p.ship).label}
      </div>
    </div>
  )
}

export default function HailRisk({
  location,
  cells: rawCells,
  loading,
  error,
  grid,
  onGridChange,
  targetDay,
  dayOffset,
  onDayOffsetChange,
  dayLocked,
  dayOutOfRange,
  palette,
  theme,
}) {
  const [selected, setSelected] = useState(null)
  const isMobile = useIsMobile()
  const step = GRIDS.find((g) => g.id === grid)?.step ?? 0.7
  const ramp = rampFor(theme)

  // Cambiando località, griglia o giorno, il dettaglio torna sulla cella centrale.
  useEffect(() => setSelected(null), [location, grid, targetDay])

  /* La sezione guarda sempre un giorno solo, e su oggi scarta le ore già
     passate: un picco alle 04:00 di stamattina non è una previsione. */
  const cells = useMemo(() => {
    if (!rawCells?.length) return rawCells
    const offsetSeconds = rawCells[0].utcOffset ?? 0
    const localNowHour = new Date(Date.now() + offsetSeconds * 1000).toISOString().slice(0, 13)

    return rawCells.map((c) => {
      const series = c.series.filter(
        (p) => p.t.slice(0, 10) === targetDay && p.t.slice(0, 13) >= localNowHour,
      )
      const peak = peakOf(series)
      return { ...c, series, risk: peak.risk, ship: peak.ship, when: peak.t }
    })
  }, [rawCells, targetDay])

  const ranked = useMemo(() => [...(cells ?? [])].sort((a, b) => b.risk - a.risk), [cells])
  const worst = ranked[0]
  const centre = cells?.find((c) => c.row === CENTRE && c.col === CENTRE)
  const focus = selected ?? centre ?? worst

  const focusSeries = useMemo(() => focus?.series ?? [], [focus])

  if (error) return <Message tone="error">Rischio grandine non disponibile: {error}</Message>
  if (dayOutOfRange)
    return (
      <Message>
        Il rischio grandine si calcola solo entro 72 ore: oltre, i parametri convettivi non hanno più significato
        pratico. Il giorno selezionato è fuori portata — torna ai 14 giorni o scegline uno più vicino.
      </Message>
    )
  if (loading || !cells) return <Skeleton className="h-[520px] w-full" />

  const worstBand = riskBand(worst?.risk ?? 0)
  const worstColor = ramp[worstBand.step]
  const worstSize = hailSize(worst?.ship ?? 0)
  const quiet = (worst?.risk ?? 0) < 0.05
  const peakRisk = Math.max(...focusSeries.map((p) => p.risk), 0)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-hair p-3 sm:gap-3 sm:p-4">
        <Segmented
          ariaLabel="Estensione dell'area analizzata"
          options={GRIDS.map((g) => ({ value: g.id, label: g.label }))}
          value={grid}
          onChange={onGridChange}
        />
        {dayLocked ? (
          <span className="rounded-xl border border-accent/45 bg-accent/10 px-3 py-2 text-[13px] font-semibold text-ink">
            {new Date(`${targetDay}T12:00`).toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        ) : (
          <Segmented
            ariaLabel="Giorno da analizzare"
            options={HAIL_DAYS.map((d) => ({ value: d.offset, label: d.label }))}
            value={dayOffset}
            onChange={onDayOffsetChange}
          />
        )}
        <span className="min-w-0 basis-full text-[12.5px] text-ink-muted lg:basis-auto">
          {GRID_SIDE}×{GRID_SIDE} punti · lato {GRIDS.find((g) => g.id === grid)?.span}
          {dayOffset === 0 && !dayLocked && ' · dalle ore correnti a fine giornata'}
        </span>
      </div>

      <div className="grid gap-px border-b border-hair bg-hair sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-surface p-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Rischio massimo nell&apos;area</div>
          <div className="mt-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold"
              style={{
                background: `color-mix(in srgb, ${worstColor} 20%, transparent)`,
                color: 'var(--text-primary)',
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: worstColor }} />
              {worstBand.label}
            </span>
          </div>
          <div className="tnum mt-1 text-[12.5px] text-ink-sec">indice {nf(worst?.risk ?? 0, 2)}</div>
        </div>

        <Tile k="Diametro stimato" sub={worstSize.note}>
          {worstSize.label}
        </Tile>

        <Tile k="Dove" sub={worst ? `${worst.gridLat.toFixed(2)}°, ${worst.gridLon.toFixed(2)}°` : '–'}>
          <span className="text-[17px]">
            {worst ? relativePosition(location.latitude, location.longitude, worst.gridLat, worst.gridLon) : '–'}
          </span>
        </Tile>

        <Tile k="Quando" sub={quiet ? 'nessun picco significativo' : `SHIP ambiente ${nf(worst?.ship ?? 0, 2)}`}>
          <span className="text-[17px]">{worst?.when && !quiet ? fmtDayHour(worst.when) : '–'}</span>
        </Tile>
      </div>

      {/* Colonna mappa quasi quadrata: la griglia è quadrata in gradi, un
          contenitore 3:2 lascerebbe metà larghezza vuota dopo il fitBounds. */}
      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div>
          <HailMap
            cells={cells}
            step={step}
            origin={location}
            palette={palette}
            theme={theme}
            onSelectCell={setSelected}
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-sec">
            <span className="text-ink-muted">Rischio:</span>
            {RISK_LABELS.map((label, i) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: ramp[i], opacity: i === 0 ? 0.45 : 1 }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-sec">Celle a rischio maggiore</div>
          {quiet ? (
            <Message>
              Nessuna cella con rischio apprezzabile {dayOffset === 0 ? 'per il resto di oggi' : 'in questo giorno'}.
              L&apos;ambiente non è favorevole alla grandine, oppure non è prevista convezione.
            </Message>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {ranked.slice(0, 8).map((c) => {
                const band = riskBand(c.risk)
                const size = hailSize(c.ship)
                const isFocus = focus && c.gridLat === focus.gridLat && c.gridLon === focus.gridLon
                return (
                  <li key={`${c.gridLat},${c.gridLon}`}>
                    <button
                      onClick={() => setSelected(c)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        isFocus ? 'border-accent' : 'border-hair hover:border-axis'
                      }`}
                    >
                      <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: ramp[band.step] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {relativePosition(location.latitude, location.longitude, c.gridLat, c.gridLon)}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted">
                          {fmtDayHour(c.when)} · {band.label}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-right">
                        <span className="block text-[13px] font-semibold">{size.label}</span>
                        <span className="block text-[11.5px] text-ink-muted">SHIP {nf(c.ship, 2)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>

      <div className="border-t border-hair p-4 pt-3">
        <div className="mb-1 ml-1 text-[13px] font-semibold text-ink-sec">
          Andamento orario ·{' '}
          {focus
            ? relativePosition(location.latitude, location.longitude, focus.gridLat, focus.gridLon) === 'qui'
              ? location.name
              : `${focus.gridLat.toFixed(2)}°, ${focus.gridLon.toFixed(2)}°`
            : '–'}
          <span className="font-normal text-ink-muted"> — clicca una cella sulla mappa o nella lista per cambiarla</span>
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={focusSeries} margin={{ top: 6, right: 10, bottom: 4, left: isMobile ? 2 : -6 }}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis
              dataKey="t"
              stroke={palette.axis}
              tick={{ fill: palette.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: palette.axis }}
              ticks={focusSeries.filter((_, i) => i % (isMobile ? 4 : 3) === 0).map((p) => p.t)}
              tickFormatter={(t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            />
            <YAxis
              stroke={palette.axis}
              tick={{ fill: palette.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: palette.axis }}
              width={isMobile ? 44 : 54}
              domain={[0, (m) => Math.max(0.1, Math.ceil(m * 1.15 * 20) / 20)]}
              tickFormatter={(v) => nf(v, 2)}
            />
            {/* Soglia "Alto" mostrata solo se la scala la contiene, altrimenti schiaccia i dati */}
            {peakRisk >= 0.3 && <ReferenceLine y={0.5} stroke={palette.axis} strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ fill: palette.ink, fillOpacity: 0.06 }}
              content={<RiskTooltip palette={palette} ramp={ramp} />}
            />
            <Bar dataKey="risk" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {focusSeries.map((p) => (
                <Cell key={p.t} fill={ramp[riskBand(p.risk).step]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-hair p-4 text-[12.5px] leading-relaxed text-ink-muted">
        <strong className="text-ink-sec">Come si legge.</strong> Open-Meteo non pubblica un diametro di grandine
        previsto, quindi l&apos;indice è ricostruito dai parametri d&apos;ambiente con la formula <strong>SHIP</strong>{' '}
        (Significant Hail Parameter, Storm Prediction Center): CAPE, rapporto di mescolanza, gradiente termico 700–500
        hPa, temperatura a 500 hPa, shear del vento 0–6 km e quota dello zero termico. SHIP &gt; 1 indica ambiente
        favorevole a grandine ≥ 5 cm. Poiché SHIP descrive il potenziale e non l&apos;innesco, il rischio mostrato pesa
        SHIP con la convezione effettivamente prevista dal modello (codice meteo e precipitazione). Il diametro è una{' '}
        <strong>stima da parametri</strong>, non l&apos;uscita di un modello di grandine: usalo per capire dove e quando
        guardare, non come previsione puntuale.
      </div>
    </Card>
  )
}
