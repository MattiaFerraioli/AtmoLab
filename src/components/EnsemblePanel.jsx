import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HailMap from './HailMap'
import { Card, Message, Segmented, Skeleton } from './Ui'
import { fetchEnsembleGrid, fetchEnsemblePoint, fetchObserved } from '../lib/api'
import { ENSEMBLE_MAP_METRICS, ENSEMBLE_METRICS, ensembleFractions, ensembleGridCells, fractionStep } from '../lib/ensemble'
import { recordObserved, recordSnapshot, snapshotsFor } from '../lib/history'
import { GRIDS, buildGrid } from '../lib/hail'
import { SEVERITY_COLORS } from '../lib/hazards'
import { fmtDayHour, nf } from '../lib/format'
import { useIsMobile } from '../lib/hooks'

/** Colore della frazione: la scala di severità condivisa, a terzi. */
const fracColor = (f, palette) => (f > 2 / 3 ? '#d03b3b' : f >= 1 / 3 ? '#ec835a' : f > 0 ? '#fab219' : palette.axis)

function FracTooltip({ active, payload, label, metric, memberCount }) {
  if (!active || !payload?.length) return null
  const f = payload[0].value ?? 0
  return (
    <div
      className="rounded-xl border p-2.5 text-[12.5px] card-shadow"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="font-semibold">{fmtDayHour(label)}</div>
      <div className="tnum mt-1">
        {Math.round(f * memberCount)} membri su {memberCount} ({nf(f * 100, 0)}%)
      </div>
      <div className="text-ink-muted">{metric.hint}</div>
    </div>
  )
}

function FracChart({ metric, data, memberCount, palette, isMobile }) {
  const peak = Math.max(...data.map((d) => d[metric.id]), 0)
  return (
    <div>
      <div className="mb-0.5 ml-1 flex items-baseline gap-2">
        <span className="text-[12.5px] font-semibold text-ink-sec">{metric.label}</span>
        <span className="text-[11.5px] text-ink-muted">{metric.hint}</span>
        {peak === 0 && <span className="text-[11.5px] text-ink-muted">— nessun membro</span>}
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={data} margin={{ top: 2, right: 10, bottom: 0, left: isMobile ? 0 : -8 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis
            dataKey="t"
            stroke={palette.axis}
            tick={{ fill: palette.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: palette.axis }}
            ticks={data.filter((_, i) => i % 6 === 0).map((d) => d.t)}
            tickFormatter={(t) => {
              const d = new Date(t)
              return d.getHours() === 0
                ? d.toLocaleDateString('it-IT', { weekday: 'short' })
                : d.toLocaleTimeString('it-IT', { hour: '2-digit' })
            }}
          />
          <YAxis
            stroke={palette.axis}
            tick={{ fill: palette.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: palette.axis }}
            width={44}
            domain={[0, 1]}
            ticks={[0, 0.5, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
          />
          <ReferenceLine y={0.5} stroke={palette.axis} strokeDasharray="3 4" />
          <Tooltip
            cursor={{ fill: palette.ink, fillOpacity: 0.06 }}
            content={<FracTooltip metric={metric} memberCount={memberCount} />}
          />
          <Bar dataKey={metric.id} radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.t} fill={fracColor(d[metric.id], palette)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Tabella del confronto nel tempo: previsto (det + ensemble) contro osservato. */
function HistoryTable({ location }) {
  const [rows, setRows] = useState(() => snapshotsFor(location))

  /* L'osservato si recupera per gli snapshot passati che non l'hanno ancora:
     ERA5 ha ~1 giorno di lag, quindi si tenta solo per date precedenti a ieri. */
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const pending = rows.filter((r) => !r.obs && r.date < today).slice(0, 5)
    if (!pending.length) return
    let alive = true
    Promise.all(
      pending.map((r) =>
        fetchObserved({ latitude: r.lat, longitude: r.lon }, r.date).then((obs) => {
          if (obs) recordObserved(r.id, obs)
        }),
      ),
    ).then(() => alive && setRows(snapshotsFor(location)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location])

  if (rows.length < 2)
    return (
      <p className="text-[12.5px] text-ink-muted">
        Il confronto nel tempo si costruisce da solo: ogni giorno in cui apri questa sezione viene salvata una riga
        (previsto deterministico, previsto ensemble) e dal giorno dopo arriva l&apos;osservato ERA5. Torna fra qualche
        giorno.
      </p>
    )

  return (
    <div className="overflow-x-auto">
      <table className="tnum w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-ink-muted">
            <th className="px-2 py-1 text-left font-semibold">Giorno</th>
            <th className="px-2 py-1 text-right font-semibold">SHIP det.</th>
            <th className="px-2 py-1 text-right font-semibold">SHIP&gt;0,8 ens.</th>
            <th className="px-2 py-1 text-right font-semibold">Raffica det.</th>
            <th className="px-2 py-1 text-right font-semibold">Raff.≥60 ens.</th>
            <th className="px-2 py-1 text-right font-semibold">Raffica oss.</th>
            <th className="px-2 py-1 text-right font-semibold">Pioggia det.</th>
            <th className="px-2 py-1 text-right font-semibold">Pioggia oss.</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 14).map((r) => (
            <tr key={r.id} className="border-t border-grid">
              <td className="px-2 py-1">{new Date(`${r.date}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</td>
              <td className="px-2 py-1 text-right">{nf(r.det?.ship, 2)}</td>
              <td className="px-2 py-1 text-right">{r.ens ? `${nf(r.ens.ship08 * 100, 0)}%` : '–'}</td>
              <td className="px-2 py-1 text-right">{r.det?.gust != null ? `${nf(r.det.gust, 0)} km/h` : '–'}</td>
              <td className="px-2 py-1 text-right">{r.ens ? `${nf(r.ens.gust60 * 100, 0)}%` : '–'}</td>
              <td className="px-2 py-1 text-right">{r.obs?.gust != null ? `${nf(r.obs.gust, 0)} km/h` : '–'}</td>
              <td className="px-2 py-1 text-right">{r.det?.rain != null ? `${nf(r.det.rain, 1)} mm` : '–'}</td>
              <td className="px-2 py-1 text-right">{r.obs?.rain != null ? `${nf(r.obs.rain, 1)} mm` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-ink-muted">
        Osservato: ERA5, disponibile dal giorno dopo. La grandine osservata non esiste in nessun dataset gratuito,
        quindi per SHIP il confronto resta indiretto (SHIP alto + raffiche/pioggia osservate forti = giornata convettiva
        vera).
      </p>
    </div>
  )
}

const FRACTION_LEGEND = [
  { step: 1, label: '≥ 10%' },
  { step: 2, label: '≥ 33%' },
  { step: 3, label: '≥ 67%' },
  { step: 4, label: '≥ 90%' },
]

/**
 * Mappa a zone della frazione di membri, stessa pipeline della sezione
 * deterministica (buildZones via HailMap): cambia solo la grandezza — qui il
 * valore È già una probabilità, quindi niente tratto/etichetta "prob.".
 */
function EnsembleMap({ location, timezone, gridId, palette, theme }) {
  const [enabled, setEnabled] = useState(false)
  const [cells, setCells] = useState(null)
  const [error, setError] = useState(null)
  const [metricId, setMetricId] = useState('storm')
  const [dayOffset, setDayOffset] = useState(0)

  useEffect(() => {
    setEnabled(false)
    setCells(null)
    setError(null)
  }, [location])

  useEffect(() => {
    if (!enabled) return undefined
    const ctrl = new AbortController()
    const step = GRIDS.find((g) => g.id === gridId)?.step ?? 0.7
    const points = buildGrid(location, step)
    fetchEnsembleGrid(points, 2, timezone, ctrl.signal)
      .then((results) => setCells(ensembleGridCells(results, points)))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return () => ctrl.abort()
  }, [enabled, location, timezone, gridId])

  const metric = ENSEMBLE_MAP_METRICS.find((m) => m.id === metricId) ?? ENSEMBLE_MAP_METRICS[0]

  /* Celle nel formato che HailMap/buildZones già capiscono. */
  const mapCells = useMemo(() => {
    if (!cells) return null
    /* Le ore delle serie sono locali alla località: "adesso" e "oggi" vanno
       calcolati col suo offset, non con l'orologio del browser. */
    const offsetMs = (cells[0]?.utcOffset ?? 0) * 1000
    const localNow = new Date(Date.now() + offsetMs)
    const nowHour = localNow.toISOString().slice(0, 13)
    const base = new Date(localNow)
    base.setUTCDate(base.getUTCDate() + dayOffset)
    const day = base.toISOString().slice(0, 10)

    return cells.map((c) => {
      let frac = 0
      let at = null
      if (metricId === 'rain') {
        frac = c.rainByDay.get(day) ?? 0
      } else {
        const key = metricId === 'wind' ? 'gust' : 'storm'
        for (const p of c.series) {
          if (p.t.slice(0, 10) !== day) continue
          if (dayOffset === 0 && p.t.slice(0, 13) < nowHour) continue
          if (p[key] > frac) {
            frac = p[key]
            at = p.t
          }
        }
      }
      const members = Math.round(frac * c.memberCount)
      return {
        ...c,
        severity: fractionStep(frac),
        prob: null,
        metric: {
          value: frac,
          badge: frac >= 0.1 ? `${Math.round(frac * 100)}%` : '—',
          detail: `${members} membri su ${c.memberCount}`,
          at,
        },
      }
    })
  }, [cells, metricId, dayOffset])

  const step = GRIDS.find((g) => g.id === gridId)?.step ?? 0.7

  if (!enabled)
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hair pt-3">
        <div className="min-w-[220px] flex-1 text-[12.5px] text-ink-sec">
          La stessa griglia della sezione sopra, ma con la frazione dei 31 membri: temporali, raffiche e pioggia.
          Niente grandine qui — i livelli in quota per membro peserebbero ~7 MB; SHIP ensemble resta sul punto.
        </div>
        <button
          onClick={() => setEnabled(true)}
          className="cursor-pointer rounded-xl border border-accent bg-accent/10 px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-accent/20"
        >
          Carica mappa (~1,6 MB)
        </button>
      </div>
    )

  if (error)
    return (
      <div className="mt-4 border-t border-hair pt-3">
        <Message tone="error">Mappa ensemble non disponibile: {error}</Message>
      </div>
    )
  if (!mapCells) return <Skeleton className="mt-4 h-[360px] w-full" />

  return (
    <div className="mt-4 border-t border-hair pt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Metrica della mappa ensemble"
          options={ENSEMBLE_MAP_METRICS.map((m) => ({ value: m.id, label: m.label }))}
          value={metricId}
          onChange={setMetricId}
        />
        <Segmented
          ariaLabel="Giorno della mappa ensemble"
          options={[
            { value: 0, label: 'Oggi' },
            { value: 1, label: 'Domani' },
          ]}
          value={dayOffset}
          onChange={setDayOffset}
        />
        <span className="text-[12px] text-ink-muted">{metric.hint}</span>
      </div>

      <HailMap
        cells={mapCells}
        step={step}
        origin={location}
        palette={palette}
        theme={theme}
        steering={null}
        hazard={{ id: 'ensemble', label: metric.label }}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-sec">
        <span className="text-ink-muted">Membri oltre soglia:</span>
        {FRACTION_LEGEND.map(({ step: st, label }) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: SEVERITY_COLORS[st] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function EnsemblePanel({ location, timezone, detSnapshot, gridId, palette, theme }) {
  const [enabled, setEnabled] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    setEnabled(false)
    setData(null)
    setError(null)
  }, [location])

  useEffect(() => {
    if (!enabled) return undefined
    const ctrl = new AbortController()
    fetchEnsemblePoint(location, 2, timezone, ctrl.signal)
      .then((json) => setData(ensembleFractions(json)))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return () => ctrl.abort()
  }, [enabled, location, timezone])

  /* Snapshot del giorno: massimo di oggi per le frazioni chiave, più il
     deterministico che arriva già pronto dalla sezione sopra. */
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    if (data) {
      const todayFracs = data.fractions.filter((f) => f.t.slice(0, 10) === today)
      const maxOf = (k) => Math.max(...todayFracs.map((f) => f[k]), 0)
      recordSnapshot(today, location, {
        ens: { ship08: maxOf('ship08'), gust60: maxOf('gust60'), rain1: maxOf('rain1') },
      })
    }
    if (detSnapshot) recordSnapshot(today, location, { det: detSnapshot })
  }, [data, detSnapshot, location])

  const chartData = useMemo(() => data?.fractions ?? [], [data])

  if (!enabled)
    return (
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[220px] flex-1 text-[13px] text-ink-sec">
          31 versioni dello stesso modello con partenze leggermente diverse: quante prevedono grandine, raffiche o
          pioggia qui? È la probabilità vera, ma pesa come ~30 richieste normali — quindi parte solo se la chiedi, e
          solo sul punto della località.
        </div>
        <button
          onClick={() => setEnabled(true)}
          className="cursor-pointer rounded-xl border border-accent bg-accent/10 px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-accent/20"
        >
          Carica ensemble
        </button>
      </Card>
    )

  if (error) return <Message tone="error">Ensemble non disponibile: {error}</Message>
  if (!data) return <Skeleton className="h-[420px] w-full" />

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-ink">
          GFS ensemble 0,5° · {data.memberCount} membri
        </span>
        <span className="text-[12px] text-ink-muted">
          solo il punto di {location.name} · prossime 48 ore · SHIP calcolato membro per membro · il CAPE di GFS a
          0,5° corre più basso dei modelli km-scale: confronta le frazioni nel tempo, non i valori assoluti con la
          sezione sopra
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {ENSEMBLE_METRICS.map((m) => (
          <FracChart key={m.id} metric={m} data={chartData} memberCount={data.memberCount} palette={palette} isMobile={isMobile} />
        ))}
      </div>

      <EnsembleMap location={location} timezone={timezone} gridId={gridId} palette={palette} theme={theme} />

      <div className="mt-4 border-t border-hair pt-3">
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          Confronto nel tempo
        </div>
        <HistoryTable location={location} />
      </div>
    </Card>
  )
}
