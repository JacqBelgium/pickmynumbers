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

  // Machine — euro-millions.com toont "Ball Machine: 15" als plain text
  let machine = 0;
  const machinePatterns = [
    /Ball Machine:\s*(\d+)/i,
    /Ball Machine<\/[^>]+>\s*(\d+)/i,
    /Ball Machine[^0-9]*(\d{1,2})/i,
    /"ballMachine"\s*:\s*(\d+)/i,
    /machine["\s:>]+(\d{1,2})\b/i,
  ];
  for (const p of machinePatterns) {
    const m = html.match(p);
    if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 20) {
      machine = parseInt(m[1]);
      console.log(`Machine gevonden met patroon: ${p} → ${machine}`);
      break;
    }
  }

  // Balset — euro-millions.com toont "Ball Set: 19" als plain text
  let bal = 0;
  const balPatterns = [
    /Ball Set:\s*(\d+)/i,
    /Ball Set<\/[^>]+>\s*(\d+)/i,
    /Ball Set[^0-9]*(\d{1,2})/i,
    /"ballSet"\s*:\s*(\d+)/i,
    /ball.?set["\s:>]+(\d{1,2})\b/i,
  ];
  for (const p of balPatterns) {
    const m = html.match(p);
    if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 30) {
      bal = parseInt(m[1]);
      console.log(`Balset gevonden met patroon: ${p} → ${bal}`);
      break;
    }
  }

  // Draw number
  const drawM = html.match(/Draw Number[:\s<>\w\/]*?([0-9,]+)/i) ||
                html.match(/"drawNumber"[:\s]*([0-9]+)/i) ||
                html.match(/Draw Number:\s*([0-9,]+)/i);
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

  // Debug: toon machine/bal context
  const machineIdx = r.body.toLowerCase().indexOf('ball machine');
  if (machineIdx > 0) {
    console.log('Machine context:', r.body.substring(machineIdx, machineIdx + 50));
  } else {
    console.log('⚠ "Ball Machine" niet gevonden in pagina');
  }

  const d = parse(r.body);
  console.log('Gevonden:', JSON.stringify(d));

  if (d.nums.length !== 5 || d.stars.length !== 2) {
    console.log(`Onvoldoende data — overslaan`);
    process.exit(0);
  }

  if (d.machine === 0 || d.bal === 0) {
    console.log('⚠ Machine/bal niet gevonden — wordt 0 opgeslagen, handmatig aanpassen!');
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
