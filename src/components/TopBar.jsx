import SearchBox from './SearchBox'
import PlacesMenu from './PlacesMenu'
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
  hidden = false,
  theme,
  onToggleTheme,
  onPick,
  onLocate,
  favourites,
  recent,
  onRemoveFavourite,
  onClearRecent,
  updatedAt,
  dataLoading,
  dataError,
  palette,
  onRefresh,
}) {
  return (
    <header className={`safe-top safe-x sticky top-0 z-[900] glass-bar border-b border-hair transition-transform duration-300 ease-out ${hidden ? "-translate-y-full" : "translate-y-0"}`}>
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-2 px-5 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <div className="order-1 flex shrink-0 items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
          <img src="/favicon.png" alt="" width="24" height="24" className="h-6 w-6" />
          <span className="hidden sm:inline">AtmoLab</span>
        </div>

        <div className="relative order-3 flex w-full min-w-0 sm:order-2 sm:w-auto sm:max-w-[440px] sm:flex-1">
          <SearchBox onPick={onPick} />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              title="Usa la mia posizione"
              aria-label="Usa la mia posizione"
              onClick={onLocate}
              className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full text-ink-muted transition duration-300 hover:bg-fill-hover hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="h-[16px] w-[16px]">
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="12" r="8" />
                <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
              </svg>
            </button>
            <PlacesMenu
              favourites={favourites}
              recent={recent}
              onPick={onPick}
              onRemoveFavourite={onRemoveFavourite}
              onClearRecent={onClearRecent}
            />
          </div>
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
