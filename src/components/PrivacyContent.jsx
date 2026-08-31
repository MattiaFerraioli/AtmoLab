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
    cosa: 'fornitura dei dati previsionali, qualità dell’aria, ricerca geografica, dati osservati e stato dei modelli meteo',
  },
  {
    nome: 'BigDataCloud',
    url: 'https://www.bigdatacloud.com/privacy-and-cookie-policy',
    cosa: 'servizio di geocodifica inversa per il rilevamento del nome della località, utilizzato esclusivamente previa attivazione della localizzazione',
  },
  {
    nome: 'OpenFreeMap / OpenMapTiles',
    url: 'https://openfreemap.org/',
    cosa: 'rendering della cartografia di base, su dati OpenStreetMap',
  },
  {
    nome: 'Dipartimento della Protezione Civile',
    url: 'https://www.protezionecivile.gov.it/it/privacy/',
    cosa: 'download dei bollettini nazionali di allerta e tile radar, queste ultime erogate tramite infrastruttura di caching su Amazon S3',
  },
  {
    nome: 'GitHub',
    url: 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
    cosa: 'host della risorsa dati aperti della Protezione Civile, consultato in via secondaria ove l’estratto primario risulti indisponibile',
  },
  {
    nome: 'Supabase',
    url: 'https://supabase.com/privacy',
    cosa: 'servizio per il recupero dell’estratto giornaliero dei bollettini di allerta',
  },
  {
    nome: 'Cloudflare',
    url: 'https://www.cloudflare.com/privacypolicy/',
    cosa: 'servizio di Content Delivery Network (CDN) ed hosting dei file statici del sito web',
  },
]

const NON_FACCIAMO = [
  'creazione di account utente o procedure di registrazione',
  'invio di newsletter o comunicazioni commerciali',
  'impiego di cookie di profilazione o strumenti di analisi e tracciamento (analytics)',
  'tracciamento della cronologia di ricerca',
  'cessione o vendita di dati a soggetti terzi',
]

const ARCHIVIAZIONE = [
  [
    'Preferenze di navigazione e ricerca',
    'località selezionate, elenco dei preferiti e cronologia delle ricerche recenti',
  ],
  [
    'Impostazioni di configurazione',
    'tema dell’interfaccia (chiaro/scuro), modelli meteo, variabili selezionate, parametri relativi alle allerte e ai temporali',
  ],
  [
    'Dati tecnici di cache',
    'l’ultimo bollettino di allerta scaricato e le griglie di calcolo per la sezione temporali, memorizzate nel database locale del browser denominato «atmolab», al fine di ridurre le richieste di rete ed evitare il superamento delle soglie di traffico consentite',
  ],
]

/** Titolo di sezione numerato. */
function Sezione({ n, titolo, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-bold text-ink">
        {n}. {titolo}
      </h2>
      {children}
    </section>
  )
}

export default function PrivacyContent() {
  return (
    <div className="flex flex-col gap-5 text-[13.5px] leading-relaxed text-ink-sec">
      <p>
        AtmoLab è un’applicazione web statica gestita interamente lato client (client-side). Il
        servizio non dispone di un server backend proprietario, né richiede alcuna procedura di
        registrazione.{' '}
        <strong className="text-ink">
          Nessun dato personale viene raccolto, archiviato o trasmesso a terzi da parte di AtmoLab.
        </strong>
      </p>

      <Sezione n={1} titolo="Trattamento dei dati personali">
        <p>
          AtmoLab si astiene da qualsiasi attività di profilazione e tracciamento. In particolare,
          il servizio non effettua:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          {NON_FACCIAMO.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </Sezione>

      <Sezione n={2} titolo="Dati di geolocalizzazione">
        <p>
          L’accesso ai dati relativi alla posizione geografica dell’utente è{' '}
          <strong className="text-ink">esclusivamente facoltativo</strong>. La richiesta di
          localizzazione viene attivata soltanto previo consenso esplicito dell’utente, tramite
          l’apposito pulsante o l’invito mostrato al primo accesso al servizio.
        </p>
        <p>
          Le coordinate geografiche acquisite sono utilizzate al solo scopo di identificare la
          località corrente e non vengono in alcun caso trasmesse ai sistemi di AtmoLab. L’utente
          può revocare le autorizzazioni alla localizzazione in qualsiasi momento tramite le
          impostazioni del proprio browser; il servizio rimarrà pienamente fruibile mediante la
          ricerca manuale dei luoghi.
        </p>
      </Sezione>

      <Sezione n={3} titolo="Archiviazione locale (Local Storage e IndexedDB)">
        <p>
          Per ottimizzare l’esperienza d’uso ed evitare il download ridondante di informazioni, il
          servizio memorizza alcuni dati tecnici ed elementi di configurazione direttamente
          all’interno della memoria locale del browser dell’utente (Local Storage e IndexedDB). Tali
          dati non consentono l’identificazione dell’utente e non vengono trasmessi esternamente.
        </p>
        <p>Nello specifico, vengono memorizzati localmente:</p>
        <ul className="ml-4 list-disc space-y-1">
          {ARCHIVIAZIONE.map(([voce, dettaglio]) => (
            <li key={voce}>
              <strong className="text-ink">{voce}</strong>: {dettaglio}.
            </li>
          ))}
        </ul>
        <p>
          I dati locali possono essere rimossi in qualsiasi momento dall’utente tramite la pulizia
          della cronologia o dei dati di navigazione del browser.
        </p>
      </Sezione>

      <Sezione n={4} titolo="Servizi e connessioni di terze parti">
        <p>
          L’architettura del sito prevede che le richieste relative ai dati meteorologici, alla
          cartografia e alle allerte vengano effettuate direttamente dal browser dell’utente verso i
          server dei rispettivi fornitori, senza l’intermediazione di un backend di AtmoLab.
        </p>
        <p>
          Di conseguenza,{' '}
          <strong className="text-ink">
            tali fornitori terzi possono visualizzare l’indirizzo IP dell’utente
          </strong>{' '}
          e i metadati tecnici della connessione. Per tali trattamenti si rinvia alle rispettive
          informative sulla privacy:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          {TERZI.map((t) => (
            <li key={t.nome}>
              <a href={t.url} target="_blank" rel="noreferrer" className="text-accent">
                {t.nome}
              </a>
              : {t.cosa}.
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione n={5} titolo="Fonti dei dati e licenze">
        <p>
          I contenuti informativi e cartografici integrati nell’applicazione provengono dalle
          seguenti fonti ufficiali:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong className="text-ink">Dati meteorologici</strong>: Open-Meteo, distribuiti con
            licenza CC-BY 4.0.
          </li>
          <li>
            <strong className="text-ink">Allerte e dati radar</strong>: Dipartimento della
            Protezione Civile.
          </li>
          <li>
            <strong className="text-ink">Mappe e cartografia</strong>: OpenFreeMap e OpenMapTiles,
            su base dati OpenStreetMap.
          </li>
        </ul>
        <p>
          Le attribuzioni complete e le specifiche sulle licenze sono riportate nel piè di pagina
          della piattaforma e nelle relative note cartografiche.
        </p>
      </Sezione>
    </div>
  )
}
