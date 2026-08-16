import { MAX_MODELS, MODELS } from '../lib/constants'

export default function ModelChips({ selected, slots, palette, availability, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-hair p-4">
      {MODELS.map((m) => {
        const on = selected.includes(m.id)
        const slot = slots.get(m.id)
        const color = on && slot !== undefined ? palette.series[slot] : palette.axis
        // availability === false ⇒ selezionato ma senza dati per questa località
        const unavailable = on && availability?.[m.id] === false
        const full = !on && selected.length >= MAX_MODELS

        return (
          <button
            key={m.id}
            onClick={() => onToggle(m.id)}
            aria-pressed={on}
            title={`${m.org} · ${m.res} · ${m.scope}${full ? ` — massimo ${MAX_MODELS} modelli sul grafico` : ''}`}
            className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-3 text-[13px] font-semibold transition ${
              on ? 'text-ink' : 'border-hair text-ink-sec hover:border-axis'
            } ${unavailable ? 'opacity-45' : ''} ${full ? 'cursor-not-allowed opacity-50' : ''}`}
            style={on ? { borderColor: color } : undefined}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span>{m.name}</span>
            <span className="text-[11.5px] font-normal text-ink-muted">
              {m.org}
              {unavailable && ' · n/d qui'}
            </span>
          </button>
        )
      })}
      {MODELS.length > MAX_MODELS && (
        <span className="self-center pl-1 text-[12px] text-ink-muted">
          {selected.length}/{MAX_MODELS} · oltre {MAX_MODELS} serie i colori non restano distinguibili
        </span>
      )}
    </div>
  )
}
