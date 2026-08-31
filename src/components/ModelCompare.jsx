import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ModelChips from './ModelChips'
import ModelRuns from './ModelRuns'
import ModelTable from './ModelTable'
import SpreadStats from './SpreadStats'
import { Card, Message, Segmented, Skeleton } from './Ui'
import { MODELS, SPANS, VARS } from '../lib/constants'
import { fmtLong, median as medianOf, nf } from '../lib/format'
import { useIsMobile } from '../lib/hooks'

const MEDIAN_KEY = '__median'

function CompareTooltip({ active, payload, label, series, meta, palette }) {
  if (!active || !payload?.length) return null
  const date = new Date(label)
  const rows = series
    .map((s) => ({ ...s, value: payload.find((p) => p.dataKey === s.key)?.value }))
    .filter((r) => r.value !== null && r.value !== undefined)
    .sort((a, b) => b.value - a.value)
  const med = payload.find((p) => p.dataKey === MEDIAN_KEY)?.value

  return (
    <div
      className="min-w-[190px] rounded-xl border p-2.5 text-[12.5px] card-shadow"
      style={{ background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1.5 font-semibold" style={{ color: palette.inkSec }}>
        {date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })} ·{' '}
        {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-4 py-px">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
            <span className="truncate">{r.label}</span>
          </span>
          <span className="tnum font-semibold whitespace-nowrap">
            {nf(r.value, meta.dec)} {meta.unit}
          </span>
        </div>
      ))}
      {med !== null && med !== undefined && (
        <div
          className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5"
          style={{ borderColor: 'var(--border)' }}
        >
          <span style={{ color: palette.inkSec }}>Consenso (mediana)</span>
          <span className="tnum font-semibold">
            {nf(med, meta.dec)} {meta.unit}
          </span>
        </div>
      )}
    </div>
  )
}

export default function ModelCompare({
  comparison,
  runs,
  loading,
  error,
  varId,
  onVarChange,
  span,
  onSpanChange,
  selected,
  slots,
  onToggleModel,
  selectedDay,
  palette,
}) {
  const [showTable, setShowTable] = useState(false)
  const isMobile = useIsMobile()
  const meta = VARS.find((v) => v.id === varId) ?? VARS[0]

  const { rows, series, availability, coverage, spread, times } = useMemo(() => {
    const empty = { rows: [], series: [], availability: {}, coverage: {}, spread: [], times: [] }
    if (!comparison?.hourly) return empty

    const h = comparison.hourly
    const offset = comparison.utc_offset_seconds
    const lastIdx = h.time.length - 1

    /* Copertura: fin dove ogni modello ha dati IN QUESTA LOCALITÀ, dentro la
       finestra richiesta. `truncated` distingue "il modello finisce qui" da
       "arriva almeno fino al bordo della finestra". */
    const cov = {}
    for (const m of MODELS) {
      const v = h[`${varId}_${m.id}`]
      let last = -1
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i -= 1) {
          if (v[i] !== null && v[i] !== undefined) {
            last = i
            break
          }
        }
      }
      cov[m.id] =
        last < 0
          ? { end: null, truncated: false, days: null }
          : {
              end: h.time[last],
              truncated: last < lastIdx,
              // le ore sono locali alla località: va riapplicato l'offset per
              // ottenere l'istante vero e quindi la distanza da adesso
              days: (Date.parse(`${h.time[last]}Z`) - offset * 1000 - Date.now()) / 86_400_000,
            }
    }

    /* Finestra visibile: il giorno selezionato, oppure da adesso in poi. */
    const localNow = new Date(Date.now() + offset * 1000).toISOString().slice(0, 13)
    const nowIdx = Math.max(0, h.time.findIndex((iso) => iso.slice(0, 13) >= localNow))

    let from = nowIdx
    let to = lastIdx
    if (selectedDay) {
      const first = h.time.findIndex((iso) => iso.slice(0, 10) === selectedDay)
      if (first < 0) return { ...empty, coverage: cov }
      let lastOfDay = first
      while (lastOfDay + 1 <= lastIdx && h.time[lastOfDay + 1].slice(0, 10) === selectedDay) lastOfDay += 1
      from = Math.max(first, nowIdx) // se è oggi, si parte da adesso
      to = lastOfDay
      if (from > to) from = first
    }

    const t = h.time.slice(from, to + 1)

    /* Disponibilità: calcolata sulla finestra VISIBILE, così un modello che
       non arriva al giorno scelto risulta spento invece che presente e vuoto. */
    const avail = {}
    for (const m of MODELS) {
      const v = h[`${varId}_${m.id}`]
      avail[m.id] = Array.isArray(v) && v.slice(from, to + 1).some((x) => x !== null && x !== undefined)
    }

    const active = MODELS.filter((m) => selected.includes(m.id) && avail[m.id]).map((m) => ({
      key: m.id,
      label: m.name,
      color: palette.series[slots.get(m.id) ?? 0],
      values: h[`${varId}_${m.id}`].slice(from, to + 1),
    }))

    const spreadArr = new Array(t.length).fill(null)
    const built = t.map((iso, i) => {
      const row = { t: iso }
      const vals = []
      for (const s of active) {
        const v = s.values[i] ?? null
        row[s.key] = v
        if (v !== null) vals.push(v)
      }
      row[MEDIAN_KEY] = medianOf(vals)
      if (vals.length > 1) {
        const lo = Math.min(...vals)
        const hi = Math.max(...vals)
        row.band = [lo, hi]
        spreadArr[i] = hi - lo
      } else {
        row.band = null
      }
      return row
    })

    return { rows: built, series: active, availability: avail, coverage: cov, spread: spreadArr, times: t }
  }, [comparison, varId, selected, slots, palette, selectedDay])

  const dayBoundaries = useMemo(
    () => rows.filter((r, i) => i > 0 && new Date(r.t).getHours() === 0).map((r) => r.t),
    [rows],
  )

  /* Orizzonte reale del modello, dal meta.json: indipendente dalla finestra chiesta. */
  const horizons = useMemo(() => {
    if (!runs || !comparison) return {}
    const out = {}
    for (const m of MODELS) {
      const r = runs[m.id]
      out[m.id] = r ? { end: r.dataEnd, days: (r.dataEnd - Date.now()) / 86_400_000 } : null
    }
    return out
  }, [runs, comparison])

  const axisProps = {
    stroke: palette.axis,
    tick: { fill: palette.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: palette.axis },
  }

  const yDomain =
    meta.domain ??
    (meta.zeroBase
      ? [0, (max) => Math.max(1, Math.ceil(max * 1.05))]
      : [(min) => Math.floor(min - 1), (max) => Math.ceil(max + 1)])

  // Su un giorno solo servono le ore; su più giorni un tick per giorno.
  const xTicks = !rows.length
    ? []
    : selectedDay
      ? rows.filter((r, i) => i % 3 === 0).map((r) => r.t)
      : [rows[0].t, ...dayBoundaries]

  const missingForDay = selectedDay
    ? MODELS.filter((m) => selected.includes(m.id) && availability[m.id] === false)
    : []

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-hair p-3 sm:gap-3 sm:p-4">
        <Segmented
          ariaLabel="Variabile da confrontare"
          options={VARS.map((v) => ({ value: v.id, label: v.label }))}
          value={varId}
          onChange={onVarChange}
        />
        {selectedDay ? (
          <span className="rounded-xl border border-accent/45 bg-accent/10 px-3 py-2 text-[13px] font-semibold text-ink">
            {fmtLong(`${selectedDay}T12:00`)}
          </span>
        ) : (
          <Segmented
            ariaLabel="Orizzonte di previsione"
            options={SPANS.map((s) => ({ value: s.d, label: s.label }))}
            value={span}
            onChange={onSpanChange}
          />
        )}
        <button
          onClick={() => setShowTable((s) => !s)}
          className="ml-auto shrink-0 cursor-pointer rounded-full bg-fill px-3.5 py-2 text-[13px] font-semibold text-ink-sec transition duration-300 hover:text-ink"
        >
          {showTable ? 'Nascondi valori' : 'Mostra valori'}
        </button>
      </div>

      <ModelChips
        selected={selected}
        slots={slots}
        palette={palette}
        availability={availability}
        dayFiltered={Boolean(selectedDay)}
        onToggle={onToggleModel}
      />

      {missingForDay.length > 0 && (
        <div className="border-b border-hair px-4 pb-3 text-[12.5px] text-ink-muted">
          Non arriva{missingForDay.length > 1 ? 'no' : ''} al giorno selezionato:{' '}
          <strong className="font-semibold text-ink-sec">{missingForDay.map((m) => m.name).join(', ')}</strong> — chip
          spent{missingForDay.length > 1 ? 'i' : 'o'} e linea assente dal grafico.
        </div>
      )}

      <ModelRuns
        runs={runs}
        coverage={coverage}
        horizons={horizons}
        slots={slots}
        selected={selected}
        palette={palette}
        selectedDay={selectedDay}
        availability={availability}
      />

      <div className="p-4 pb-2">
        {error ? (
          <Message tone="error">Confronto non disponibile: {error}</Message>
        ) : loading || !comparison ? (
          <Skeleton className="h-[360px] w-full" />
        ) : !series.length ? (
          <Message>
            Nessun modello selezionato ha dati
            {selectedDay ? ' per il giorno scelto' : ' per questa località'}. Attivane un altro qui sopra
            {selectedDay ? ', o scegli un giorno più vicino' : ''}.
          </Message>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isMobile ? 260 : 360}>
              <ComposedChart data={rows} margin={{ top: 10, right: 10, bottom: 4, left: isMobile ? -6 : -12 }}>
                <CartesianGrid stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  {...axisProps}
                  ticks={xTicks}
                  minTickGap={isMobile ? 34 : 24}
                  tickFormatter={(t) => {
                    if (selectedDay) return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    return t === xTicks[0]
                      ? 'adesso'
                      : new Date(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })
                  }}
                />
                <YAxis {...axisProps} width={isMobile ? 36 : 48} domain={yDomain} tickFormatter={(v) => nf(v, meta.unit === 'mm' ? 1 : 0)} />

                {!selectedDay &&
                  dayBoundaries.map((t) => <ReferenceLine key={t} x={t} stroke={palette.axis} strokeDasharray="2 4" />)}

                {/* Banda min–max fra i modelli: dove è stretta, la previsione è solida */}
                <Area
                  dataKey="band"
                  stroke="none"
                  fill={palette.inkSec}
                  fillOpacity={0.22}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={false}
                  legendType="none"
                />

                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={1.9}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey={MEDIAN_KEY}
                  name="Consenso (mediana)"
                  stroke={palette.ink}
                  strokeOpacity={0.9}
                  strokeWidth={3}
                  strokeDasharray="9 5"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />

                <Tooltip
                  cursor={{ stroke: palette.ink, strokeOpacity: 0.35 }}
                  content={<CompareTooltip series={series} meta={meta} palette={palette} />}
                />
              </ComposedChart>
            </ResponsiveContainer>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-2 pb-1 pt-3 text-[12.5px] text-ink-sec">
              {series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-2">
                  <span className="h-[3px] w-3.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
              <span
                className="inline-flex items-center gap-2"
                title="Il valore centrale fra tutti i modelli, ora per ora: metà stanno sopra, metà sotto."
              >
                <span className="h-[3px] w-3.5 rounded-full" style={{ background: palette.ink, opacity: 0.9 }} />
                Consenso (mediana)
              </span>
              <span
                className="inline-flex items-center gap-2"
                title="La fascia grigia copre tutti i valori previsti in quell'ora: dal modello più basso al più alto."
              >
                <span className="h-2.5 w-3.5 rounded-sm" style={{ background: palette.inkSec, opacity: 0.22 }} />
                Intervallo min–max
              </span>
            </div>
          </>
        )}
      </div>

      {series.length > 0 && !loading && (
        <>
          <SpreadStats
            times={times}
            spread={spread}
            meta={meta}
            seriesNames={series.map((s) => s.label)}
            palette={palette}
          />
          {showTable && (
            <ModelTable rows={rows.map((r) => ({ ...r, median: r[MEDIAN_KEY] }))} series={series} meta={meta} />
          )}
        </>
      )}
    </Card>
  )
}
