import { flag } from '../lib/format'

export default function Favourites({ items, onSelect, onRemove }) {
  if (!items.length) return null
  return (
    <div className="mt-3.5 flex flex-wrap gap-2">
      {items.map((f) => (
        <span
          key={`${f.latitude},${f.longitude}`}
          className="inline-flex items-center gap-2 rounded-full border border-hair bg-surface py-1.5 pl-3 pr-1.5 text-[13px] font-semibold transition hover:border-axis"
        >
          <button onClick={() => onSelect(f)} className="cursor-pointer">
            {flag(f.country_code)} {f.name}
          </button>
          <button
            onClick={() => onRemove(f)}
            title={`Rimuovi ${f.name} dai preferiti`}
            aria-label={`Rimuovi ${f.name} dai preferiti`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[15px] leading-none text-ink-muted transition hover:bg-hair hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
