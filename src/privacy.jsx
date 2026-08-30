/* Ingresso della pagina statica `privacy.html`: monta lo stesso testo del
   popup, senza l'app attorno. Serve ad avere un URL vero e citabile — non
   c'è routing client-side, quindi la via più economica è una seconda pagina
   generata da Vite. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PrivacyContent from './components/PrivacyContent'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <main className="safe-x mx-auto max-w-[760px] px-5 py-10">
      <a href="/" className="text-[13px] font-semibold text-accent">
        ← AtmoLab
      </a>
      <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] text-ink">Privacy</h1>
      <p className="mb-6 mt-1 text-[13px] text-ink-muted">Ultimo aggiornamento: 30 agosto 2026</p>
      <PrivacyContent />
    </main>
  </StrictMode>,
)
