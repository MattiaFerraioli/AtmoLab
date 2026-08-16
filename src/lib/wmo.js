/** Codici meteo WMO 4677 usati da Open-Meteo → testo IT + famiglia di icona. */
const TABLE = {
  0: ['Sereno', 'sun'],
  1: ['Prevalentemente sereno', 'sun-cloud'],
  2: ['Parzialmente nuvoloso', 'sun-cloud'],
  3: ['Coperto', 'cloud'],
  45: ['Nebbia', 'fog'],
  48: ['Nebbia con brina', 'fog'],
  51: ['Pioviggine debole', 'drizzle'],
  53: ['Pioviggine', 'drizzle'],
  55: ['Pioviggine intensa', 'drizzle'],
  56: ['Pioviggine gelata', 'sleet'],
  57: ['Pioviggine gelata intensa', 'sleet'],
  61: ['Pioggia debole', 'rain'],
  63: ['Pioggia', 'rain'],
  65: ['Pioggia forte', 'rain'],
  66: ['Pioggia gelata', 'sleet'],
  67: ['Pioggia gelata forte', 'sleet'],
  71: ['Neve debole', 'snow'],
  73: ['Neve', 'snow'],
  75: ['Neve forte', 'snow'],
  77: ['Granuli di neve', 'snow'],
  80: ['Rovesci deboli', 'showers'],
  81: ['Rovesci', 'showers'],
  82: ['Rovesci violenti', 'showers'],
  85: ['Rovesci di neve', 'snow'],
  86: ['Rovesci di neve forti', 'snow'],
  95: ['Temporale', 'storm'],
  96: ['Temporale con grandine', 'storm'],
  99: ['Temporale con grandine forte', 'storm'],
}

export const wmoText = (code) => (TABLE[code] || ['Non disponibile', 'cloud'])[0]
export const wmoIcon = (code) => (TABLE[code] || ['', 'cloud'])[1]

/**
 * Intensità 1–3 dal codice WMO: pilota quanti segni disegna l'icona
 * (1 linea poca pioggia … 3 linee tanta; 1 fulmine possibili temporali,
 * 2 temporali, 3 temporali forti).
 */
const INTENSITY = {
  51: 1, 53: 2, 55: 3,
  56: 1, 57: 3,
  61: 1, 63: 2, 65: 3,
  66: 1, 67: 3,
  71: 1, 73: 2, 75: 3, 77: 1,
  80: 1, 81: 2, 82: 3,
  85: 1, 86: 3,
  95: 2, 96: 3, 99: 3,
}

export const wmoIntensity = (code) => INTENSITY[code] ?? 2
