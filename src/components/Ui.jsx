export function Card({ className = '', children }) {
  return (
    <div className={`glass overflow-hidden rounded-[20px] ${className}`}>{children}</div>
  )
}

export function Section({ title, hint, action, children }) {
  return (
    <section className="mt-7">
      {/* min-w-0 + basis-full: senza, l'hint è un flex item che non si
          restringe e allarga il documento oltre il viewport su mobile. */}
      <div className="mb-3 ml-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
        {hint && <span className="min-w-0 basis-full text-[13px] text-ink-muted sm:basis-auto">{hint}</span>}
        {action && <div className="ml-auto self-center">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Barra di stato del filtro giorno: dice cosa è filtrato e come uscirne. */
export function DayFilterBar({ label, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-accent/10 px-3.5 py-2.5 text-[13px]">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/25 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3 w-3">
          <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
        </svg>
      </span>
      <span>
        Dati filtrati su <strong className="font-semibold">{label}</strong>
      </span>
      <button
        onClick={onClear}
        className="ml-auto cursor-pointer rounded-full bg-fill px-3 py-1.5 text-[12.5px] font-semibold text-ink-sec transition duration-300 hover:text-ink"
      >
        ✕ Tornare ai 14 giorni
      </button>
    </div>
  )
}

/**
 * Su schermo stretto sei opzioni affiancate si spezzano su tre righe e mangiano
 * mezza schermata: sotto `sm` lo stesso controllo diventa un select nativo.
 */
export function Segmented({ options, value, onChange, ariaLabel }) {
  const coerce = (raw) => options.find((o) => String(o.value) === raw)?.value ?? raw

  return (
    <>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(coerce(e.target.value))}
        className="min-w-0 rounded-[10px] border-none bg-fill px-3 py-2 text-[13px] font-medium text-ink outline-none sm:hidden"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <div
        role="tablist"
        aria-label={ariaLabel}
        className="hidden gap-0.5 rounded-[10px] bg-fill p-[2px] sm:inline-flex"
      >
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(o.value)}
              className={`cursor-pointer rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition duration-300 ${
                on ? 'bg-white text-[#1d1d1f] shadow-sm dark:bg-[#5f5f64] dark:text-white' : 'text-ink-sec hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}

export function Message({ children, tone = 'info' }) {
  const cls = tone === 'error' ? 'border-[#d03b3b] text-[#d03b3b]' : 'border-hair text-ink-sec'
  return <div className={`rounded-2xl border bg-surface/60 p-4 text-[13.5px] backdrop-blur-lg ${cls}`}>{children}</div>
}

export function IconButton({ title, onClick, children, active = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-full transition duration-300 ${
        active ? 'bg-accent/15 text-accent' : 'bg-fill text-ink hover:bg-fill-hover'
      }`}
    >
      {children}
    </button>
  )
}
