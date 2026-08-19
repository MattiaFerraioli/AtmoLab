import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

/* Lo script auto-iniettato registra il service worker e basta: nessuno
   ricontrolla mai se ne è uscito uno nuovo, quindi una PWA installata e
   tenuta aperta (o ripresa dallo sfondo, senza una vera navigazione di
   rete) non vede gli aggiornamenti finché non viene chiusa e riaperta a
   freddo — a volte nemmeno allora. registerSW aggiunge il controllo
   periodico e quello al ritorno in primo piano; registerType 'autoUpdate'
   fa il resto (skipWaiting + reload automatico alla nuova versione). */
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => registration.update()
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
