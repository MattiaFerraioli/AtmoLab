import SearchBox from './SearchBox'
import FreshnessLed from './FreshnessLed'
import { IconButton } from './Ui'

const SunGlyph = (
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </>
)
const MoonGlyph = <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />

export default function TopBar({
  theme,
  onToggleTheme,
  onPick,
  onLocate,
  updatedAt,
  dataLoading,
  dataError,
  palette,
  onRefresh,
}) {
  return (
    <header className="safe-top safe-x sticky top-0 z-[900] border-b border-hair bg-plane/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        <div className="order-1 flex shrink-0 items-center gap-2 text-[16px] font-bold tracking-[-0.02em]">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" className="h-6 w-6">
            <circle cx="8" cy="8" r="3.2" stroke="#eda100" />
            <path d="M8 2.4v1.3M8 12.3v1.3M2.4 8h1.3M12.3 8h1.3M4.1 4.1l.9.9M11 11l.9.9M11.9 4.1l-.9.9M5 11l-.9.9" stroke="#eda100" />
            <path
              d="M17.5 20.5H8.8a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 9.9 1.1 3.3 3.3 0 0 1-.8 6.5Z"
              stroke="var(--accent)"
            />
          </svg>
          <span className="hidden sm:inline">AtmoLab</span>
        </div>

        <div className="order-3 flex w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
          <SearchBox onPick={onPick} />
        </div>

        {/* order: su mobile le azioni restano accanto al brand e la ricerca
            scende sotto, invece di spingere i pulsanti su una terza riga. */}
        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <FreshnessLed
            updatedAt={updatedAt}
            loading={dataLoading}
            error={dataError}
            palette={palette}
            onRefresh={onRefresh}
          />
          <IconButton title="Usa la mia posizione" onClick={onLocate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="h-[18px] w-[18px]">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" />
              <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
            </svg>
          </IconButton>
          <IconButton title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'} onClick={onToggleTheme}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="h-[18px] w-[18px]">
              {theme === 'dark' ? SunGlyph : MoonGlyph}
            </svg>
          </IconButton>
        </div>
      </div>
    </header>
  )
}
