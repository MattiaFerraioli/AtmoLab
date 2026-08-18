import WeatherIcon from './WeatherIcon'
import { DpcAlertBand } from './DpcAlerts'
import { Skeleton } from './Ui'
import { wmoIcon, wmoIntensity, wmoText } from '../lib/wmo'
import { aqiBand, flag, fmtTime, nf, windDir } from '../lib/format'

/**
 * Niente riquadro attorno: le statistiche vivono direttamente sul gradiente,
 * separate da hairline. Un box con bordi netti dentro una card arrotondata
 * legge come un elemento estraneo.
 */
function Stat({ k, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.06em] opacity-75">{k}</div>
      <div className="tnum mt-0.5 text-[17px] font-semibold">{children}</div>
    </div>
  )
}
const U = ({ children }) => <span className="text-[11.5px] font-normal opacity-80">{children}</span>

export default function CurrentHero({ location, forecast, air, palette, isFavourite, onToggleFavourite, dpcAlert }) {
  const shell =
    'relative overflow-hidden rounded-[24px] card-shadow text-white ' +
    'bg-[linear-gradient(135deg,var(--hero-a),var(--hero-b))]'

  if (!forecast) {
    return (
      <div className={shell}>
        <div className="p-6">
          <Skeleton className="h-[168px] w-full opacity-30" />
        </div>
      </div>
    )
  }

  const c = forecast.current
  const daily = forecast.daily
  const aqi = air?.current?.european_aqi ?? null
  const band = aqiBand(aqi, palette)
  const subtitle = [location.admin1, location.country].filter(Boolean).join(' · ')

  return (
    <div className={shell}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_88%_-10%,rgba(255,255,255,0.28),transparent_60%)]" />

      <div className="relative z-[1] grid gap-5 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[22px] leading-none">{flag(location.country_code)}</span>
            <h1 className="text-[24px] font-bold tracking-[-0.02em]">{location.name}</h1>
            <button
              onClick={onToggleFavourite}
              title={isFavourite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
              aria-pressed={isFavourite}
              className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border transition ${
                isFavourite
                  ? 'border-[#eda100] bg-[#eda100] text-[#1a1a19]'
                  : 'border-white/25 bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill={isFavourite ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                className="h-[17px] w-[17px]"
              >
                <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
              </svg>
            </button>
          </div>

          <div className="mt-1 text-[13px] break-words opacity-80">
            {subtitle && `${subtitle} · `}
            {location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}°
            {forecast.elevation != null && ` · ${Math.round(forecast.elevation)} m s.l.m.`} · {forecast.timezone}
          </div>

          <div className="mt-4 flex items-center gap-3 sm:gap-5">
            <WeatherIcon
              kind={wmoIcon(c.weather_code)}
              isDay={c.is_day === 1}
              intensity={wmoIntensity(c.weather_code)}
              size={92}
              className="shrink-0"
              title={wmoText(c.weather_code)}
            />
            <div>
              <div className="text-[48px] font-light leading-none tracking-[-0.04em] sm:text-[60px]">
                {Math.round(c.temperature_2m)}
                <span className="align-top text-[22px] sm:text-[26px]">°C</span>
              </div>
              <div className="mt-1 text-[17px] font-semibold">{wmoText(c.weather_code)}</div>
              <div className="text-[13.5px] opacity-85">
                Percepita {Math.round(c.apparent_temperature)}°C · aggiornato {fmtTime(c.time)}
              </div>
            </div>
          </div>
        </div>

        {/* Nessun filetto: righe e colonne sono già leggibili dall'allineamento,
            e una gabbia di linee dentro una card arrotondata pesa e basta. */}
        <div className="grid grid-cols-2 gap-x-7 gap-y-5 self-center sm:grid-cols-3">
          <Stat k="Vento">
            {Math.round(c.wind_speed_10m)}
            <U> km/h {windDir(c.wind_direction_10m)}</U>
          </Stat>
          <Stat k="Raffiche">
            {Math.round(c.wind_gusts_10m)}
            <U> km/h</U>
          </Stat>
          <Stat k="Umidità">
            {c.relative_humidity_2m}
            <U> %</U>
          </Stat>
          <Stat k="Pressione">
            {Math.round(c.pressure_msl)}
            <U> hPa</U>
          </Stat>
          <Stat k="Nuvole">
            {c.cloud_cover}
            <U> %</U>
          </Stat>
          <Stat k="UV max oggi">{nf(daily.uv_index_max[0], 1)}</Stat>
          <Stat k="Alba">{fmtTime(daily.sunrise[0])}</Stat>
          <Stat k="Tramonto">{fmtTime(daily.sunset[0])}</Stat>
          <Stat k="Qualità aria">
            <span className="flex items-center gap-1.5 text-[14px]">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: band.color }} />
              {band.label}
              {aqi != null && <U>({Math.round(aqi)})</U>}
            </span>
          </Stat>
        </div>
      </div>

      <DpcAlertBand alert={dpcAlert} />
    </div>
  )
}
