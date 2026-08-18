const SUN = '#eda100'
const MOON = '#dfe6ef'
const CLOUD_LIGHT = '#9db4cc'
const CLOUD = '#6b8199'
const RAIN = '#3987e5'
const SNOW = '#e4f0ff'
const BOLT = '#eda100'

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315]

/** La base della nuvola va da 9.5 a 39: la precipitazione resta dentro. */
const SPREAD = { 1: [24], 2: [18.5, 29.5], 3: [15.5, 24, 32.5] }
const BOLT_SCALE = { 1: 1.05, 2: 0.9, 3: 0.76 }

const clampLevel = (n) => (n >= 3 ? 3 : n <= 1 ? 1 : 2)

/** Goccia con punta in alto e ventre arrotondato: i trattini obliqui di prima
 *  leggevano come graffi, non come pioggia. */
const DROP = 'M0 0c1.35 2.4 2.5 4.1 2.5 5.5a2.5 2.5 0 0 1-5 0C-2.5 4.1-1.15 2.4 0 0Z'
const BOLT_PATH = 'M6.5 0 0 9h4.2l-1.7 7L11 7H6.2Z'

function SunDisc({ cx, cy, r, rayLen, rayW }) {
  return (
    <g fill={SUN}>
      <circle cx={cx} cy={cy} r={r} />
      {RAYS.map((a) => (
        <rect
          key={a}
          x={cx - rayW / 2}
          y={cy - r - rayLen - 2}
          width={rayW}
          height={rayLen}
          rx={rayW / 2}
          transform={`rotate(${a} ${cx} ${cy})`}
        />
      ))}
    </g>
  )
}

/**
 * Nuvola morbida: cupola grande, lobo laterale e base a pillola nella stessa
 * tinta piena — l'unione visiva dà un profilo gonfio, solo curve convesse.
 * La versione a contorno unico usava raccordi concavi fra cupola e spalle:
 * il profilo risultava pizzicato, da qui il redesign.
 */
const Cloud = ({ fill, dx = 0, dy = 0, scale = 1 }) => (
  <g fill={fill} transform={`translate(${dx} ${dy}) scale(${scale})`}>
    <circle cx="20" cy="21" r="10.5" />
    <circle cx="30.5" cy="24.5" r="8.5" />
    <rect x="9.5" y="24" width="29.5" height="10" rx="5" />
  </g>
)

const Drops = ({ level, scale = 1, y = 36.5, slant = 0 }) => (
  <g fill={RAIN}>
    {SPREAD[level].map((x) => (
      <path key={x} d={DROP} transform={`translate(${x} ${y}) rotate(${slant}) scale(${scale})`} />
    ))}
  </g>
)

const Flakes = ({ level }) => (
  <g fill={SNOW}>
    {SPREAD[level].map((x, i) => (
      <circle key={x} cx={x} cy={i % 2 ? 44 : 41} r="2.4" />
    ))}
  </g>
)

const Bolts = ({ level }) => {
  const s = BOLT_SCALE[level]
  return (
    <g fill={BOLT}>
      {SPREAD[level].map((x) => (
        <path key={x} d={BOLT_PATH} transform={`translate(${x - 5.5 * s} 36) scale(${s})`} />
      ))}
    </g>
  )
}

function Glyph({ kind, isDay, level }) {
  switch (kind) {
    case 'sun':
      return isDay ? (
        <SunDisc cx={24} cy={25} r={10} rayLen={6.5} rayW={2.4} />
      ) : (
        <path d="M30 31.5A11 11 0 0 1 19.5 16 12 12 0 1 0 33 34a11 11 0 0 1-3-2.5Z" fill={MOON} />
      )

    case 'sun-cloud':
      return (
        <>
          {isDay ? (
            <SunDisc cx={32} cy={15} r={7} rayLen={4.4} rayW={1.9} />
          ) : (
            <path d="M35 21a8.5 8.5 0 0 1-8-11.5A9.2 9.2 0 1 0 37.5 23 8.5 8.5 0 0 1 35 21Z" fill={MOON} />
          )}
          <Cloud fill={CLOUD_LIGHT} dx={1.5} dy={7.5} scale={0.84} />
        </>
      )

    case 'fog':
      return (
        <>
          <Cloud fill={CLOUD} />
          <g stroke={CLOUD_LIGHT} strokeWidth="2.8" strokeLinecap="round">
            <path d="M12 39.5h24" />
            <path d="M16 45h16" opacity=".55" />
          </g>
        </>
      )

    case 'drizzle':
      return (
        <>
          <Cloud fill={CLOUD_LIGHT} />
          <Drops level={level} scale={0.62} y={37} />
        </>
      )

    case 'rain':
      return (
        <>
          <Cloud fill={CLOUD} />
          <Drops level={level} scale={0.95} />
        </>
      )

    case 'showers':
      return (
        <>
          <Cloud fill={CLOUD} />
          <Drops level={level} scale={1.15} y={36} slant={14} />
        </>
      )

    case 'sleet':
      return (
        <>
          <Cloud fill={CLOUD} />
          <g fill={RAIN}>
            <path d={DROP} transform="translate(17.5 37) scale(0.9)" />
            <path d={DROP} transform="translate(30.5 37) scale(0.9)" />
          </g>
          <circle cx="24" cy="44" r="2.4" fill={SNOW} />
        </>
      )

    case 'snow':
      return (
        <>
          <Cloud fill={CLOUD} />
          <Flakes level={level} />
        </>
      )

    case 'storm':
      return (
        <>
          <Cloud fill={CLOUD} />
          <Bolts level={level} />
        </>
      )

    case 'cloud':
    default:
      return <Cloud fill={CLOUD} />
  }
}

export default function WeatherIcon({ kind, isDay = true, intensity = 2, size = 48, className = '', title }) {
  return (
    <svg
      viewBox="0 0 48 52"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <Glyph kind={kind} isDay={isDay} level={clampLevel(intensity)} />
    </svg>
  )
}
