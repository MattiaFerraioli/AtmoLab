import { MAX_MODELS, MODELS } from '../lib/constants'

export default function ModelChips({ selected, slots, palette, availability, dayFiltered, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-hair p-4">
      {MODELS.map((m) => {
        const on = selected.includes(m.id)
        const slot = slots.get(m.id)
        const color = on && slot !== undefined ? palette.series[slot] : palette.axis
        /* availability === false ⇒ nessun dato nella finestra guardata: fuori
           orizzonte se c'è un giorno selezionato, fuori copertura territoriale
           altrimenti. Vale per TUTTI i chip, non solo per gli accesi: prima il
           controllo scattava solo da accesi, così un chip spento ma scaduto
           per quel giorno restava cliccabile e finiva in lista da morto. */
        const unavailable = availability?.[m.id] === false
        const full = !on && selected.length >= MAX_MODELS
        const blocked = !on && (full || unavailable)

        return (
          <button
            key={m.id}
            /* Da acceso resta sempre cliccabile: togliere un modello morto
               deve essere possibile. Da spento, se non ha dati, il click non
               deve inserirlo. */
            onClick={() => !blocked && onToggle(m.id)}
            aria-pressed={on}
            aria-disabled={blocked || undefined}
            title={`${m.org} · ${m.res} · ${m.scope}${full ? ` — massimo ${MAX_MODELS} modelli sul grafico` : ''}${
              !on && unavailable
                ? ` — ${dayFiltered ? 'nessun dato per il giorno selezionato' : 'nessun dato per questa località'}`
                : ''
            }`}
            className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-3 text-[13px] font-semibold transition duration-300 ${
              on ? 'text-ink' : 'border-hair text-ink-sec hover:border-axis'
            } ${unavailable ? 'opacity-45' : ''} ${blocked ? 'cursor-not-allowed opacity-50' : ''}`}
            style={on ? { borderColor: color } : undefined}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span>{m.name}</span>
            <span className="text-[11.5px] font-normal text-ink-muted">
              {m.org}
              {unavailable && (dayFiltered ? ' · oltre il suo orizzonte' : ' · n/d qui')}
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
