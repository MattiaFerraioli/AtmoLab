# AtmoLab — stato del progetto

Aggiornato: 26 agosto 2026

PWA meteo che confronta i modelli previsionali (ECMWF, GFS, ICON, ARPEGE/AROME, ICON-2I),
con una sezione dedicata al rischio grandine/vento/pioggia a livello di cella, un ramo
sperimentale a ensemble, e le allerte ufficiali della Protezione Civile.

Repo: `github.com/MattiaFerraioli/AtmoLab` · Stack: Vite 8 + React 19 + Tailwind 4,
Leaflet/react-leaflet per le mappe, Recharts per i grafici, `vite-plugin-pwa`. Nessun
backend: tutto gira nel browser, dati da API pubbliche gratuite (Open-Meteo + open data DPC).

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

## Fatto (ultime due settimane)

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

## Prossimo passo pianificato: Vercel Cron + Supabase per le allerte DPC

Deciso, non ancora iniziato — si riprende a breve.

**Problema attuale**: ogni dispositivo, per le allerte, scarica in proprio ~2,4MB di TopoJSON
dal repo GitHub della Protezione Civile più 2 chiamate alla API di GitHub (rate limit 60/ora
per IP — sotto CGNAT/mobile può bastare poco per esaurirlo e silenziare la sezione per tutti
quelli dietro lo stesso IP).

**Soluzione**: una funzione serverless su Vercel (cron 2 volte al giorno, es. 15:00 e 18:00 per
coprire anche gli aggiornamenti pomeridiani) fa il lavoro pesante una volta sola e scrive
l'estratto compatto (~250KB: date, zone, livelli, comuni, flag mappa-segnaposto) su Supabase
(tabella o Storage pubblico). L'app scarica un solo JSON piccolo dal CDN — niente più rate
limit lato client, cache prevedibile, mattone da 2,4MB sparito. Il percorso GitHub diretto
resta nel codice come fallback se l'endpoint Supabase è più vecchio di 24h.

**Per partire**: conferma che Vercel è collegato al repo, e un progetto Supabase free (URL +
service key, quest'ultima solo in env Vercel, mai nel client).

## Idee discusse, non ancora decise

- **Sidebar/menu di navigazione** per sezioni, invece dell'attuale pagina unica scrollabile —
  discussione aperta, non ancora impostata l'architettura.
- **Promozione a costo zero**: meta tag + Google Search Console (indicizzazione base),
  community meteo amatoriali/forum come canale di lancio naturale. AdSense valutato ma
  rimandato: con traffico basso non copre nemmeno il tempo per configurarlo; prima serve
  avere visite.

## Come si lancia in locale

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # dist/, con service worker generato
```

Nessuna chiave API richiesta: tutte le fonti dati sono pubbliche e senza autenticazione.
