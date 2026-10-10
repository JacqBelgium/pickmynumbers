import https from 'node:https';
import fs from 'node:fs';

// Workflow draait om 20:30 UTC = vrijdag/dinsdag avond
// Gebruik Europese tijd (UTC+2 CEST / UTC+1 CET) voor correcte datum
const now = new Date();
const cetOffset = (() => {
  // Zomertijd: laatste zondag maart t/m laatste zondag oktober
  const year = now.getUTCFullYear();
  // Laatste zondag maart
  const lastSunMar = new Date(Date.UTC(year, 2, 31));
  lastSunMar.setUTCDate(31 - lastSunMar.getUTCDay());
  // Laatste zondag oktober
  const lastSunOct = new Date(Date.UTC(year, 9, 31));
  lastSunOct.setUTCDate(31 - lastSunOct.getUTCDay());
  return (now >= lastSunMar && now < lastSunOct) ? 2 : 1;
})();
const local = new Date(now.getTime() + cetOffset * 3600000);

const day   = String(local.getUTCDate()).padStart(2, '0');
const month = String(local.getUTCMonth() + 1).padStart(2, '0');
const year  = local.getUTCFullYear();
const dateStr = `${day}-${month}-${year}`;
const monthsNL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const nlDate = `${parseInt(day)} ${monthsNL[local.getUTCMonth()]} ${year}`;

console.log(`Ophalen trekking: ${dateStr} (${nlDate})`);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function parseEuroMillions(html) {
  const nums = [], stars = [];
  for (const m of html.matchAll(/class="[^"]*ball[^"]*">(\d+)</gi)) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 50 && !nums.includes(n) && nums.length < 5) nums.push(n);
  }
  for (const m of html.matchAll(/class="[^"]*lucky[^"]*">(\d+)</gi)) {
    const s = parseInt(m[1]);
    if (s >= 1 && s <= 12 && !stars.includes(s) && stars.length < 2) stars.push(s);
  }
  if (stars.length < 2) {
    for (const m of html.matchAll(/class="[^"]*star[^"]*">(\d+)</gi)) {
      const s = parseInt(m[1]);
      if (s >= 1 && s <= 12 && !stars.includes(s) && stars.length < 2) stars.push(s);
    }
  }

  // Machine & bal — euro-millions.com structuur
  let machine = 0, bal = 0;
  const machineIdx = html.indexOf('Ball Machine');
  if (machineIdx > 0) {
    const sec = html.substring(machineIdx, machineIdx + 200);
    const m = sec.match(/<div[^>]*>(\d{1,2})<\/div>/);
    if (m) machine = parseInt(m[1]);
  }
  const balIdx = html.indexOf('Ball Set');
  if (balIdx > 0) {
    const sec = html.substring(balIdx, balIdx + 200);
    const m = sec.match(/<div[^>]*>(\d{1,2})<\/div>/);
    if (m) bal = parseInt(m[1]);
  }

  const drawM = html.match(/Draw Number[:\s<>\w\/]*?([0-9,]+)/i);
  const drawNum = drawM ? parseInt(drawM[1].replace(',','')) : 0;
  return { nums: nums.sort((a,b)=>a-b), stars: stars.sort((a,b)=>a-b), machine, bal, drawNum };
}

function parseLottery(html) {
  // lottery.co.uk structuur
  const nums = [], stars = [];
  for (const m of html.matchAll(/class="[^"]*ball[^"]*">(\d+)</gi)) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 50 && !nums.includes(n) && nums.length < 5) nums.push(n);
  }
  for (const m of html.matchAll(/class="[^"]*lucky[^"]*star[^"]*">(\d+)</gi)) {
    const s = parseInt(m[1]);
    if (s >= 1 && s <= 12 && !stars.includes(s) && stars.length < 2) stars.push(s);
  }
  if (stars.length < 2) {
    for (const m of html.matchAll(/class="[^"]*star[^"]*">(\d+)</gi)) {
      const s = parseInt(m[1]);
      if (s >= 1 && s <= 12 && !stars.includes(s) && stars.length < 2) stars.push(s);
    }
  }
  // lottery.co.uk heeft geen machine/bal info — die retourneren we als 0
  const drawM = html.match(/Draw\s*(?:Number|#|No\.?)[:\s]*([0-9,]+)/i);
  const drawNum = drawM ? parseInt(drawM[1].replace(',','')) : 0;
  return { nums: nums.sort((a,b)=>a-b), stars: stars.sort((a,b)=>a-b), machine: 0, bal: 0, drawNum };
}

try {
  // Probeer euro-millions.com EERST — heeft machine/bal info
  // Daarna lottery.co.uk als fallback voor de nummers
  const sources = [
    { url: `https://www.euro-millions.com/results/${dateStr}`, parser: parseEuroMillions, hasMB: true },
    { url: `https://www.lottery.co.uk/euromillions/results-${day}-${month}-${year}`, parser: parseLottery, hasMB: false },
    { url: `https://www.beatlottery.co.uk/euromillions/results/${dateStr}`, parser: parseEuroMillions, hasMB: true },
  ];

  let d = null;
  for (const src of sources) {
    console.log(`Probeer: ${src.url}`);
    try {
      const res = await fetchUrl(src.url);
      if (res.status === 200) {
        const parsed = src.parser(res.body);
        console.log(`Status 200 — gevonden: ${JSON.stringify(parsed)}`);
        if (parsed.nums.length === 5 && parsed.stars.length === 2) {
          d = parsed;
          console.log(`✓ Succes${src.hasMB ? '' : ' (geen machine/bal)'}: ${src.url}`);
          break;
        } else {
          console.log(`Onvoldoende data (${parsed.nums.length} nrs, ${parsed.stars.length} sterren) — volgende proberen`);
        }
      } else {
        console.log(`Status ${res.status} — volgende proberen`);
      }
    } catch(e) { console.log(`Mislukt: ${e.message}`); }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  if (!d) {
    console.log('Alle URLs mislukt — handmatig invoeren nodig');
    process.exit(0);
  }

  if (d.machine === 0 || d.bal === 0) {
    console.log('⚠ Machine/bal niet gevonden — wordt als 0 opgeslagen');
  }

  let dataJs = fs.readFileSync('js/data.js', 'utf8');
  const entry = `  { date:'${nlDate}', draw:${d.drawNum}, nums:[${d.nums.join(',')}], stars:[${d.stars.join(',')}], machine:${d.machine}, bal:${d.bal} },`;

  if (dataJs.includes(`date:'${nlDate}'`) || (d.drawNum > 0 && dataJs.includes(`draw:${d.drawNum}`))) {
    console.log(`Al aanwezig: ${nlDate}`);
    process.exit(0);
  }

  dataJs = dataJs.replace('let ALL_DRAWS = [', `let ALL_DRAWS = [\n${entry}`);
  fs.writeFileSync('js/data.js', dataJs);

  // Signaal voor analyse email
  const info = JSON.stringify({ date: nlDate, isoDate: `${year}-${month}-${day}`, nums: d.nums, stars: d.stars, machine: d.machine, bal: d.bal, drawNum: d.drawNum });
  fs.writeFileSync('/tmp/draw_info.json', info);
  fs.writeFileSync('/tmp/new_draw.txt', 'true');

  console.log(`✓ Toegevoegd: ${nlDate} — ${d.nums.join('-')} + ★${d.stars.join('-')} M${d.machine}/B${d.bal}`);

} catch(e) {
  console.error('Fout:', e.message);
  process.exit(0);
}
