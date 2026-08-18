import { fmtDayHour, nf } from '../lib/format'

const STEP = 3 // una riga ogni 3 ore: 168 righe orarie non si leggono

export default function ModelTable({ rows, series, meta }) {
  const sampled = rows.filter((_, i) => i % STEP === 0)

  return (
    <div data-lenis-prevent className="max-h-[420px] overflow-auto border-t border-hair">
      <table className="tnum w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-[3] border-b border-grid bg-surface px-3 py-1.5 text-left font-semibold text-ink-sec">
              Ora
            </th>
            {series.map((s) => (
              <th
                key={s.key}
                className="sticky top-0 z-[2] border-b border-grid bg-surface px-3 py-1.5 text-right font-semibold text-ink-sec whitespace-nowrap"
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: s.color }} />
                {s.label}
              </th>
            ))}
            <th className="sticky top-0 z-[2] border-b border-grid bg-surface px-3 py-1.5 text-right font-semibold text-ink-sec">
              Mediana
            </th>
          </tr>
        </thead>
        <tbody>
          {sampled.map((row) => (
            <tr key={row.t}>
              <td className="sticky left-0 border-b border-grid bg-surface px-3 py-1.5 text-left whitespace-nowrap">
                {fmtDayHour(row.t)}
              </td>
              {series.map((s) => (
                <td key={s.key} className="border-b border-grid px-3 py-1.5 text-right whitespace-nowrap">
                  {nf(row[s.key], meta.dec)}
                </td>
              ))}
              <td className="border-b border-grid px-3 py-1.5 text-right font-semibold whitespace-nowrap">
                {nf(row.median, meta.dec)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[12px] text-ink-muted">
        Valori ogni {STEP} ore, in {meta.unit}. Le celle vuote (–) sono modelli senza dati per questa località o oltre il
        loro orizzonte di previsione.
      </div>
    </div>
  )
}
