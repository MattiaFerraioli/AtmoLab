import WeatherIcon from './WeatherIcon'
import { Skeleton } from './Ui'
import { wmoIcon, wmoIntensity, wmoText } from '../lib/wmo'
import { nf } from '../lib/format'

export default function DailyStrip({ forecast, selectedDay, onSelectDay }) {
  if (!forecast) {
    return (
      <div className="flex gap-2.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[184px] w-[116px] shrink-0" />
        ))}
      </div>
    )
  }

  const d = forecast.daily
  const globalMin = Math.min(...d.temperature_2m_min)
  const globalMax = Math.max(...d.temperature_2m_max)
  const range = globalMax - globalMin || 1

  return (
    <div className="flex snap-x snap-proximity gap-2.5 overflow-x-auto px-0.5 pb-2.5 pt-1">
      {d.time.map((iso, i) => {
        const date = new Date(`${iso}T12:00`)
        const lo = d.temperature_2m_min[i]
        const hi = d.temperature_2m_max[i]
        const left = ((lo - globalMin) / range) * 100
        const width = Math.max(6, ((hi - lo) / range) * 100)
        const mm = d.precipitation_sum[i]
        const prob = d.precipitation_probability_max[i]
        const isToday = i === 0
        const isSelected = selectedDay === iso
        const dimmed = selectedDay && !isSelected

        return (
          <button
            key={iso}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} — ${
              isSelected ? 'togli il filtro' : 'filtra i dati su questo giorno'
            }`}
            onClick={() => onSelectDay(isSelected ? null : iso)}
            className={`flex w-[128px] shrink-0 cursor-pointer snap-start flex-col rounded-2xl border bg-surface p-2.5 text-center transition hover:-translate-y-0.5 ${
              isSelected
                ? 'border-accent ring-2 ring-accent/35'
                : isToday
                  ? 'border-accent'
                  : 'border-hair hover:border-axis'
            } ${dimmed ? 'opacity-55 hover:opacity-100' : ''}`}
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-sec">
              {isToday ? 'Oggi' : date.toLocaleDateString('it-IT', { weekday: 'short' })}
            </div>
            <div className="text-[11px] text-ink-muted">
              {date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
            </div>

            <WeatherIcon
              kind={wmoIcon(d.weather_code[i])}
              // Un solo fulmine = "possibili temporali": il codice temporalesco
              // viene declassato quando la probabilità del giorno è bassa.
              intensity={
                wmoIcon(d.weather_code[i]) === 'storm' && (prob ?? 0) < 40 ? 1 : wmoIntensity(d.weather_code[i])
              }
              size={40}
              className="mx-auto my-1.5 block"
              title={wmoText(d.weather_code[i])}
            />

            <div className="tnum text-[18px] font-semibold">{Math.round(hi)}°</div>
            <div className="relative mx-1 my-1.5 h-[5px] overflow-hidden rounded-full bg-grid">
              <span
                className="absolute inset-y-0 rounded-full bg-[linear-gradient(90deg,#3987e5,#eda100,#e34948)]"
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </div>
            <div className="tnum text-[14px] text-ink-muted">{Math.round(lo)}°</div>

            {/* Due righe sempre presenti, anche a zero: percentuale sopra e
                quantità sotto restano incolonnate fra tutte le card. */}
            <div className="mt-auto pt-1.5">
              <div className="tnum text-[11.5px] font-semibold whitespace-nowrap text-accent">{prob ?? 0}%</div>
              <div className="tnum text-[11px] whitespace-nowrap text-ink-muted">
                {mm > 0 ? `${nf(mm, 1)} mm` : '0 mm'}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
