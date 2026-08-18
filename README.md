# AtmoLab

Web app di previsioni meteo che mette a confronto, sulla stessa località, le previsioni dei
principali modelli meteorologici globali e regionali. Dove i modelli concordano la previsione è
solida; dove divergono, non lo è — ed è esattamente quello che la app mostra.

Tutti i dati arrivano da **[Open-Meteo](https://open-meteo.com/)**: gratuito, senza API key,
senza registrazione. Nessuna chiave da configurare. Il piano free copre uso non commerciale fino a
10.000 chiamate al giorno, con attribuzione CC-BY 4.0 (già nel footer dell'app).

## Avvio

```bash
npm install     # solo la prima volta
npm run dev     # http://localhost:5180
```

Build di produzione (statica, pubblicabile ovunque: Netlify, Vercel, GitHub Pages, S3):

```bash
npm run build   # output in dist/
npm run preview
```

## Deploy su Vercel

Piano Hobby, gratuito, nessuna carta. L'app è statica pura: nessuna serverless function, nessuna
chiave da nascondere, le chiamate a Open-Meteo partono dal browser.

- Preset **Vite**, rilevato in automatico. Build `npm run build`, output `dist`.
- Nessun rewrite: non c'è routing client-side, esiste una sola pagina.
- Limiti Hobby: 100 GB di banda al mese, uso non commerciale.

**Il vincolo vero non è Vercel, è la quota Open-Meteo.** Il piano free è 10.000 chiamate al
giorno, ma il conteggio è *pesato* per località × variabili × giorni: la griglia della grandine
(49 località × 14 variabili) vale molto più di "1". Per questo la sezione grandine **non parte da
sola**: si carica con un click, e la scelta non viene ricordata fra visite. Le altre tre richieste
(previsione, qualità aria, confronto modelli) partono al caricamento.

## PWA

`vite-plugin-pwa` in `generateSW`, con `registerType: 'autoUpdate'`.

- **Previsioni** (`api|air-quality-api|geocoding-api.open-meteo.com`): `NetworkFirst`, timeout 6 s,
  scadenza 30 minuti. La rete vince sempre, la cache è solo rete di sicurezza.
- **Tile mappa** (CARTO): `CacheFirst`, 7 giorni.

Una PWA meteo offline mostrerebbe previsioni vecchie senza dirlo: per questo la scadenza è
30 minuti, la stessa soglia oltre la quale il LED in topbar diventa rosso lampeggiante, e ogni
sezione porta la propria ora di aggiornamento.

Icone in `public/`: `favicon.svg` (nuvola, sole, e sotto tre nodi collegati — il motivo node-link
è la parte "AI"), `icon-maskable.svg` con il segno dentro la safe zone dell'80%, più i PNG
`pwa-192x192`, `pwa-512x512`, `maskable-icon-512x512`, `apple-touch-icon` (180 px).

Cose da sapere:

- **iOS** non ha prompt di installazione: serve "Condividi → Aggiungi a Home". E ignora le icone
  del manifest, usa solo `apple-touch-icon.png`.
- Il **service worker è attivo anche in dev** (`devOptions.enabled`). Se sembra che le modifiche
  non passino, attiva "Update on reload" nei DevTools.
- `theme_color` nel manifest è fisso sul tema scuro, ma il meta `theme-color` viene riscritto dal
  toggle in `useTheme`: senza, la barra di sistema resterebbe scura in tema chiaro.

## Cosa fa

- **Condizioni attuali** — temperatura, percepita, vento e raffiche, umidità, pressione,
  nuvolosità, UV, alba/tramonto, qualità dell'aria (indice europeo EAQI, dati CAMS).
- **Previsione 14 giorni** — min/max con barra di escursione relativa all'intero periodo,
  pioggia e probabilità. Le card sono **cliccabili**: selezionare un giorno filtra su quella data
  tutte le sezioni sotto (grafico orario, confronto modelli, rischio grandine). Una barra sotto la
  striscia dice cosa è filtrato e riporta ai 14 giorni.
- **48 ore** — temperatura oraria e precipitazione, su due grafici allineati (mai due scale
  sullo stesso asse).
- **Confronto tra modelli** — la parte interessante: stessa variabile, fino a 8 modelli
  sovrapposti, con la banda min–max fra i modelli, la mediana di consenso e le statistiche
  di divergenza (accordo alto/medio/basso, divergenza massima e quando cade, entro quante ore
  i modelli restano d'accordo).
- **Stato dei modelli** — per ciascun modello: corsa in uso, quando è stata pubblicata, ogni quanto
  si aggiorna, fin dove arriva e cosa serve davvero in quella località. I modelli che non
  raggiungono il giorno visualizzato compaiono spenti e senza linea, invece di sparire in silenzio.
- **Rischio grandine** — griglia 7×7 di punti attorno alla località (passo selezionabile:
  ≈230 / 460 / 930 km di lato), con mappa a celle colorate, classifica delle zone più a rischio
  espresse come distanza e direzione dalla località, diametro stimato dei chicchi e andamento
  orario della cella scelta. Si guarda **un giorno alla volta** — oggi, domani o dopodomani, oppure
  il giorno scelto nella striscia dei 14 giorni. Su oggi le ore già passate sono escluse.
- **Ricerca** — per città con autocomplete; ogni risultato mostra bandiera, regione, paese e
  popolazione, che bastano a distinguere gli omonimi. Preferiti salvati in locale e
  geolocalizzazione, che risolve il nome del comune invece di mostrare le coordinate
  (reverse geocoding BigDataCloud, gratuito e senza chiave — Open-Meteo non lo offre).
- **LED di freschezza** in topbar — verde con l'ora dell'ultimo scaricamento, ambra durante il
  fetch, rosso lampeggiante se il fetch fallisce o i dati superano i 30 minuti. Cliccandolo
  ricarica tutto. Misura la freschezza del *nostro* fetch, non la corsa del modello: quella sta in
  "Stato dei modelli", ed è un'altra cosa.
- **Tema chiaro/scuro**, tabella dei valori numerici, tutto responsive.

### Su mobile

Verificato a 390 px. Le scelte che il CSS da solo non copriva:

- I controlli segmentati (6 variabili, 3 orizzonti) diventano `select` nativi sotto `sm`:
  affiancati si spezzavano su tre righe.
- Topbar su due righe — brand, LED e pulsanti sopra, ricerca sotto.
- "Stato dei modelli" è un `<details>`, chiuso di default su mobile e aperto su desktop.
- Le mappe Leaflet nascono con il drag disabilitato su touch e si sbloccano con un tocco:
  altrimenti il dito sulla mappa blocca lo scroll della pagina.
- Assi Recharts più stretti e `minTickGap` al posto di un `interval` fisso, che sotto i 420 px
  sovrapponeva le etichette.
- **Safe area**: il viewport è `viewport-fit=cover`, quindi da PWA installata il contenuto passa
  sotto la status bar e sotto la barra gesti. Topbar, contenuto e footer compensano con
  `env(safe-area-inset-*)` (classi `.safe-top` / `.safe-x` / `.safe-bottom` in `index.css`);
  su desktop l'inset vale 0 e non cambia nulla.

## Icone meteo

`WeatherIcon.jsx` disegna tutto a mano in SVG, senza dipendenze. La nuvola è **un solo contorno
chiuso di archi circolari**: spalle r7.5 tangenti alla base piatta y=34, cupola r9.5, e fra le due
un arco di raccordo **concavo** r2.5 tangente a entrambe. Nelle giunzioni i centri sono allineati
col punto di contatto, quindi le tangenti coincidono e il profilo non ha né cuspidi né bozzi.

La versione precedente sovrapponeva tre cerchi di raggi diversi più un rettangolo: i cerchi si
incrociavano formando cuspidi visibili e la base mostrava due spigoli. La pioggia erano segmenti
obliqui, che leggevano come graffi; ora sono gocce con punta in alto e ventre arrotondato.

L'intensità 1–3, derivata dal codice WMO (`wmoIntensity`), pilota quanti segni compaiono: 1 goccia
poca pioggia, 3 tanta; 1 fulmine possibili temporali, 2 temporali, 3 temporali forti. Le posizioni
sono simmetriche su x=24 e dentro la base della nuvola, così niente sporge di lato.

## Modelli disponibili

| Modello | Centro | Risoluzione | Copertura |
| --- | --- | --- | --- |
| ECMWF IFS | ECMWF (Europa) | 0.25° | globale |
| GFS | NOAA (USA) | 0.11–0.25° | globale |
| ICON | DWD (Germania) | 2–11 km | globale |
| ARPEGE/AROME | Météo-France | 1.5–25 km | globale |
| UKMO | Met Office (UK) | 2–10 km | globale |
| ICON-2I | ItaliaMeteo ARPAE | 2.2 km | Italia |

UKMO è disponibile ma **spento all'avvio**: si accende con un click sul chip. Gli altri sono
selezionati di default (`DEFAULT_MODELS` in `src/lib/constants.js`).

Open-Meteo ne serve anche altri, esclusi da questa app perché sull'Italia aggiungono poco:
GEM (ECCC Canada), JMA, HARMONIE KNMI, HARMONIE DMI. Per riattivarne uno basta rimetterlo
nell'array `MODELS` con il suo id Open-Meteo — nient'altro, colori e selezione si adeguano da soli.

ICON-2I è regionale: copre solo l'Italia e si ferma a ~72 ore. Fuori dal dominio o oltre
l'orizzonte la linea si interrompe e il chip mostra `n/d qui`. È il comportamento corretto, non un
errore.

Il grafico accetta al massimo **8 modelli insieme**: oltre gli 8 slot della palette i colori non
restano distinguibili in modo affidabile (anche per chi ha deficit di visione dei colori). Ogni
modello mantiene il proprio colore anche quando gli altri vengono tolti.

## Sezione temporali: tre pericoli sulla stessa griglia

Un selettore commuta fra **Grandine**, **Vento** e **Pioggia**: cambia il numero che si guarda,
non i dati scaricati — gli stessi 15 parametri per 49 celle servono tutti e tre.

| Pericolo | Metrica di colore | Valore mostrato | Soglie |
| --- | --- | --- | --- |
| Grandine | rischio combinato ambiente × innesco | diametro (<1 / 1–2 / 2–4 / >4 cm) + coda "fino a" | 0,05 / 0,2 / 0,5 / 1 |
| Vento | raffica massima del giorno | km/h | 60 / 75 / 90 / 105 km/h |
| Pioggia | accumulo totale sulla finestra | mm (punta oraria a fianco) | 10 / 25 / 50 / 80 mm |

**Sorgente della griglia**: dentro il dominio ICON-2I (bbox conservativo lat 35–48,8 / lon
4,5–20,5) ed entro 48 ore, la griglia usa il modello a 2,2 km — CAPE, raffiche e pioggia risolti
alla scala della cella. Fuori, o oltre, si torna al blend best-match. L'etichetta nei controlli
dice quale dei due sta rispondendo. Attenzione a estendere il bbox: un punto fuori dominio fa
rispondere all'API `latitude: nan`, che non è JSON valido e rompe il parse.

**Rotazione**: badge "rotaz." (viola) quando una cella ha CAPE ≥ 1000 J/kg e shear 0–6 km
≥ 18 m/s in un'ora con innesco — le soglie classiche del potenziale da supercella. Lo shear era
già calcolato dentro SHIP, ora è esposto.

**Punto vs area**: i mm di pioggia sono medie della cella di griglia; il massimo puntuale nel
cuore di un temporale vale tipicamente 2–3×. Un prodotto per-cella che dice "70 mm" e questa
mappa che dice 30 descrivono lo stesso evento. La nota in-app lo spiega.

**Affidabilità diversa, detta esplicitamente nella UI**: vento e pioggia sono output diretti del
modello; la grandine è una ricostruzione da parametri d'ambiente. La nota in fondo alla sezione
cambia col pericolo selezionato e lo dice.

**Scala colore**: giallo → arancio → rosso → viola, la convenzione degli outlook convettivi
(SPC, ESTOFEX). È una deroga consapevole alla regola "sequenziale = una sola tinta": su mappa
scura la rampa monocroma rendeva le celle indistinguibili. Il valore numerico è comunque stampato
sulle celle significative, quindi il colore non porta mai da solo l'informazione.

**Zone per fascia di diametro**: per la grandine le zone NON seguono il rischio ma la fascia di
diametro (le stesse soglie di `hailSize`, che `sizeRank` in `buildNarrative` deve rispecchiare —
con chiavi disallineate la grandine sparisce silenziosamente dalla sintesi), così una zona
etichettata "2–4 cm" contiene solo celle di quella fascia — prima il contorno seguiva il rischio e l'etichetta il diametro del punto
peggiore, e una zona "rischio basso" grande mezzo nord-ovest sembrava tutta da 2–4 cm. La
probabilità d'innesco è a tre livelli, dalle soglie di rischio (0,2 / 0,5): **bassa** = contorno
puntinato, **media** = tratteggiato, **alta** = continuo; il livello è scritto anche
nell'etichetta della zona ("prob. bassa"). Vento e pioggia zonano sulla severità, che lì coincide
col valore.

**Contorni smussati**: i perimetri a scalini della griglia passano per due iterazioni di
smussamento di Chaikin (ogni lato → punti a 1/4 e 3/4), che li trasforma in curve morbide stile
outlook disegnato a mano, restando dentro l'inviluppo delle celle.

**Zone stile outlook** (`src/lib/zones.js`): le celle non si disegnano più come quadretti
indipendenti — per ogni livello di severità le celle contigue vengono raggruppate in componenti
connesse e se ne traccia il contorno, annidato come negli outlook SPC/ESTOFEX (il livello 2 sta
dentro l'1). Ogni zona porta una sola etichetta col valore, posta sulla cella di massimo, a
partire dal livello "Basso": prima le etichette scattavano solo da "moderato" in su e una
giornata tutta gialla lasciava la mappa muta. I rettangoli restano come hit-area invisibili per
tooltip e selezione.

## Cosa mostra in più, per tutti e tre

Il formato è ispirato agli outlook convettivi (ESTOFEX, SPC, e i forecaster italiani che ne
seguono lo schema): non solo "quanto rischio", ma dove, quando, con che energia e con che vento.

- **In sintesi** — due o tre frasi generate dai numeri: fascia oraria, settori rispetto alla
  località, diametro atteso, raffiche, direzione di spostamento. Soglie rigide: sotto il livello
  "moderato" la frase lo dice, non inventa fenomeni.
- **Raffiche nei temporali** — massima raffica prevista dai modelli nelle sole ore convettive
  (rischio ≥ 0,05): una raffica da fronte senza temporale non c'entra col downburst e non compare.
- **CAPE** — l'energia disponibile alla convezione, con fascia descrittiva (quasi nulla < 300,
  debole, moderata, alta ≥ 2500, estrema ≥ 4000 J/kg). Già usata dentro SHIP, ora anche esposta.
- **Spostamento delle celle** — freccia sulla mappa con direzione e velocità: è lo steering flow,
  la media vettoriale del vento a 500 hPa su griglia e ore visibili. Approssima il moto dei
  temporali ("i fenomeni scenderanno verso sud-est"), non lo determina.

## Probabilità: accordo fra modelli

La "probabilità" delle zone (bassa/media/alta, nel tratto del contorno e nell'etichetta) non è più
SHIP × un peso d'innesco letto da un solo run: è una **frequenza reale** — quanti modelli su tre
(ECMWF, GFS, ICON, `lib/agreement.js`) prevedono l'evento nella cella. Evento: convezione per la
grandine (codice temporalesco, o pioggia ≥ 1 mm/h con CAPE ≥ 500), raffiche ≥ 60 km/h per il
vento, accumulo giornaliero ≥ 10 mm per la pioggia. Soglie: bassa = un modello,
media = due, alta = tutti; **zero modelli è uno stato a sé** ("solo ambiente", contorno puntinato
finissimo): le condizioni per l'evento ci sarebbero, ma nessuno prevede l'innesco — non è una
probabilità bassa, è assenza di innesco, e mascherarla da "bassa" era scorretto. I **valori** (diametro, raffica, accumulo, geometria delle zone)
restano dal modello a più alta risoluzione: mai mediare gli ingredienti fra modelli — la media
cancella proprio le code che si cercano. Costo: +4 variabili × 3 modelli sulla stessa griglia.

## Ensemble (sperimentale)

Sezione separata, on-demand, **solo sul punto della località**: una chiamata ensemble pesa come
~31 normali (misurato: 149 KB per 31 membri × 15 variabili × 2 giorni), la griglia 7×7 sarebbe
fuori scala. Modello: **GFS 0,5° (31 membri)** — l'unico su ensemble-api con i livelli in quota
per membro, quindi l'unico dove SHIP si calcola membro per membro con i suoi ingredienti (ECMWF
ha 51 membri ma manca lo zero termico; gli ICON EPS accettano le variabili in quota ma tornano
null; ICON-D2-EPS fuori dominio risponde `nan` e rompe il parse). Mostra, ora per ora, la frazione
di membri con SHIP > 0,8 e > 1,5, CAPE ≥ 500, pioggia ≥ 1 mm/h, raffiche ≥ 60 km/h. La soglia
CAPE è tarata sul metro di GFS: misurato sullo stesso punto/ora, ICON-2I dà 1950 J/kg dove il GFS
deterministico dà 910 e il miglior membro 960 — una soglia da modello km-scale (1000+) qui non
scatterebbe mai. Il bias è dichiarato anche in UI. La prima
serie della risposta è il run di controllo (senza suffisso), poi `_member01…`.

**Mappa ensemble** — la stessa griglia 7×7 della sezione deterministica, ma colorata con la
frazione dei 31 membri oltre soglia (temporali / raffiche ≥ 60 / pioggia ≥ 10 mm), zone e
etichette in percentuale. Solo le 4 variabili di superficie: misurato 1,65 MB in 0,6 s — coi
livelli in quota per membro sarebbero ~7 MB, quindi la grandine ensemble resta sul punto.
Caricamento con un click separato che dichiara il peso. Soglie di colore: 10% / 33% / 67% / 90%.

**Confronto nel tempo** (`lib/history.js`): ogni giorno in cui le sezioni sono aperte si salva in
localStorage una riga con il previsto deterministico e le frazioni ensemble di oggi; dal giorno
dopo arriva l'osservato ERA5 (lag ~1 giorno: pioggia e raffiche — la grandine osservata non esiste
in nessun dataset gratuito, il confronto su SHIP resta indiretto). Massimo 60 righe, nessun
backend.

## Come si calcola il rischio grandine

Open-Meteo **non pubblica un diametro di grandine previsto**: il parametro `hail` viene accettato
dall'API ma restituisce sempre `null`. L'indice è quindi ricostruito dai parametri d'ambiente con
la formula **SHIP** (Significant Hail Parameter, Storm Prediction Center):

```text
SHIP = MUCAPE · w · LR₇₅ · (−T₅₀₀) · shear₀₋₆ / 42.000.000
```

| Termine | Da dove viene |
| --- | --- |
| MUCAPE | `cape` |
| w (rapporto di mescolanza) | da `dew_point_2m` + `surface_pressure`, limitato a 11–13,6 g/kg |
| LR₇₅ (gradiente 700→500 hPa) | `temperature_700hPa`, `temperature_500hPa`, `geopotential_height_*` |
| T₅₀₀ | `temperature_500hPa`, tetto a −5,5 °C |
| shear₀₋₆ | differenza vettoriale fra vento a 500 hPa e a 10 m, limitata a 7–27 m/s |
| zero termico | `freezing_level_height`, penalizza sotto 2400 m |

SHIP > 1 indica ambiente favorevole a grandine ≥ 5 cm. Poiché SHIP descrive il **potenziale** e
non l'**innesco**, il rischio mostrato pesa SHIP con la convezione effettivamente prevista dal
modello (`weather_code` temporalesco o precipitazione). Il diametro è una **stima da parametri**,
non l'uscita di un modello di grandine.

Costo API: una sola richiesta multi-località per l'intera griglia (49 punti × 14 variabili ×
fino a 72 ore ≈ 250 kB, meno di un secondo).

Due trappole trovate sul campo:

- La griglia si richiede con il **fuso esplicito della località**, non con `timezone=auto`: con
  `auto` ogni punto prende il proprio fuso (una cella sul Mar Ligure finisce in `Etc/GMT-1`) e le
  ore delle celle non sono più confrontabili fra loro né allineabili al giorno scelto.
- Il picco di rischio si calcola **dentro la finestra visualizzata**, non sull'intero orizzonte
  scaricato: altrimenti stando su "oggi" la sezione mostra il massimo di domani.

## Corse e orizzonti dei modelli

`/v1/forecast` non dice da quale corsa arrivano i dati. Open-Meteo pubblica però un `meta.json` per
ogni modello sorgente, con CORS aperto:

```text
https://api.open-meteo.com/data/<modello>/static/meta.json
→ last_run_initialisation_time, last_run_availability_time, data_end_time,
  update_interval_seconds, temporal_resolution_seconds
```

Il pannello "Stato dei modelli" mostra **due grandezze diverse**, che è facile confondere:

- **Validità** — la fine dei dati utilizzabili in quella località, con l'ora. Se il modello si
  ferma prima del proprio orizzonte globale il valore è in arancione: è la ragione per cui la linea
  sparisce dal grafico. Altrimenti vale l'orizzonte della corsa da `meta.json` — e le corse delle
  06Z e 18Z sono spesso molto più corte di quelle delle 00Z e 12Z (ICON globale: 120 h contro 180 h).

Le due possono divergere in entrambe le direzioni: i prodotti *seamless* completano la coda con la
corsa lunga precedente (UKMO dichiara +2,2 g ma serve 168 ore), mentre i modelli regionali si
fermano prima o mancano del tutto fuori dal dominio.

Attenzione: i modelli `*_seamless` sono composizioni di più sorgenti. `MODEL_SOURCES` in
`src/lib/runs.js` associa a ogni modello il **membro globale**, quello che determina il grosso
dell'orizzonte; il membro ad alta risoluzione usato nel breve termine ha una corsa propria, non
mostrata.

## Struttura

```text
src/
  App.jsx                  stato, fetch, orchestrazione
  lib/
    api.js                 chiamate Open-Meteo (forecast, geocoding, qualità aria, multi-modello)
    constants.js           modelli, variabili, palette, paesi
    format.js              formattazione IT, bande AQI, mediana, distanza/direzione
    hail.js                griglia, SHIP, peso d'innesco, bande di rischio e diametro
    hooks.js               localStorage, tema, debounce, click-outside, corse modelli
    runs.js                meta.json per modello: corsa, pubblicazione, orizzonte
    wmo.js                 codici meteo WMO → testo + icona
  components/
    TopBar / SearchBox     ricerca città + filtro paese
    CurrentHero            condizioni attuali
    DailyStrip             14 giorni
    HourlyChart            48 ore (temperatura + pioggia)
    ModelCompare           confronto multi-modello (+ ModelChips, ModelRuns, SpreadStats, ModelTable)
    HailRisk / HailMap     rischio grandine su griglia
    MapPanel               mappa Leaflet
    WeatherIcon / Ui       icone SVG e primitive
```

## Scroll con inerzia

Lo scorrimento di pagina passa da [Lenis](https://lenis.darkroom.engineering/): rotella e
trackpad hanno un'inerzia da ~1,1 s, il touch resta nativo. Tre regole per non rompere il resto:

- gli eventi a dominante orizzontale non vengono toccati (servono alla striscia dei giorni e
  alle tabelle: la pagina tanto non scorre in orizzontale);
- mappe Leaflet, tabella modelli e dropdown di ricerca hanno `data-lenis-prevent`: lì la
  rotella è nativa (zoom mappa, scroll interno) e `overscroll-behavior: contain` evita che a
  fine corsa trascinino la pagina;
- con `prefers-reduced-motion` Lenis non parte proprio.

## Note tecniche

- Una sola chiamata per il confronto: Open-Meteo restituisce tutti i modelli insieme
  (`models=a,b,c`), quindi accendere o spegnere un modello nel grafico non genera traffico.
- Le previsioni orarie partono dalle 00:00 del giorno corrente; il confronto viene tagliato
  all'ora locale **della località**, non del browser, usando `utc_offset_seconds`.
- Stack: Vite 8 + React 19 + Tailwind 4 + Recharts 3 + Leaflet / react-leaflet 5.
- Nessun backend, nessuna chiave, nessun cookie. I preferiti e le preferenze stanno in
  `localStorage`.
