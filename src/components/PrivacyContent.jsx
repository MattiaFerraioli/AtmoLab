/* ============================================================
   Informativa privacy — solo il testo
   ------------------------------------------------------------
   Nessuna nozione di dove viene mostrato: lo montano sia il
   popup nel footer sia la pagina statica `privacy.html`. Una
   copia sola, altrimenti le due versioni divergono al primo
   ritocco e finisci per dichiarare due cose diverse.

   L'elenco dei terzi è ricavato leggendo il codice, non a
   memoria: chi lo aggiorna deve rifare lo stesso giro, perché
   ogni host contattato dal browser vede l'indirizzo IP di chi
   visita, ed è quello che va dichiarato.
   ============================================================ */

const TERZI = [
  {
    nome: 'Open-Meteo',
    url: 'https://open-meteo.com/en/terms',
    cosa: 'previsioni, qualità dell’aria, ricerca delle località, ensemble, dati osservati e stato delle corse dei modelli',
  },
  {
    nome: 'BigDataCloud',
    url: 'https://www.bigdatacloud.com/privacy-and-cookie-policy',
    cosa: 'nome del luogo a partire dalle coordinate, solo se usi la localizzazione',
  },
  {
    nome: 'OpenFreeMap e OpenMapTiles',
    url: 'https://openfreemap.org/',
    cosa: 'sfondo cartografico delle mappe, su dati OpenStreetMap',
  },
  {
    nome: 'Dipartimento della Protezione Civile',
    url: 'https://www.protezionecivile.gov.it/it/privacy/',
    cosa: 'bollettino di allerta, mappe nazionali e tile del radar (queste ultime da una cache su Amazon S3)',
  },
  {
    nome: 'GitHub',
    url: 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
    cosa: 'ospita i dati aperti della Protezione Civile; contattato solo quando l’estratto pubblicato non è disponibile',
  },
  {
    nome: 'Supabase',
    url: 'https://supabase.com/privacy',
    cosa: 'conserva l’estratto delle allerte che l’app scarica una volta al giorno',
  },
  {
    nome: 'Cloudflare',
    url: 'https://www.cloudflare.com/privacypolicy/',
    cosa: 'ospita il sito e ne serve i file',
  },
]

const MEMORIA = [
  ['località scelta, preferiti e ricerche recenti', 'per ritrovarle alla visita successiva'],
  ['tema chiaro o scuro, modelli e variabile selezionati, pericolo e giorno della sezione temporali', 'per non doverli reimpostare ogni volta'],
  ['ultimo bollettino di allerta scaricato', 'per non riscaricarlo a ogni apertura'],
  ['griglie di calcolo dei temporali, in un database del browser chiamato «atmolab»', 'per non richiedere gli stessi dati due volte e non esaurire il limite giornaliero'],
]

export default function PrivacyContent() {
  return (
    <div className="flex flex-col gap-5 text-[13.5px] leading-relaxed text-ink-sec">
      <p>
        AtmoLab è un sito senza registrazione e senza backend proprio: le pagine sono file statici e
        tutto il resto avviene nel browser. <strong className="text-ink">Non raccogliamo, non
        conserviamo e non trasmettiamo a nessuno dati personali</strong>, perché non c'è nessun
        server nostro che possa riceverli.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold text-ink">Cosa NON facciamo</h2>
        <ul className="ml-4 list-disc space-y-1">
          <li>nessun account, nessuna registrazione, nessuna newsletter</li>
          <li>nessuna analitica, nessun tracciamento, nessun cookie di profilazione</li>
          <li>nessuna pubblicità e nessun dato ceduto o venduto</li>
          <li>nessuno storico di ciò che cerchi conservato da noi</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold text-ink">La tua posizione</h2>
        <p>
          È <strong className="text-ink">facoltativa</strong> e viene chiesta solo quando premi il
          pulsante di localizzazione o accetti l'invito che appare alla prima visita: non parte
          nulla da sola. Le coordinate servono a scegliere la località e a trovarne il nome, restano
          sul dispositivo e non vengono inviate a noi. Puoi revocare il permesso dalle impostazioni
          del browser in qualunque momento, e l'app continua a funzionare cercando la città a mano.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold text-ink">Cosa resta sul tuo dispositivo</h2>
        <p>
          Alcune preferenze e dati tecnici vengono salvati nella memoria locale del browser. Non
          escono dal dispositivo, non servono a riconoscerti e si cancellano svuotando i dati del
          sito.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          {MEMORIA.map(([cosa, perche]) => (
            <li key={cosa}>
              {cosa} — <span className="text-ink-muted">{perche}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold text-ink">Servizi contattati dal tuo browser</h2>
        <p>
          I dati meteo e le mappe arrivano direttamente dai loro fornitori: è il tuo browser a
          chiederli, non un nostro server a fare da tramite. Questo significa che{' '}
          <strong className="text-ink">quei servizi vedono il tuo indirizzo IP</strong> e i dati
          tecnici della richiesta, come farebbe qualunque sito che visiti. Ognuno applica la propria
          informativa.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          {TERZI.map((t) => (
            <li key={t.nome}>
              <a href={t.url} target="_blank" rel="noreferrer" className="text-accent">
                {t.nome}
              </a>{' '}
              — {t.cosa}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold text-ink">Fonti e licenze</h2>
        <p>
          Dati meteo Open-Meteo (CC-BY 4.0), allerte e radar del Dipartimento della Protezione
          Civile, cartografia OpenFreeMap e OpenMapTiles su dati OpenStreetMap. Le attribuzioni
          complete sono in fondo alla pagina e sotto le mappe.
        </p>
      </section>
    </div>
  )
}
