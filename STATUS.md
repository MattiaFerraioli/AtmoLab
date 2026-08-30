# AtmoLab — stato del progetto

Aggiornato: 30 agosto 2026

PWA meteo che confronta i modelli previsionali (ECMWF, GFS, ICON, ARPEGE/AROME, ICON-2I),
con una sezione dedicata al rischio grandine/vento/pioggia a livello di cella, un ramo
sperimentale a ensemble, e le allerte ufficiali della Protezione Civile.

Repo: `github.com/MattiaFerraioli/AtmoLab` · In produzione su **Cloudflare Pages**,
`atmolab.byonex.app` · Stack: Vite 8 + React 19 + Tailwind 4, Leaflet/react-leaflet con
fondale MapLibre, Recharts, `vite-plugin-pwa`. Nessun backend nell'app: tutto gira nel
browser, dati da API pubbliche gratuite (Open-Meteo, open data e radar DPC, OpenFreeMap).
L'unico pezzo lato server è un job su GitHub Actions che pubblica l'estratto delle allerte
su Supabase Storage.

## Cosa fa, in breve

- **Dashboard classica**: condizioni attuali, 48 ore orarie, 14 giorni, qualità dell'aria.
- **Confronto modelli**: stessa località, curve sovrapposte per 6 modelli, mediana + banda
  min–max, tabella oraria, stato di aggiornamento/validità di ogni corsa.
- **Rischio temporali**: griglia 7×7 attorno alla località (lato ≈ 230 km), tre
  pericoli (grandine con diametro stimato via indice SHIP, raffiche, accumuli), zone colorate
  su mappa con contorni smussati, probabilità come accordo fra tre modelli deterministici.
  Tab **Previsionale** (i dati sopra) / **Sperimentale** (31 membri ensemble GFS + incrocio
  qualitativo col deterministico — mai fuso numericamente, solo "concordano sì/no").
- **Allerte Protezione Civile**: fascia nel riepilogo con le allerte ufficiali (temporali,
  idrogeologico, idraulico) per la zona della località, popup con la mappa nazionale.
- **PWA installabile**: icona a tema, offline-aware (LED di freschezza dati), aggiornamenti
  automatici veri (vedi sezione Bug corretti — era rotto fino a ieri).
- Preferiti + cronologia richiamabili da un bottone nella barra di ricerca; scroll con inerzia
  (Lenis); tema chiaro/scuro stile Apple con superfici in vetro (liquid glass) su bagliori
  ambientali.

Documentazione tecnica completa, con ogni scelta motivata e ogni misura annotata:
**`README.md`** nella root del repo. Questo file è solo lo stato "a che punto siamo".

## Fatto nel fine settimana del 29-30 agosto

- **Hosting spostato da Vercel a Cloudflare Pages.** Motivo: Vercel Hobby classifica
  esplicitamente le donazioni come uso commerciale (*"Asking for Donations fall under
  commercial usage"*), quindi un Buy Me a Coffee avrebbe richiesto Pro a 20 $/mese.
  Cloudflare free non vieta il commerciale; l'unica clausola che ci tocca vieta di
  raccogliere dati di carta sul nostro dominio, quindi il salvadanaio dovrà essere un
  **link esterno**, mai un checkout incorporato.
- **Allerte DPC via estratto pubblicato.** Un job schedulato su GitHub Actions
  (`.github/workflows/dpc-extract.yml`) fa una volta sola il lavoro che prima faceva ogni
  dispositivo — 2 chiamate alla API di GitHub, limite 60/ora per IP, più ~3,2 MB di
  TopoJSON — e pubblica ~263 KB su Supabase Storage. In produzione: 1 richiesta, zero
  chiamate a GitHub. Gli orari (14:20 e 16:30 UTC) vengono da 2.430 giorni di storico:
  emissione mediana 14:28 italiane, coda alle 16:05, aggiornamento pomeridiano nel 2-7%
  dei giorni. Su Actions e non su una funzione serverless perché il parsing non sta nei
  10 ms di CPU dei Worker free e il cron Vercel Hobby ammette un solo giro al giorno.
- **Mappa di oggi recuperata**: il bollettino a volte pubblica per "oggi" un PNG segnaposto
  da 4 KB. La mappa vera esiste, è il "domani" del bollettino precedente: ora l'estratto
  dice, per ogni data, **da quale bollettino prendere la mappa**. Nessun archivio in più —
  i PNG li ospita la DPC, basta ricordare il puntatore.
- **Zone dei temporali come macchie**, non più quadretti: campo interpolato (bicubica
  Catmull-Rom ritagliata sull'intervallo dei dati) su una maglia 12× più fitta e contorni
  con marching squares (`d3-contour`). Dove la macchia tocca il bordo della griglia il
  tratto non viene disegnato: là non c'è un contorno, c'è la fine dei dati, e lo dice una
  cornice neutra.
- **Reticolo fisso + cache in IndexedDB** con chiave sulla **corsa del modello**, non a
  tempo. La sezione ora si apre da sola se il dato è già in casa; il pulsante "Calcola"
  torna solo quando aprire costerebbe davvero (località nuova, corsa nuova, oltre 12 ore).
- **Mappa dentro un recinto**: proporzione del contenitore = proporzione dell'area
  (`aspectRatio: cos(latitudine)`, perché in Mercatore un quadrato in gradi non è un
  quadrato sullo schermo), zoom minimo = l'inquadratura dell'area, `maxBounds` come muro.
  Si ingrandisce e si gira dentro il 7×7, non se ne esce.
- **Radar DPC** come strato attivabile (VMI, 5 minuti), spento all'apertura. Scelto al posto
  di RainViewer per la licenza: CC-BY-SA con **uso commerciale permesso**, mentre RainViewer
  è "personal or educational use only" e sarebbe incompatibile con le donazioni.
- **Prima visita**: si parte da Monza e la posizione si **offre** invece di chiederla
  d'ufficio.
- Linguaggio della grandine riscritto sugli outlook convettivi: via la scala di rischio
  combinato, restano **diametro atteso** (se il temporale si forma) e **probabilità**
  (accordo fra modelli). Via anche l'indice SHIP dall'interfaccia.
- Fondale passato a **OpenFreeMap** con etichette in italiano.

## Fatto prima

- Restyle grafico completo in due passate: prima Apple-style (palette, ombre, pillole), poi
  liquid glass (trasparenze, bagliori dietro le card).
- Sezione grandine/vento/pioggia: dalla prima versione (peso × trigger su un solo run) alla
  versione attuale con probabilità reale (accordo fra modelli), zone a contorno smussato,
  badge "possibile supercella", griglia locale come riferimento (regionale/ampia per
  confronto, sempre con provenienza del modello dichiarata in UI).
- Ensemble: aggiunto, poi ristrutturato dentro una tab della sezione temporali con incrocio
  deterministico↔membri (mai una fusione numerica dei due mondi — metri diversi, si media
  in fondo alla scala sbagliata la fisica dell'evento).
- Allerte DPC: integrate da zero (discovery via git trees API, match comune→zona, cache
  locale, fix su un bug di date fisse che mostrava il bollettino di ieri come "oggi").
- Preferiti/recenti spostati in un menu unico nella barra di ricerca; corretto un bug per cui
  una località salvata da ricerca non risultava preferita se raggiunta via GPS (confronto
  ora per vicinanza, non uguaglianza esatta delle coordinate).
- Scroll con inerzia (Lenis), rispettando mappe e strisce orizzontali.
- Sweep di copywriting: maiuscole a inizio frase ovunque, spiegoni tecnici ridotti a una riga.
- **Basemap da CARTO a OpenFreeMap (29 ago)**: CARTO ha reso obbligatoria la API key e senza
  chiave stampa "API KEY REQUIRED" sopra la mappa. Passata a OpenFreeMap: nessuna chiave,
  nessun limite, stili `positron`/`dark` identici nell'aspetto ai CARTO di prima. Sono tile
  vettoriali, quindi il fondale ora lo disegna MapLibre GL dentro il `tilePane` di Leaflet
  (ponte `@maplibre/maplibre-gl-leaflet`); zone, marker e tooltip restano react-leaflet
  invariati. Import dinamico, così i ~250 KB gzip di maplibre-gl non pesano su chi non apre
  la mappa.
- **Griglia unica (26 ago)**: rimosse le estensioni regionale (0,7°) e ampia (1,4°), resta
  solo la locale (0,35°). A quei passi i punti stavano a ~78 e ~155 km mentre una cella
  temporalesca è larga 5–30 km: un sondaggio spalmato su un'area molte volte più grande del
  fenomeno, sempre fuori dal dominio ICON-2I quindi sul blend che attenua i picchi, e ogni
  cambio di passo era un altro fetch da 49 punti sulla quota. La locale era già il default,
  quindi per la maggior parte degli utenti cambia solo che sparisce il selettore.
- **Bug corretto il 19 ago**: gli aggiornamenti della PWA installata non arrivavano mai da soli.
  Il service worker era configurato bene, ma nessuno lo ricontrollava mai dopo la prima
  registrazione — una PWA ripresa dallo sfondo (non una vera navigazione di rete) restava
  bloccata sulla build vecchia anche per giorni. Ora c'è un controllo orario + uno al ritorno
  in primo piano.

## Limiti noti (dichiarati anche in UI/README)

- **Quota Open-Meteo**: 600 chiamate/minuto, 5.000/ora, 10.000/giorno, contate **per IP** (non per
  dispositivo: chi sta dietro lo stesso wi-fi o CGNAT condivide il budget). Aprire la sezione
  temporali costa ~130 chiamate pesate. Mitigata dal reticolo fisso + cache locale in IndexedDB
  con chiave sulla corsa del modello, e dal registro delle richieste in volo.   Restano il retry automatico e le due griglie richieste in serie, non in parallelo.
- **Grandine è una stima**, non un dato diretto: indice SHIP da parametri d'ambiente, non un
  diametro pubblicato dal modello. Dichiarato in UI.
- **Anche la griglia locale può uscire** dal dominio ad alta risoluzione ICON-2I (bbox fisso,
  mai da estendere: fuori dominio l'API risponde `latitude: nan`, JSON non valido): succede
  su Sicilia meridionale e bordo alpino, e allora si passa al blend multi-modello, più liscio.
  La riga di piè di sezione dice quale modello sta rispondendo.
- **Allerte DPC**: match per nome Comune, non per geometria — frazioni o nomi non standard
  possono non trovare la zona (la sezione allora non compare, niente dato inventato).
- **OpenFreeMap non ha SLA**: è un servizio pubblico gratuito mantenuto da una persona sola e
  finanziato da donazioni ricorrenti. Se sparisce, la mappa perde il fondale (le zone colorate
  continuano a disegnarsi). È un solo valore da cambiare — `mapStyle` in `constants.js` — e in
  caso estremo il loro stack è interamente self-hostabile.
- **Ensemble limitato a GFS 0,5°**: unico modello con livelli in quota per membro. Bias di
  scala noto e dichiarato (CAPE strutturalmente più basso che nei modelli km-scale).

## Da riprendere

- **Vedere il radar con la pioggia vera.** Il meccanismo è verificato (tile, ora del
  rilevamento, cambio fotogramma senza sfarfallio) ma le notti serene danno tile vuote:
  la resa sopra le zone colorate non è ancora stata giudicata.
- **Il Buy Me a Coffee**, come link esterno. Da rileggere prima: il piano free di
  Open-Meteo esclude *"subscriptions or advertising"* — le donazioni non le nomina, ma se
  un domani arriva AdSense quel piano decade.
- **Progetto Vercel da dismettere**, una volta certi di Cloudflare.
- **Cache condivisa delle griglie meteo**: rimandata di proposito. Oggi il tetto è per IP,
  quindi cresce con gli utenti; un proxy lo trasformerebbe in **un solo budget condiviso** e
  con pochi utenti sparsi peggiorerebbe le cose. Il segnale per farla è la media di
  richieste per tile distinta sopra 1. Mai scritture dai client: avvelenerebbero la cache
  di tutti.
- **Motore multi-tile già pronto e inerte**: `mergeTiles` fonde tile adiacenti del reticolo
  in un campo unico e `zones.js` gestisce griglie rettangolari. Serve solo un chiamante, se
  un giorno si volesse un'area più larga.
- **SRI e POH**: SRI (pioggia al suolo) ha le tile e si aggiunge in due righe; POH
  (probabilità di grandine osservata) pubblica solo il prodotto grezzo, le tile danno 403.

## Idee discusse, non ancora decise

- **Sidebar/menu di navigazione** per sezioni, invece dell'attuale pagina unica scrollabile —
  discussione aperta, non ancora impostata l'architettura.
- **Promozione a costo zero**: meta tag + Google Search Console (indicizzazione base),
  community meteo amatoriali/forum come canale di lancio naturale. AdSense valutato ma
  rimandato: con traffico basso non copre nemmeno il tempo per configurarlo, e farebbe
  decadere il piano free di Open-Meteo.
- **Auto-ospitare Open-Meteo** (è open source, immagine Docker) il giorno che il traffico
  rendesse la quota il collo di bottiglia vero: costa un server, non un abbonamento.

## Come si lancia in locale

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # dist/, con service worker generato
```

Nessuna chiave API richiesta per far girare l'app: tutte le fonti dati sono pubbliche e senza
autenticazione. Per **pubblicare** l'estratto delle allerte servono invece `SUPABASE_URL` e
`SUPABASE_SERVICE_KEY` nei secrets del repo, e `VITE_DPC_EXTRACT_URL` fra le variabili di build
(già impostate). Senza quest'ultima l'app funziona lo stesso, sul percorso diretto GitHub.

**Collaudo senza consumare quota**: le verifiche dell'interfaccia usano un simulatore delle
risposte Open-Meteo intercettate in Playwright (nello scratchpad di lavoro, non versionato).
Serve bloccare il service worker nel contesto di prova, altrimenti intercetta lui le fetch.
