import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, Message, Skeleton } from './Ui'
import { nf } from '../lib/format'
import { useIsMobile } from '../lib/hooks'

const HOURS = 48

function HourTooltip({ active, payload, label, palette, rows }) {
  if (!active || !payload?.length) return null
  const date = new Date(label)
  return (
    <div
      className="rounded-xl border p-2.5 text-[12.5px] card-shadow"
      style={{ background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1.5 font-semibold" style={{ color: palette.inkSec }}>
        {date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })} ·{' '}
        {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
      </div>
      {rows.map((r) => {
        const p = payload.find((x) => x.dataKey === r.key)
        if (!p || p.value === null || p.value === undefined) return null
        return (
          <div key={r.key} className="flex items-center justify-between gap-4 py-px">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="tnum font-semibold">
              {nf(p.value, r.dec)} {r.unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function HourlyChart({ forecast, palette, selectedDay }) {
  const isMobile = useIsMobile()
  const data = useMemo(() => {
    if (!forecast) return []
    const h = forecast.hourly
    const nowKey = forecast.current.time.slice(0, 13)
    const nowIdx = Math.max(
      0,
      h.time.findIndex((t) => t.slice(0, 13) === nowKey),
    )

    let start = nowIdx
    let end = nowIdx + HOURS
    if (selectedDay) {
      const first = h.time.findIndex((t) => t.slice(0, 10) === selectedDay)
      if (first < 0) return []
      let last = first
      while (last + 1 < h.time.length && h.time[last + 1].slice(0, 10) === selectedDay) last += 1
      start = Math.min(Math.max(first, nowIdx), last) // se è oggi, si parte da adesso
      end = last + 1
    }

    return h.time.slice(start, end).map((t, k) => {
      const i = start + k
      return {
        t,
        temp: h.temperature_2m[i],
        precip: h.precipitation[i],
        prob: h.precipitation_probability?.[i] ?? null,
      }
    })
  }, [forecast, selectedDay])

  const dayBoundaries = useMemo(
    () => data.filter((d, i) => i > 0 && new Date(d.t).getHours() === 0).map((d) => d.t),
    [data],
  )

  if (!forecast) return <Skeleton className="h-[420px] w-full" />
  if (!data.length)
    return (
      <Card className="p-4">
        <Message>Nessun dato orario per il giorno selezionato.</Message>
      </Card>
    )

  const axisProps = {
    stroke: palette.axis,
    tick: { fill: palette.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: palette.axis },
  }
  // minTickGap invece di un interval fisso: su asse stretto Recharts dirada da
  // sé, mentre `interval: 5` sovrapponeva le etichette sotto i 420 px.
  const xProps = {
    dataKey: 't',
    ...axisProps,
    interval: 'preserveStartEnd',
    minTickGap: isMobile ? 44 : 56,
    tickFormatter: (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
  }
  const yWidth = isMobile ? 34 : 46
  const chartMargin = { top: 8, right: 10, bottom: 0, left: isMobile ? -6 : -14 }
  const dayLines = dayBoundaries.map((t) => (
    <ReferenceLine
      key={t}
      x={t}
      stroke={palette.axis}
      strokeDasharray="2 4"
      label={{
        value: new Date(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' }),
        position: 'insideTopLeft',
        fill: palette.inkSec,
        fontSize: 11,
        fontWeight: 600,
      }}
    />
  ))

  const hasRain = data.some((d) => d.precip > 0)

  return (
    <Card className="p-4 pb-2">
      <div className="mb-1 ml-1 text-[13px] font-semibold text-ink-sec">Temperatura (°C)</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis {...xProps} />
          <YAxis
            {...axisProps}
            width={yWidth}
            domain={[(min) => Math.floor(min - 1.5), (max) => Math.ceil(max + 1.5)]}
            tickFormatter={(v) => nf(v, 0)}
          />
          {dayLines}
          <Tooltip
            cursor={{ stroke: palette.ink, strokeOpacity: 0.35 }}
            content={
              <HourTooltip
                palette={palette}
                rows={[{ key: 'temp', label: 'Temperatura', color: palette.series[1], unit: '°C', dec: 1 }]}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="temp"
            stroke={palette.series[1]}
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mb-1 ml-1 mt-3 text-[13px] font-semibold text-ink-sec">
        Precipitazione (mm){!hasRain && <span className="font-normal text-ink-muted"> — nessuna prevista</span>}
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ ...chartMargin, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis {...xProps} />
          <YAxis
            {...axisProps}
            width={yWidth}
            domain={[0, (m) => Math.max(1, Math.ceil(m * 1.2))]}
            allowDecimals={false}
            tickFormatter={(v) => nf(v, 0)}
          />
          <Tooltip
            cursor={{ fill: palette.ink, fillOpacity: 0.06 }}
            content={
              <HourTooltip
                palette={palette}
                rows={[
                  { key: 'precip', label: 'Pioggia', color: palette.series[0], unit: 'mm', dec: 1 },
                  { key: 'prob', label: 'Probabilità', color: palette.muted, unit: '%', dec: 0 },
                ]}
              />
            }
          />
          <Bar dataKey="precip" fill={palette.series[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-2 pb-1 pt-2 text-[12.5px] text-ink-sec">
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-3.5 rounded-full" style={{ background: palette.series[1] }} />
          Temperatura (°C)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-3.5 rounded-sm" style={{ background: palette.series[0] }} />
          Pioggia (mm)
        </span>
      </div>
    </Card>
  )
}
