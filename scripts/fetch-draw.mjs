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

  // Nummers
  for (const m of html.matchAll(/class="[^"]*ball[^"]*">(\d+)</gi)) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 50 && !nums.includes(n) && nums.length < 5) nums.push(n);
  }

  // Sterren
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

  // Machine — HTML structuur: "Ball Machine:\n<div class="title2">15</div>"
  // Zoek specifiek naar de div inhoud NA "Ball Machine"
  let machine = 0;
  const machineIdx = html.indexOf('Ball Machine');
  if (machineIdx > 0) {
    const machineSection = html.substring(machineIdx, machineIdx + 200);
    console.log('Machine sectie:', machineSection.replace(/\s+/g, ' ').trim().substring(0, 100));
    // Zoek getal in div tag na Ball Machine
    const divMatch = machineSection.match(/<div[^>]*>(\d{1,2})<\/div>/);
    if (divMatch) {
      machine = parseInt(divMatch[1]);
      console.log(`Machine gevonden in div: ${machine}`);
    }
  }

  // Balset — zelfde aanpak
  let bal = 0;
  const balIdx = html.indexOf('Ball Set');
  if (balIdx > 0) {
    const balSection = html.substring(balIdx, balIdx + 200);
    console.log('Bal sectie:', balSection.replace(/\s+/g, ' ').trim().substring(0, 100));
    const divMatch = balSection.match(/<div[^>]*>(\d{1,2})<\/div>/);
    if (divMatch) {
      bal = parseInt(divMatch[1]);
      console.log(`Bal gevonden in div: ${bal}`);
    }
  }

  // Draw number
  const drawM = html.match(/Draw Number[:\s<>\w\/]*?([0-9,]+)/i);
  const drawNum = drawM ? parseInt(drawM[1].replace(',','')) : 0;

  return {
    nums: nums.sort((a,b) => a-b),
    stars: stars.sort((a,b) => a-b),
    machine,
    bal,
    drawNum
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
    console.log(`Onvoldoende data — overslaan`);
    process.exit(0);
  }

  if (d.machine === 0 || d.bal === 0) {
    console.log('⚠ Machine/bal niet gevonden!');
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
