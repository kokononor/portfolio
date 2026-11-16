// Today's edition. The hero's dateline reads like the strip under a newspaper's masthead: the day and date in Delhi,
// the edition's number (the day of the year) and Delhi's weather right now (Open-Meteo: free, no key, and nothing
// about the visitor is sent).
const line = document.querySelector<HTMLElement>('[data-edition]');
if (line) {
  const add = (text: string, cls = '') => {
    const s = document.createElement('span');
    s.textContent = text;
    if (cls) s.className = cls;
    line.append(s);
    return s;
  };
  const delhi = new Date(Date.now() + 5.5 * 3600e3);                    // Delhi's clock, read through the UTC getters
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
  const no = Math.floor((Date.UTC(delhi.getUTCFullYear(), delhi.getUTCMonth(), delhi.getUTCDate()) - Date.UTC(delhi.getUTCFullYear(), 0, 0)) / 86400e3);
  line.textContent = '';

  add(date);
  add(`No. ${no}`);

  const SKY: [number, string][] = [[0, 'Clear'], [2, 'Fair'], [3, 'Overcast'], [48, 'Haze'], [57, 'Drizzle'], [67, 'Rain'], [77, 'Snow'], [82, 'Showers'], [99, 'Thunder']];
  fetch('https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.21&current=temperature_2m,weather_code')
    .then(r => (r.ok ? r.json() : Promise.reject()))
    .then(d => {
      const t = Math.round(d.current.temperature_2m), code = d.current.weather_code as number;
      const sky = SKY.find(([max]) => code <= max)?.[1] ?? 'Fair';
      add(`${t}°C, ${sky}`);
    })
    .catch(() => {});                                                    // no weather: the dateline simply ends at the number
}
