import https from 'node:https';
import fs from 'node:fs';

const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0');
const year = now.getFullYear();
const dateStr = `${day}-${month}-${year}`;
const monthsNL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const nlDate = `${parseInt(day)} ${monthsNL[now.getMonth()]} ${year}`;

console.log(`Ophalen trekking: ${dateStr} (${nlDate})`);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function parse(html) {
  const nums = [];
  const stars = [];
  
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

  const machineM = html.match(/[Mm]achine[:\s#]*(\d+)/);
  const balM = html.match(/[Bb]all?\s*[Ss]et[:\s]*(\d+)/i);
  const drawM = html.match(/[Dd]raw[:\s#]*([0-9,]+)/);

  return {
    nums: nums.sort((a,b) => a-b),
    stars: stars.sort((a,b) => a-b),
    machine: machineM ? parseInt(machineM[1]) : 0,
    bal: balM ? parseInt(balM[1]) : 0,
    drawNum: drawM ? parseInt(drawM[1].replace(',','')) : 0
  };
}

try {
  const url = `https://www.euro-millions.com/results/${dateStr}`;
  console.log(`URL: ${url}`);
  
  const r = await fetchUrl(url);
  console.log(`Status: ${r.status}`);
  
  if (r.status !== 200) {
    console.log('Pagina niet beschikbaar');
    process.exit(0);
  }

  const d = parse(r.body);
  console.log('Gevonden:', JSON.stringify(d));

  if (d.nums.length !== 5 || d.stars.length !== 2) {
    console.log(`Onvoldoende data (${d.nums.length} nrs, ${d.stars.length} sterren) — overslaan`);
    process.exit(0);
  }

  let dataJs = fs.readFileSync('js/data.js', 'utf8');
  
  if (dataJs.includes(`'${nlDate}'`)) {
    console.log(`${nlDate} al aanwezig`);
    process.exit(0);
  }

  const entry = `  { date:'${nlDate}', draw:${d.drawNum}, nums:[${d.nums}], stars:[${d.stars}], machine:${d.machine}, bal:${d.bal} },`;
  dataJs = dataJs.replace('let ALL_DRAWS = [', `let ALL_DRAWS = [\n${entry}`);
  fs.writeFileSync('js/data.js', dataJs);
  
  const info = JSON.stringify({
    date: nlDate,
    isoDate: `${year}-${month}-${day}`,
    nums: d.nums,
    stars: d.stars,
    machine: d.machine,
    bal: d.bal
  });
  fs.writeFileSync('/tmp/draw_info.json', info);
  fs.writeFileSync('/tmp/new_draw.txt', 'true');
  
  console.log(`✓ Toegevoegd: ${nlDate} — ${d.nums.join('-')} + ★${d.stars.join('-')} M${d.machine}/B${d.bal}`);

} catch(e) {
  console.error('Fout:', e.message);
  process.exit(1);
}
