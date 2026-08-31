import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HailMap from './HailMap'
import { Card, Message, Segmented, Skeleton } from './Ui'
import { GRID_SIDE, HAIL_DAYS, HAIL_GRID, buildNarrative, capeBand, hailSize, hasRotationPotential, peakOf, steeringOf } from '../lib/hail'
import { HAZARDS, SEVERITY_COLORS, SEVERITY_LABELS, applyHazard, hailZoneStep, hazardById, severityOf, zoneSpecOf } from '../lib/hazards'
import { AGREEMENT_COUNT, cellFraction, fractionLabel, fractionText } from '../lib/agreement'
import { fmtDayHour, nf, relativePosition } from '../lib/format'

/**
 * "42 km a NE", ma la cella che CONTIENE la località si chiama col suo nome.
 *
 * Il riconoscimento non può basarsi sulla distanza: da quando la griglia è
 * agganciata al reticolo fisso, il nodo più vicino può stare fino a 24 km, e
 * la soglia dei 6 km di `relativePosition` non scattava più — la città
 * spariva dalle etichette, sostituita da "13 km a NO". Si confronta invece
 * l'identità della cella: quella di casa è una sola, e le altre distano un
 * passo intero (39 km), quindi non c'è ambiguità.
 */
const isHome = (home, lat, lon) => Boolean(home) && home.gridLat === lat && home.gridLon === lon

const placeLabel = (location, lat, lon, home) =>
  isHome(home, lat, lon)
    ? location.name
    : relativePosition(location.latitude, location.longitude, lat, lon)

/* Come placeLabel, ma da incastrare in una frase: "a Cogliate" per la cella
   di casa, "55 km a E" per una remota — con la preposizione davanti
   verrebbe "attesa a 55 km a E". */
const placePhrase = (location, lat, lon, home) =>
  isHome(home, lat, lon)
    ? ` a ${location.name}`
    : ` ${relativePosition(location.latitude, location.longitude, lat, lon)}`
import { useCellName, useIsMobile } from '../lib/hooks'


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
        {/* Per la grandine il "valore" è l'indice SHIP: si mostra solo la
            fascia di diametro, che è la sua unica lettura sensata. */}
        {hazard.id === 'hail'
          ? `${hazard.hourly.label} ${hailSize(p.ship).label}`
          : `${hazard.hourly.label} ${nf(value ?? 0, hazard.hourly.dec)} ${hazard.hourly.unit}`}
      </div>
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
  const step = HAIL_GRID.step

  // Cambiando località o giorno, il dettaglio torna sulla cella centrale.
  useEffect(() => setSelected(null), [location, targetDay])

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
      /* Anche ora per ora, non solo il picco: serve a contornare le barre del
         grafico con lo stesso tratto delle zone. La pioggia ha l'accordo per
         giorno, non per ora, quindi vale lo stesso valore su tutta la
         giornata. */
      const key = hazardId === 'wind' ? 'gust' : 'conv'
      const perOra =
        hazardId === 'rain'
          ? null
          : new Map(agreement[k].series.filter((p) => valid.has(p.t)).map((p) => [p.t, p[key]]))
      return { ...c, prob: frac, probAt: perOra }
    })
  }, [cells, hazardId, agreement, targetDay])
  /**
   * Classifica delle celle, con la STESSA regola della mappa: fuori quelle in
   * cui nessun modello prevede il temporale.
   *
   * Senza il filtro la lista contraddiceva la mappa — in cima celle da 2-4 cm
   * con 0/3, cioè proprio quelle che le macchie non disegnano più. Se però
   * NESSUNA cella ha una previsione si torna all'elenco completo: il riepilogo
   * è dichiaratamente condizionale ("in caso di convezione") e lasciarlo vuoto
   * nasconderebbe l'unica informazione disponibile.
   */
  const ranked = useMemo(() => {
    const tutte = [...(hazardCells ?? [])].sort((a, b) => b.metric.value - a.metric.value)
    if (hazard.id !== 'hail') return tutte
    const previste = tutte.filter((c) => c.prob !== 0)
    return previste.length ? previste : tutte
  }, [hazardCells, hazard.id])
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
  /* La cella di casa è quella che contiene la località, non quella al centro
     della griglia: col reticolo fisso le due non coincidono più. */
  const home = useMemo(() => {
    if (!hazardCells?.length) return null
    let best = null
    let bestD = Infinity
    for (const c of hazardCells) {
      const d = Math.hypot(c.gridLat - location.latitude, c.gridLon - location.longitude)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }, [hazardCells, location.latitude, location.longitude])
  const focus = selected ?? home ?? worst

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
  /* Grandine con probabilità nota e nulla su TUTTE le celle: le zone non
     vengono disegnate (vedi `buildZones`), quindi va detto perché. Se l'accordo
     fra modelli non è arrivato, `prob` è null e non si conclude niente. */
  const noneForecast =
    hazard.id === 'hail' &&
    Boolean(hazardCells?.length) &&
    hazardCells.every((c) => c.prob === 0) &&
    !quiet

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-hair p-3 sm:gap-3 sm:p-4">
        <Segmented
          ariaLabel="Pericolo da mappare"
          options={HAZARDS.map((h) => ({ value: h.id, label: h.label }))}
          value={hazardId}
          onChange={onHazardChange}
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
      </div>

      {narrative && (
        <div className="border-b border-hair p-4">
          <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-ink-muted">In sintesi</div>
          {/* Nessun tetto alla misura: `max-w-[75ch]` mandava a capo a metà
              riquadro con mezzo schermo vuoto a destra. Non serve nemmeno un
              limite di sicurezza, perché la pagina è già larga al massimo
              1180 px, quindi la riga non può diventare illeggibile. */}
          <p className="text-[13.5px] leading-relaxed text-ink-sec">
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
              {hazard.id === 'hail' ? (worst?.metric.badge ?? '—') : SEVERITY_LABELS[worstSeverity]}
            </span>
          </div>
          <div className="mt-1 truncate text-[12.5px] text-ink-sec">
            {hazard.id === 'hail'
              ? (quiet ? 'Ambiente non favorevole' : 'In caso di convezione')
              : worst?.prob != null
                ? `Previsto da ${fractionText(worst.prob)}`
                : (worst?.metric.detail ?? '–')}
          </div>
        </div>

        {/* Le due grandezze stanno affiancate e restano distinte: il badge
            dice quanto grossi sarebbero i chicchi, questa tile quanto è
            probabile che il temporale ci sia. Per vento e pioggia la
            grandezza è output diretto del modello e resta dov'era. */}
        {hazard.id === 'hail' ? (
          <Tile
            k="Probabilità di temporali"
            sub={worst?.prob != null ? fractionText(worst.prob) : 'Accordo fra modelli non disponibile'}
          >
            <span className="text-[17px]">
              {worst?.prob != null ? fractionLabel(worst.prob) : '–'}
            </span>
          </Tile>
        ) : (
          <Tile
            k={hazard.id === 'wind' ? 'Raffica massima' : 'Accumulo massimo'}
            sub={worst?.metric.note ?? '–'}
          >
            {worst?.metric.badge ?? '—'}
          </Tile>
        )}

        {/* Distanza e direzione come valore: è l'informazione utile e sempre
            sensata. Il nome del posto sta sotto, come contesto — su celle
            remote o sul mare il reverse geocoding restituisce toponimi oscuri,
            che in testata sarebbero peggio delle coordinate che sostituiscono. */}
        <Tile k="Dove" sub={worstName ?? undefined}>
          <span className="text-[17px]">
            {worst ? placeLabel(location, worst.gridLat, worst.gridLon, home) : '–'}
          </span>
        </Tile>

        <Tile
          k="Quando"
          sub={
            quiet
              ? 'Nessun picco significativo'
              : worst?.cape != null
                ? `Energia ${capeBand(worst.cape)} · CAPE ${nf(worst.cape, 0)} J/kg`
                : 'Ora del picco nell\u2019area'
          }
        >
          <span className="text-[17px]">{worst?.metric.at && !quiet ? fmtDayHour(worst.metric.at) : '–'}</span>
        </Tile>

        <Tile
          k="Raffiche nei temporali"
          /* Corta di proposito: la tile taglia il testo con `truncate`, e
             "Previste dai modelli nelle ore convettive" arrivava a schermo
             come "...nelle ore c…", cioè illeggibile. */
          sub={gustMax ? 'Solo nelle ore convettive' : 'Nessuna convezione prevista'}
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
          {/* Con zero modelli su tre la mappa non evidenzia niente, di
              proposito: senza una riga che lo dica sembrerebbe rotta. */}
          {noneForecast && (
            <div className="mt-2.5 text-[12px] text-ink-muted">
              Nessuno dei {AGREEMENT_COUNT} modelli prevede temporali{' '}
              {dayOffset === 0 ? 'per il resto della giornata' : 'in questo giorno'}: nessuna area
              evidenziata. L&apos;ambiente sarebbe da {worst?.metric.badge}, se un temporale si
              formasse.
            </div>
          )}
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
                  title={`Accordo fra ${AGREEMENT_COUNT} modelli (ECMWF, GFS, ICON): bassa = uno prevede il temporale, media = due, alta = tutti e tre. Il conteggio esatto è scritto su ogni zona.`}
                >
                  Probabilità:
                </span>
                {[
                  /* Il puntinato deve leggersi come punti, non come un
                     tratteggio corto: con "2 6" si distingueva a fatica dal
                     medio. Stessi rapporti del tratto sulla mappa, scalati
                     per questi 24 px di anteprima. */
                  ['Bassa', '1 5'],
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
              {/* Il pericolo lo dichiara `quietText`: prima la frase diceva
                  "grandine" anche mentre si guardava vento o pioggia. */}
              {hazard.quietText} {dayOffset === 0 ? 'per il resto della giornata' : 'in questo giorno'}.
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
                          {placeLabel(location, c.gridLat, c.gridLon, home)}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted">
                          {c.metric.at ? fmtDayHour(c.metric.at) : '–'} ·{' '}
                          {/* Il diametro è già nella colonna a destra: qui ci va
                              l'altra metà della storia, quanto è probabile. */}
                          {hazard.id === 'hail'
                            ? c.prob != null
                              ? `prob. ${fractionLabel(c.prob)} · ${Math.round(c.prob * AGREEMENT_COUNT)}/${AGREEMENT_COUNT}`
                              : 'probabilità n/d'
                            : SEVERITY_LABELS[c.severity]}
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
          {`${hazard.hourly.title}${focus ? placePhrase(location, focus.gridLat, focus.gridLon, home) : ''}`}
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
            {/* Per la grandine l'asse Y porterebbe l'indice SHIP, che da solo
                non dice niente a chi legge: nascosto. La scala la danno il
                colore delle barre (le stesse fasce della legenda sotto la
                mappa) e il tooltip, che scrive la fascia in centimetri.
                Vento e pioggia hanno unità vere e tengono il loro asse. */}
            <YAxis
              hide={hazard.id === 'hail'}
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
            {/* Il contorno delle barre porta la probabilità con lo stesso
                tratto delle zone sulla mappa: puntinato bassa, tratteggiato
                media, continuo alta. Così l'ora per ora non racconta solo
                quanto sarebbe grosso il chicco, ma anche quanto è probabile
                che quell'ora abbia un temporale. Senza accordo, nessun
                contorno: non si inventa un tratto. */}
            <Bar dataKey={hazard.hourly.dataKey} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {focusSeries.map((p) => {
                const frazione = focus?.probAt?.get(p.t) ?? (hazard.id === 'rain' ? focus?.prob : null)
                const etichetta = fractionLabel(frazione)
                return (
                  <Cell
                    key={p.t}
                    fill={SEVERITY_COLORS[severityOf(hazard.hourly.pick(p), hazard.hourly.bands)]}
                    stroke={etichetta ? palette.ink : undefined}
                    /* Pieno e spesso: a opacità ridotta il tratto si perdeva
                       nel colore della barra, che è la cosa che deve leggersi
                       a colpo d'occhio insieme al riempimento. */
                    strokeOpacity={etichetta ? 1 : 0}
                    strokeWidth={etichetta ? 2 : 0}
                    strokeDasharray={
                      etichetta === 'bassa' ? '2 3' : etichetta === 'media' ? '6 3' : undefined
                    }
                  />
                )
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-hair p-4 text-[12.5px] leading-relaxed text-ink-muted">
        <div className="mb-2">
          Griglia {GRID_SIDE}×{GRID_SIDE} · lato {HAIL_GRID.span} ·{' '}
          {hiRes ? 'modello ICON-2I a 2,2 km' : 'blend multi-modello, più liscio: i picchi si attenuano'}
        </div>
        {hazard.id === 'hail' ? (
          <>
            Due numeri separati, come negli outlook convettivi: il <strong>diametro</strong> dice quanto
            sarebbero grossi i chicchi <em>se</em> il temporale si formasse — stimato dall&apos;indice
            <strong> SHIP</strong>, non un dato diretto del modello, quindi da prendere con cautela sull&apos;entità
            del chicco. La <strong>probabilità</strong> dice quanto è probabile che si formi, ed è l&apos;accordo fra
            tre modelli. Nessuno dei due contiene l&apos;altro.
          </>
        ) : hazard.id === 'wind' ? (
          <>
            La raffica è <strong>output diretto del modello</strong>. Sopra i 90 km/h si entra nel campo dei danni.
          </>
        ) : (
          <>
            L&apos;accumulo è <strong>output diretto del modello</strong>, media sulla cella di griglia: il massimo
            puntuale nel cuore di un temporale può valere 2–3 volte tanto.
          </>
        )}
      </div>
    </Card>
  )
}
