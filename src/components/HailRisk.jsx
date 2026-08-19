import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HailMap from './HailMap'
import { Card, Message, Segmented, Skeleton } from './Ui'
import { GRIDS, GRID_SIDE, HAIL_DAYS, buildNarrative, capeBand, hailSize, hasRotationPotential, peakOf, steeringOf } from '../lib/hail'
import { HAZARDS, SEVERITY_COLORS, SEVERITY_LABELS, applyHazard, hailZoneStep, hazardById, severityOf, zoneSpecOf } from '../lib/hazards'
import { AGREEMENT_COUNT, cellFraction, fractionText } from '../lib/agreement'
import { fmtDayHour, nf, relativePosition } from '../lib/format'

/** "42 km a NE", ma per la cella della località il nome del posto: "qui" da solo non significa niente. */
const placeLabel = (location, lat, lon) => {
  const rp = relativePosition(location.latitude, location.longitude, lat, lon)
  return rp === 'qui' ? location.name : rp
}
import { useCellName, useIsMobile } from '../lib/hooks'

const CENTRE = (GRID_SIDE - 1) / 2

function Tile({ k, children, sub }) {
  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{k}</div>
      <div className="tnum mt-1 text-[22px] font-semibold tracking-[-0.02em]">{children}</div>
      {sub && <div className="mt-0.5 truncate text-[12.5px] text-ink-sec">{sub}</div>}
    </div>
  )
}

function RiskTooltip({ active, payload, label, palette, hazard }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const value = hazard.hourly.pick(p)
  const sev = severityOf(value, hazard.hourly.bands)
  return (
    <div
      className="rounded-xl border p-2.5 text-[12.5px] card-shadow"
      style={{ background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1 font-semibold" style={{ color: palette.inkSec }}>
        {fmtDayHour(label)}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLORS[sev] }} />
        {hazard.hourly.label} {nf(value ?? 0, hazard.hourly.dec)} {hazard.hourly.unit}
      </div>
      {hazard.id === 'hail' && (
        <div className="tnum mt-1 text-ink-sec">diametro {hailSize(p.ship).label}</div>
      )}
      {p.cape != null && (
        <div className="tnum text-ink-sec">
          CAPE {nf(p.cape, 0)} J/kg ({capeBand(p.cape)})
          {p.gust != null && <> · raffiche ~{nf(p.gust, 0)} km/h</>}
        </div>
      )}
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
  hazardId,
  onHazardChange,
  agreement,
  hiRes,
  dayLocked,
  dayOutOfRange,
  palette,
  theme,
}) {
  const [selected, setSelected] = useState(null)
  const isMobile = useIsMobile()
  const step = GRIDS.find((g) => g.id === grid)?.step ?? 0.7

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
      return {
        ...c,
        series,
        risk: peak.risk,
        ship: peak.ship,
        when: peak.t,
        cape: peak.cape,
        gust: peak.gust,
        rotation: hasRotationPotential(series),
      }
    })
  }, [rawCells, targetDay])

  const hazard = hazardById(hazardId)
  const hazardCells = useMemo(() => {
    if (!cells) return null
    const enriched = applyHazard(cells, hazardId)
    if (!agreement) return enriched
    /* Le ore valide sono le stesse del filtro dei valori: giorno scelto, e su
       oggi niente passato. La serie della cella le conosce già. */
    return enriched.map((c, k) => {
      const valid = new Set(c.series.map((p) => p.t))
      const frac = cellFraction(agreement[k], hazardId, (t) => valid.has(t), targetDay)
      return { ...c, prob: frac }
    })
  }, [cells, hazardId, agreement, targetDay])
  const ranked = useMemo(
    () => [...(hazardCells ?? [])].sort((a, b) => b.metric.value - a.metric.value),
    [hazardCells],
  )
  const steering = useMemo(() => (cells?.length ? steeringOf(cells) : null), [cells])
  const narrative = useMemo(
    () => (cells?.length ? buildNarrative(cells, location) : null),
    [cells, location],
  )
  // Raffica massima nelle sole ore convettive: una raffica da fronte senza
  // temporale non c'entra col downburst e qui non deve comparire.
  const gustMax = useMemo(() => {
    if (!cells?.length) return null
    let g = 0
    for (const c of cells) for (const p of c.series) if (p.risk >= 0.05 && p.gust > g) g = p.gust
    return g > 0 ? g : null
  }, [cells])
  const worst = ranked[0]
  const centre = hazardCells?.find((c) => c.row === CENTRE && c.col === CENTRE)
  const focus = selected ?? centre ?? worst

  const focusSeries = useMemo(() => focus?.series ?? [], [focus])
  const worstName = useCellName(worst?.gridLat, worst?.gridLon)

  if (error) return <Message tone="error">Rischio grandine non disponibile: {error}</Message>
  if (dayOutOfRange)
    return (
      <Message>
        Il rischio grandine si calcola solo entro 72 ore: oltre, i parametri convettivi non hanno più significato
        pratico. Il giorno selezionato è fuori portata — torna ai 14 giorni o scegline uno più vicino.
      </Message>
    )
  if (loading || !cells) return <Skeleton className="h-[520px] w-full" />

  const worstSeverity = worst?.severity ?? 0
  const worstColor = SEVERITY_COLORS[worstSeverity]
  const quiet = worstSeverity === 0
  const peakRisk = Math.max(...focusSeries.map((p) => hazard.hourly.pick(p) ?? 0), 0)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-hair p-3 sm:gap-3 sm:p-4">
        <Segmented
          ariaLabel="Pericolo da mappare"
          options={HAZARDS.map((h) => ({ value: h.id, label: h.label }))}
          value={hazardId}
          onChange={onHazardChange}
        />
        <Segmented
          ariaLabel="Estensione dell'area analizzata"
          options={GRIDS.map((g) => ({ value: g.id, label: g.label }))}
          value={grid}
          onChange={onGridChange}
        />
        {!hiRes && grid !== 'local' && (
          <span className="text-[11.5px] text-ink-muted">griglia {grid === 'wide' ? 'ampia' : 'regionale'}: modello meno dettagliato</span>
        )}
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
      </div>

      {narrative && (
        <div className="border-b border-hair p-4">
          <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-ink-muted">In sintesi</div>
          <p className="max-w-[75ch] text-[13.5px] leading-relaxed text-ink-sec">
            {narrative.sentences.join(' ')}
          </p>
        </div>
      )}

      <div className="grid border-b border-hair sm:grid-cols-2 lg:grid-cols-5">
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            {hazard.label} · massimo nell&apos;area
          </div>
          <div className="mt-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold"
              style={{
                background: `color-mix(in srgb, ${worstColor} 20%, transparent)`,
                color: 'var(--text-primary)',
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: worstColor }} />
              {SEVERITY_LABELS[worstSeverity]}
            </span>
          </div>
          <div className="mt-1 truncate text-[12.5px] text-ink-sec">
            {worst?.prob != null
              ? worst.prob <= 0
                ? 'Nessun modello prevede l\u2019innesco: solo ambiente favorevole'
                : `${hazard.id === 'hail' ? 'Innesco previsto da' : 'Previsto da'} ${fractionText(worst.prob)}`
              : (worst?.metric.detail ?? '–')}
          </div>
        </div>

        <Tile
          k={hazard.id === 'hail' ? 'Diametro stimato' : hazard.id === 'wind' ? 'Raffica massima' : 'Accumulo massimo'}
          sub={worst?.metric.note ?? '–'}
        >
          {worst?.metric.badge ?? '—'}
        </Tile>

        {/* Distanza e direzione come valore: è l'informazione utile e sempre
            sensata. Il nome del posto sta sotto, come contesto — su celle
            remote o sul mare il reverse geocoding restituisce toponimi oscuri,
            che in testata sarebbero peggio delle coordinate che sostituiscono. */}
        <Tile k="Dove" sub={worstName ?? undefined}>
          <span className="text-[17px]">
            {worst ? placeLabel(location, worst.gridLat, worst.gridLon) : '–'}
          </span>
        </Tile>

        <Tile
          k="Quando"
          sub={
            quiet
              ? 'nessun picco significativo'
              : worst?.cape != null
                ? `Energia ${capeBand(worst.cape)} · CAPE ${nf(worst.cape, 0)} J/kg`
                : `SHIP ambiente ${nf(worst?.ship ?? 0, 2)}`
          }
        >
          <span className="text-[17px]">{worst?.metric.at && !quiet ? fmtDayHour(worst.metric.at) : '–'}</span>
        </Tile>

        <Tile
          k="Raffiche nei temporali"
          sub={gustMax ? 'Previste dai modelli nelle ore convettive' : 'Nessuna convezione prevista'}
        >
          {gustMax ? (
            <>
              ~{Math.round(gustMax / 5) * 5} <span className="text-[13px] text-ink-sec">km/h</span>
            </>
          ) : (
            '–'
          )}
        </Tile>
      </div>

      {/* Colonna mappa quasi quadrata: la griglia è quadrata in gradi, un
          contenitore 3:2 lascerebbe metà larghezza vuota dopo il fitBounds. */}
      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div>
          <HailMap
            cells={hazardCells}
            step={step}
            origin={location}
            palette={palette}
            theme={theme}
            steering={steering}
            hazard={hazard}
            onSelectCell={setSelected}
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-sec">
            <span className="text-ink-muted">{zoneSpecOf(hazard).legendTitle}:</span>
            {(zoneSpecOf(hazard).labels ?? SEVERITY_LABELS.slice(1)).map((label, i) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: SEVERITY_COLORS[i + 1] }} />
                {label}
              </span>
            ))}
            {hazard.id === 'hail' && (
              <span className="inline-flex items-center gap-3 text-ink-muted">
                <span
                  className="text-ink-muted"
                  title={`Accordo fra ${AGREEMENT_COUNT} modelli (ECMWF, GFS, ICON): bassa = uno prevede l'evento, media = due, alta = tutti. "Solo ambiente" = nessuno lo prevede: restano le condizioni, manca l'innesco.`}
                >
                  · Probabilità:
                </span>
                {[
                  ['Solo ambiente', '1 7'],
                  ['Bassa', '2 6'],
                  ['Media', '7 5'],
                  ['Alta', null],
                ].map(([label, dash]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <svg viewBox="0 0 24 8" className="h-2 w-6">
                      <line
                        x1="0"
                        y1="4"
                        x2="24"
                        y2="4"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeDasharray={dash ?? undefined}
                      />
                    </svg>
                    {label}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-sec">Celle più esposte</div>
          {quiet ? (
            <Message>
              Nessuna cella con rischio apprezzabile {dayOffset === 0 ? 'per il resto di oggi' : 'in questo giorno'}.
              L&apos;ambiente non è favorevole alla grandine, oppure non è prevista convezione.
            </Message>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {ranked.slice(0, 8).map((c) => {
                const color =
                  SEVERITY_COLORS[hazard.id === 'hail' ? hailZoneStep(c.metric.ship ?? 0) : c.severity]
                const isFocus = focus && c.gridLat === focus.gridLat && c.gridLon === focus.gridLon
                return (
                  <li key={`${c.gridLat},${c.gridLon}`}>
                    <button
                      onClick={() => setSelected(c)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        isFocus ? 'border-accent' : 'border-hair hover:border-axis'
                      }`}
                    >
                      <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {placeLabel(location, c.gridLat, c.gridLon)}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted">
                          {c.metric.at ? fmtDayHour(c.metric.at) : '–'} · {SEVERITY_LABELS[c.severity]}
                          {c.rotation && (
                            <span
                              className="font-semibold text-[#8b3fb5]"
                              title="Ambiente da supercella: CAPE e shear 0–6 km oltre le soglie classiche, quindi rotazione possibile ma non certa."
                            >
                              {' '}
                              · possibile supercella
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-right">
                        <span className="block text-[13px] font-semibold">{c.metric.badge}</span>
                        <span className="block text-[11.5px] text-ink-muted">{c.metric.detail}</span>
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
          {hazard.hourly.label} ora per ora ·{' '}
          {focus ? placeLabel(location, focus.gridLat, focus.gridLon) : '–'}
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
              domain={[0, (m) => Math.max(hazard.hourly.bands[0], Math.ceil(m * 1.15 * 20) / 20)]}
              tickFormatter={(v) => nf(v, hazard.hourly.dec)}
            />
            {/* Soglia "Alto" mostrata solo se la scala la contiene, altrimenti schiaccia i dati */}
            {peakRisk >= hazard.hourly.bands[1] && (
              <ReferenceLine y={hazard.hourly.bands[2]} stroke={palette.axis} strokeDasharray="4 4" />
            )}
            <Tooltip
              cursor={{ fill: palette.ink, fillOpacity: 0.06 }}
              content={<RiskTooltip palette={palette} hazard={hazard} />}
            />
            <Bar dataKey={hazard.id === 'hail' ? 'risk' : hazard.id === 'wind' ? 'gust' : 'precip'} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {focusSeries.map((p) => (
                <Cell key={p.t} fill={SEVERITY_COLORS[severityOf(hazard.hourly.pick(p), hazard.hourly.bands)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-hair p-4 text-[12.5px] leading-relaxed text-ink-muted">
        <div className="mb-2">
          Griglia {GRID_SIDE}×{GRID_SIDE} · lato {GRIDS.find((g) => g.id === grid)?.span} ·{' '}
          {hiRes ? 'modello ICON-2I a 2,2 km' : 'blend multi-modello, più liscio: i picchi si attenuano'}
        </div>
        {hazard.id === 'hail' ? (
          <>
            <strong className="text-ink-sec">Come si legge.</strong> Open-Meteo non pubblica un diametro di grandine
            previsto, quindi l&apos;indice è ricostruito dai parametri d&apos;ambiente con la formula{' '}
            <strong>SHIP</strong> (Significant Hail Parameter, Storm Prediction Center): CAPE, rapporto di mescolanza,
            gradiente termico 700–500 hPa, temperatura a 500 hPa, shear del vento 0–6 km e quota dello zero termico.
            SHIP &gt; 1 indica ambiente favorevole a grandine oltre i 4 cm. Poiché SHIP descrive il potenziale e non
            l&apos;innesco, l&apos;indice orario pesa SHIP con la convezione prevista. La <strong>probabilità</strong>{' '}
            delle zone è invece l&apos;accordo fra tre modelli indipendenti (ECMWF, GFS, ICON): bassa = uno prevede
            l&apos;innesco, media = due, alta = tutti e tre; &quot;solo ambiente&quot; = nessuno lo prevede — le
            condizioni per la grandine ci sarebbero, manca il temporale che la produce. Questo valore va interpretato con maggiore cautela
            rispetto a raffiche e accumuli. La sua funzione è indicativa solo per localizzazione e tempistica, meno per
            l&apos;entità della grandine.
          </>
        ) : hazard.id === 'wind' ? (
          <>
            <strong className="text-ink-sec">Come si legge.</strong> A differenza della grandine, qui non si ricostruisce
            niente: la raffica è <strong>output diretto del modello</strong> (`wind_gusts_10m`), quindi più affidabile.
            Il valore è il massimo previsto nella giornata per ogni cella, dal modello a più alta risoluzione; la
            probabilità è l&apos;accordo fra tre modelli su raffiche ≥ 60 km/h. La riga sotto distingue i due casi che
            contano: raffica <em>nel temporale</em> — è un downburst, breve e localizzato — oppure vento di gradiente,
            più costante e prevedibile. Sopra i 90 km/h si entra nel campo dei danni.
          </>
        ) : (
          <>
            <strong className="text-ink-sec">Come si legge.</strong> Anche qui il dato è{' '}
            <strong>output diretto del modello</strong>, non una stima. Il numero grande è l&apos;accumulo totale sulla
            finestra vista: è quello che allaga. La punta oraria accanto dice se arriva tutto insieme o distribuito —
            30 mm in un&apos;ora sono un nubifragio, gli stessi 30 mm in dodici ore sono pioggia normale. La
            probabilità delle zone è l&apos;accordo fra tre modelli su un accumulo giornaliero ≥ 10 mm. Le soglie del
            colore sono sull&apos;accumulo, quelle del grafico orario sull&apos;intensità. Attenzione ai confronti: questi
            mm sono <strong>medie d&apos;area</strong> della cella di griglia; nel cuore di un temporale il massimo
            puntuale vale tipicamente 2–3 volte tanto. Un prodotto che mostra &quot;70 mm&quot; sulla traccia di una
            cella e questa mappa che dice 30 stanno descrivendo lo stesso evento.
          </>
        )}
      </div>
    </Card>
  )
}
