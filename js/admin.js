// js/admin.js
// PickMyNumbers — EuroMillions Number Optimizer

// =====================
// ADMIN — CONFIG
// =====================
const ADMIN_PIN_KEY  = 'em_admin_pin';
const ADMIN_DATA_KEY = 'em_draws_v1';
let adminLoggedIn = false;
let pinBuffer = '';
let fetchedDrawData = null;

function getStoredPin(){ return localStorage.getItem(ADMIN_PIN_KEY)||'1234'; }


// =====================
// ADMIN — LOCK BUTTON
// =====================
function adminToggleLock(){
  if(adminLoggedIn){ openAdminPanel(); return; }
  document.getElementById('adminOverlay').classList.add('open');
  document.getElementById('adminPinScreen').style.display='block';
  document.getElementById('adminPanel').style.display='none';
  pinBuffer=''; updatePinDots();
}

function showAdminTabs() {
  // Toon Resultaat tabblad voor admin
  const tabRes = document.getElementById('tabResultaat');
  if (tabRes) tabRes.style.display = '';
}
function closeAdmin(){ document.getElementById('adminOverlay').classList.remove('open'); }
function adminOverlayClick(e){ if(e.target===document.getElementById('adminOverlay')) closeAdmin(); }
function openAdminPanel(){
  document.getElementById('adminOverlay').classList.add('open');
  document.getElementById('adminPinScreen').style.display='none';
  document.getElementById('adminPanel').style.display='block';
  adminRefreshPanel();
}


// =====================
// ADMIN — PIN
// =====================
function updatePinDots(){
  for(let i=0;i<4;i++) document.getElementById('pd'+i).classList.toggle('filled',i<pinBuffer.length);
}
function pinPress(d){
  if(d==='DEL'){ pinBuffer=pinBuffer.slice(0,-1); updatePinDots(); return; }
  if(pinBuffer.length>=4) return;
  pinBuffer+=d; updatePinDots();
  if(pinBuffer.length===4){
    if(pinBuffer===getStoredPin()){
      adminLoggedIn=true;
      const btn=document.getElementById('adminLockBtn');
      btn.classList.add('unlocked'); btn.textContent='⚙';
      document.getElementById('adminPinScreen').style.display='none';
      document.getElementById('adminPanel').style.display='block';
      adminRefreshPanel();
      showAdminTabs();
    } else {
      document.getElementById('pinMsg').textContent='Onjuiste PIN';
      pinBuffer=''; updatePinDots();
      setTimeout(()=>document.getElementById('pinMsg').textContent='',2000);
    }
  }
}


// =====================
// ADMIN — PANEL REFRESH
// =====================
function adminRefreshPanel(){
  const mbCount=ALL_DRAWS.filter(d=>d.machine===currentMachine&&d.bal===currentBal).length;
  const raw=localStorage.getItem(ADMIN_DATA_KEY);
  const kb=raw?(Math.round(new Blob([raw]).size/102.4)/10)+'kb':'—';
  document.getElementById('ss-total').textContent=ALL_DRAWS.length;
  document.getElementById('ss-machine').textContent=mbCount;
  document.getElementById('ss-storage').textContent=raw?kb:'—';
  const today=new Date().toISOString().split('T')[0];
  document.getElementById('manDate').value=today;
  document.getElementById('fetchDate').value=today;

  // Vul trekking dropdown met laatste 20 trekkingen uit dataset
  const drawSelect = document.getElementById('analysisDraw');
  if(drawSelect) {
    drawSelect.innerHTML = '<option value="">— Selecteer trekking —</option>';
    ALL_DRAWS.filter(d => d.machine > 0).slice(0, 20).forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${d.date} — ${d.nums.join(' ')} + ★${d.stars.join(' ★')} (M${d.machine}/B${d.bal})`;
      drawSelect.appendChild(opt);
    });
  }

  // Machine/bal selector
  const combos=getAvailableMachineBal();
  const mbSel=document.getElementById('adminMbSelector');
  if(mbSel){
    mbSel.innerHTML=Object.entries(combos).map(([key,count])=>{
      const parts=key.replace('M','').split('/B');
      const m=parseInt(parts[0]),b=parseInt(parts[1]);
      const active=m===currentMachine&&b===currentBal;
      return `<button class="btn-admin ${active?'btn-admin-primary':''}" onclick="adminSetMachineBal(${m},${b})">${key} <span style="font-size:10px;opacity:0.7">(${count})</span></button>`;
    }).join('');
    document.getElementById('adminWeightDisplay').textContent=`×${getWeight(currentMachine,currentBal)}`;
    document.getElementById('adminMbCount').textContent=mbCount;
  }

  document.getElementById('adminDrawList').innerHTML=ALL_DRAWS.filter(d=>d.machine>0).slice(0,30).map((d,i)=>`
    <div class="admin-draw-item">
      <span class="adi-date">${d.date}</span>
      <span class="adi-machine">M${d.machine}/B${d.bal}</span>
      <span class="adi-balls">
        ${d.nums.map(n=>`<span class="fetch-mini-ball fmb-num" style="width:22px;height:22px;font-size:9px;">${n}</span>`).join('')}
        <span style="font-size:14px;color:#ddd;">+</span>
        ${d.stars.map(s=>`<span class="fetch-mini-ball fmb-star" style="width:22px;height:22px;font-size:9px;">${s}</span>`).join('')}
      </span>
      <span class="adi-del" onclick="adminDeleteDraw(${ALL_DRAWS.indexOf(d)})" title="Verwijder">✕</span>
    </div>`).join('');
}

function adminSetMachineBal(machine, bal){
  currentMachine=machine;
  currentBal=bal;
  localStorage.setItem('em_active_mb', JSON.stringify({machine,bal}));
  adminRefreshPanel();
  updateAll();
  renderMatrix();
  updateSom();
  updateConsec();
  selectTickets(3);
  renderRendement();
}


// =====================
// POOL DEKKING ANALYSE — wordt geladen na Supabase initialisatie
// =====================
async function saveDrawAnalysis(draw) {
  // Wacht tot supabaseClient beschikbaar is
  if (typeof supabaseClient === 'undefined') {
    setTimeout(() => saveDrawAnalysis(draw), 500);
    return;
  }
  try {
    // Bereken de optimizer pool op het moment van deze trekking
    // Gebruik getWeightedDraws maar zonder deze trekking zelf
    const weighted = getWeightedDraws(draw.machine, draw.bal);
    const freq = {};
    for(let n=1;n<=50;n++) freq[n]=0;
    weighted.forEach(d => d.nums.forEach(n => freq[n]++));

    const total = weighted.length;
    const avgFreq = (total * 5) / 50;
    const threshLow = Math.round(avgFreq * 0.67);
    const threshHigh = Math.round(avgFreq * 1.33);

    // Pool = hot + avg nummers
    const poolNums = [];
    for(let n=1;n<=50;n++) {
      if(freq[n] >= threshLow) poolNums.push(n);
    }

    // Welke uitslag nummers zitten IN de pool?
    const inPool = draw.nums.filter(n => poolNums.includes(n));
    const outPool = draw.nums.filter(n => !poolNums.includes(n));
    const coveragePct = Math.round((inPool.length / draw.nums.length) * 100);

    // Sterren analyse
    const starFreq = {};
    for(let s=1;s<=12;s++) starFreq[s]=0;
    weighted.forEach(d => d.stars.forEach(s => starFreq[s]++));
    const avgStarFreq = (total * 2) / 12;
    const hotStarsList = Object.keys(starFreq).map(Number).filter(s => starFreq[s] >= avgStarFreq * 1.3);
    const avgStarsList = Object.keys(starFreq).map(Number).filter(s => starFreq[s] >= avgStarFreq * 0.7 && starFreq[s] < avgStarFreq * 1.3);

    const starsCoverage = draw.stars.every(s => hotStarsList.includes(s)) ? 'beide hot' :
      draw.stars.some(s => hotStarsList.includes(s)) ? '1 hot' :
      draw.stars.every(s => avgStarsList.includes(s)) ? 'beide avg' :
      draw.stars.some(s => avgStarsList.includes(s)) ? '1 avg' : 'cold';

    // Datum naar ISO
    const months = {jan:'01',feb:'02',mrt:'03',apr:'04',mei:'05',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dec:'12'};
    const parts = draw.date.split(' ');
    const isoDate = parts.length === 3 && months[parts[1]]
      ? `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2,'0')}` : draw.date;

    // Opslaan in Supabase
    await supabaseClient.from('draw_analysis').upsert({
      draw_date: isoDate,
      draw_number: draw.draw || 0,
      machine: draw.machine,
      bal: draw.bal,
      actual_nums: draw.nums,
      actual_stars: draw.stars,
      pool_nums: poolNums,
      pool_size: poolNums.length,
      nums_in_pool: inPool,
      nums_out_pool: outPool,
      pool_coverage_pct: coveragePct,
      hot_stars: hotStarsList,
      avg_stars: avgStarsList,
      stars_coverage: starsCoverage
    }, { onConflict: 'draw_date' });

    console.log(`✓ Pool analyse opgeslagen: ${draw.date} — dekking ${coveragePct}% (${inPool.length}/5 in pool, buiten: ${outPool.join(',')||'geen'})`);
  } catch(e) {
    console.warn('Pool analyse fout:', e.message);
  }
}
// =====================
async function adminFetchBeatLottery(){
  const btn=document.getElementById('fetchBtn');
  const msg=document.getElementById('fetchMsg');
  const dateInput=document.getElementById('fetchDate').value;
  if(!dateInput){ msg.textContent='⚠ Kies eerst een datum'; msg.style.color='#A32D2D'; return; }

  btn.textContent='Bezig…'; btn.disabled=true;
  msg.textContent='Ophalen via BeatLottery…'; msg.style.color='#aaa';
  document.getElementById('fetchResult').style.display='none';

  // Datum voor URL en weergave
  const dateObj=new Date(dateInput);
  const months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const dateStr=`${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const targetUrl=`https://www.beatlottery.co.uk/euromillions/results/draw_date/${dateInput}`;

  // Probeer CORS-proxies (meerdere als fallback)
  const proxies=[
    u=>`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    u=>`https://corsproxy.io/?${encodeURIComponent(u)}`,
    u=>`https://thingproxy.freeboard.io/fetch/${u}`,
  ];

  let html='', ok=false;
  for(const proxyFn of proxies){
    try{
      const r=await fetch(proxyFn(targetUrl),{signal:AbortSignal.timeout(8000)});
      if(!r.ok) continue;
      const data=await r.json().catch(()=>null);
      html=data?.contents||await r.text();
      if(html&&html.length>500){ ok=true; break; }
    }catch(e){ continue; }
  }

  if(!ok){
    msg.textContent='⚠ Kon pagina niet ophalen — voer handmatig in';
    msg.style.color='#A32D2D';
    btn.textContent='↓ Ophalen'; btn.disabled=false;
    return;
  }

  // Parse HTML met DOMParser
  try{
    const parser=new DOMParser();
    const doc=parser.parseFromString(html,'text/html');
    const text=doc.body?.innerText||doc.body?.textContent||html;

    // --- Nummers: zoek patronen zoals "3 9 42 46 47" ---
    // BeatLottery heeft de winnende nummers als aparte li-elementen of spans
    let nums=[], stars=[], machine=null, bal=null;

    // Probeer gestructureerde elementen eerst
    // Nummers in ul/li met klassen of data-attributen
    const allLis=[...doc.querySelectorAll('li,span,div')];

    // Zoek machine en balset in tekst (patroon: "Machine: 13" of "Used Machine: 13 | Ball Set: 21")
    const machMatch=text.match(/[Uu]sed\s+[Mm]achine[:\s]+(\d+)/);
    const balMatch=text.match(/[Bb]all\s+[Ss]et[:\s]+(\d+)/);
    if(machMatch) machine=parseInt(machMatch[1]);
    if(balMatch) bal=parseInt(balMatch[1]);

    // Zoek winning numbers — BeatLottery toont ze als losse nummers
    // Patroon: reeks van 5 nummers 1-50 gevolgd door 2 nummers 1-12 (sterren)
    // Zoek alle nummers in de tekst op volgorde
    const numPattern=/\b([1-9]|[1-4][0-9]|50)\b/g;
    const allNums=[...text.matchAll(numPattern)].map(m=>parseInt(m[1]));

    // Zoek specifiek naar de winnende combinatie
    // BeatLottery pagina heeft herkenbare patronen — zoek clusters
    // Alternatief: zoek elementen met klasse die wijst op ballen
    const ballEls=[...doc.querySelectorAll('[class*="ball"],[class*="number"],[class*="winning"],[class*="result"]')];
    const ballNums=ballEls.map(el=>parseInt(el.textContent.trim())).filter(n=>!isNaN(n)&&n>=1&&n<=50);

    // Zoek sterren (1-12) apart
    const starEls=[...doc.querySelectorAll('[class*="star"],[class*="lucky"],[class*="bonus"]')];
    const starNums=starEls.map(el=>parseInt(el.textContent.trim())).filter(n=>!isNaN(n)&&n>=1&&n<=12);

    // Als we genoeg elementen hebben, gebruik die
    if(ballNums.length>=5){
      nums=ballNums.slice(0,5).sort((a,b)=>a-b);
      stars=starNums.length>=2?starNums.slice(0,2).sort((a,b)=>a-b):ballNums.slice(5,7).sort((a,b)=>a-b);
    } else {
      // Fallback: zoek in page text naar "Winning Numbers" sectie
      // Patroon: 5 nummers tussen 1-50, dan 2 sterren 1-12
      const winSection=text.split(/[Ww]inning|[Rr]esult|[Nn]umber/)[1]||text;
      const found=[...winSection.matchAll(/\b(\d{1,2})\b/g)]
        .map(m=>parseInt(m[1]))
        .filter(n=>n>=1&&n<=50)
        .filter((n,i,a)=>a.indexOf(n)===i) // uniek
        .slice(0,7);
      if(found.length>=5){
        nums=found.slice(0,5).sort((a,b)=>a-b);
        const possibleStars=found.slice(5,7).filter(n=>n<=12);
        stars=possibleStars;
      }
    }

    if(nums.length!==5||stars.length!==2){
      // Laatste fallback: geef wat we hebben, laat user aanvullen
      msg.textContent=`⚠ Kon nummers niet automatisch herkennen. Machine: ${machine||'?'}, Balset: ${bal||'?'}. Voer handmatig in.`;
      msg.style.color='#A32D2D';
      if(machine) document.getElementById('fetchMachine').value=machine;
      if(bal) document.getElementById('fetchBal').value=bal;
      btn.textContent='↓ Ophalen'; btn.disabled=false;
      return;
    }

    fetchedDrawData={nums,stars,dateStr};
    document.getElementById('fetchDateLabel').textContent=
      `${dateStr} · Machine ${machine||'?'} · Balset ${bal||'?'}`;
    document.getElementById('fetchBalls').innerHTML=
      nums.map(n=>`<span class="fetch-mini-ball fmb-num">${n}</span>`).join('')+
      `<span class="fmb-sep">+</span>`+
      stars.map(s=>`<span class="fetch-mini-ball fmb-star">${s}</span>`).join('');
    document.getElementById('fetchMachine').value=machine||'';
    document.getElementById('fetchBal').value=bal||'';
    document.getElementById('fetchResult').style.display='block';
    msg.textContent=machine&&bal
      ?`✓ Volledige data opgehaald incl. Machine ${machine} / Balset ${bal}`
      :'✓ Nummers opgehaald — controleer machine/balset';
    msg.style.color='#3B6D11';

  }catch(e){
    msg.textContent='⚠ Parse fout: '+e.message;
    msg.style.color='#A32D2D';
  }
  btn.textContent='↓ Ophalen'; btn.disabled=false;
}

function adminSaveFetched(){
  if(!fetchedDrawData){ return; }
  const machine=parseInt(document.getElementById('fetchMachine').value);
  const bal=parseInt(document.getElementById('fetchBal').value);
  const msg=document.getElementById('fetchMsg');
  if(isNaN(machine)||isNaN(bal)){ msg.textContent='⚠ Vul machine en balset in'; msg.style.color='#A32D2D'; return; }
  const exists=ALL_DRAWS.some(d=>d.date===fetchedDrawData.dateStr&&d.machine===machine&&d.bal===bal);
  if(exists){ msg.textContent='⚠ Al aanwezig in dataset'; msg.style.color='#A32D2D'; return; }
  const newDraw = {date:fetchedDrawData.dateStr,nums:fetchedDrawData.nums,stars:fetchedDrawData.stars,machine,bal};
  ALL_DRAWS.unshift(newDraw);
  adminSaveToStorage(); updateAll(); adminRefreshPanel();
  // Sla pool dekking analyse op
  saveDrawAnalysis(newDraw);
  document.getElementById('fetchResult').style.display='none';
  msg.textContent=`✓ ${fetchedDrawData.dateStr} M${machine}/B${bal} opgeslagen`; msg.style.color='#3B6D11';
  document.getElementById('lastDraw').textContent=`${fetchedDrawData.dateStr} — ${fetchedDrawData.nums.join(' ')} + ${fetchedDrawData.stars.join(' ')}`;
  fetchedDrawData=null;
  setTimeout(()=>msg.textContent='',4000);
}


// =====================
// ADMIN — HANDMATIG
// =====================
function adminAddManual(){
  const dateVal=document.getElementById('manDate').value;
  const machine=parseInt(document.getElementById('manMachine').value);
  const bal=parseInt(document.getElementById('manBal').value);
  const nums=[...document.querySelectorAll('.man-num')].map(i=>parseInt(i.value)).filter(n=>!isNaN(n)&&n>=1&&n<=50);
  const stars=[...document.querySelectorAll('.man-star')].map(i=>parseInt(i.value)).filter(n=>!isNaN(n)&&n>=1&&n<=12);
  const msg=document.getElementById('manMsg');
  if(!dateVal||nums.length!==5||stars.length!==2||isNaN(machine)||isNaN(bal)){
    msg.textContent='⚠ Vul alle velden in (datum, 5 nrs, 2 sterren, machine, balset)';
    msg.style.color='#A32D2D'; return;
  }
  const d=new Date(dateVal);
  const months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const dateStr=`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const newDraw = {date:dateStr,nums:nums.sort((a,b)=>a-b),stars:stars.sort((a,b)=>a-b),machine,bal};
  ALL_DRAWS.unshift(newDraw);
  adminSaveToStorage(); updateAll(); adminRefreshPanel();
  // Sla pool dekking analyse op
  saveDrawAnalysis(newDraw);
  document.querySelectorAll('.man-num,.man-star').forEach(i=>i.value='');
  msg.textContent=`✓ ${dateStr} M${machine}/B${bal} toegevoegd`; msg.style.color='#3B6D11';
  setTimeout(()=>msg.textContent='',4000);
}


// =====================
// ADMIN — DELETE
// =====================
function adminDeleteDraw(index){
  if(!confirm(`Verwijderen: ${ALL_DRAWS[index].date} M${ALL_DRAWS[index].machine}/B${ALL_DRAWS[index].bal}?`)) return;
  ALL_DRAWS.splice(index,1);
  adminSaveToStorage(); updateAll(); adminRefreshPanel();
}


// =====================
// ADMIN — STORAGE
// =====================
function adminSaveToStorage(){
  try{ localStorage.setItem(ADMIN_DATA_KEY,JSON.stringify(ALL_DRAWS)); }catch(e){ console.warn('Storage fout:',e); }
}
function adminLoadFromStorage(){
  try{
    const raw=localStorage.getItem(ADMIN_DATA_KEY);
    if(raw){ const p=JSON.parse(raw); if(Array.isArray(p)&&p.length>0){ ALL_DRAWS.splice(0,ALL_DRAWS.length,...p); return true; } }
  }catch(e){ console.warn('Laden mislukt:',e); }
  return false;
}
function adminExport(){
  const blob=new Blob([JSON.stringify({version:1,draws:ALL_DRAWS,exported:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`euromillions_dataset_${new Date().toISOString().split('T')[0]}.json`; a.click();
}
function adminImport(){ document.getElementById('importFile').click(); }
function adminDoImport(e){
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      const draws=data.draws||data;
      if(!Array.isArray(draws)||!draws.length) throw new Error('Geen geldige data');
      if(!confirm(`${draws.length} trekkingen importeren? Huidige data wordt vervangen.`)) return;
      ALL_DRAWS.splice(0,ALL_DRAWS.length,...draws);
      adminSaveToStorage(); updateAll(); adminRefreshPanel();
      alert(`✓ ${draws.length} trekkingen geïmporteerd`);
    }catch(err){ alert('Import fout: '+err.message); }
  };
  reader.readAsText(file); e.target.value='';
}
function adminClearStorage(){
  if(!confirm('⚠ Alle lokale opslag wissen? De ingebouwde dataset blijft.')) return;
  localStorage.removeItem(ADMIN_DATA_KEY); localStorage.removeItem(ADMIN_PIN_KEY);
  alert('Opslag gewist. Pagina wordt herladen.'); location.reload();
}
function adminChangePin(){
  const np=document.getElementById('newPin').value;
  const msg=document.getElementById('pinChangeMsg');
  if(!/^\d{4}$/.test(np)){ msg.textContent='⚠ Gebruik exact 4 cijfers'; msg.style.color='#A32D2D'; return; }
  localStorage.setItem(ADMIN_PIN_KEY,np);
  document.getElementById('newPin').value='';
  msg.textContent='✓ PIN gewijzigd'; msg.style.color='#3B6D11';
  setTimeout(()=>msg.textContent='',3000);
}


// =====================
// ADMIN — POOL ANALYSE & GEBRUIKERS (gebruikt supabaseClient)
// =====================
function adminLoadPoolAnalysis() {
  const container = document.getElementById('adminPoolAnalysis');
  if (!container) return;

  // Bereken pool analyse direct uit ALL_DRAWS — geen database nodig
  const mbDraws = ALL_DRAWS.filter(d => d.machine === currentMachine && d.bal === currentBal);

  if (mbDraws.length === 0) {
    container.innerHTML = '<span style="color:#aaa;">Geen trekkingen voor huidige machine/bal combinatie.</span>';
    return;
  }

  // Bereken optimizer pool en dekking per trekking
  const results = mbDraws.map((draw, idx) => {
    // Bouw gewogen dataset op zoals de optimizer dat doet
    const weighted = getWeightedDraws(draw.machine, draw.bal);
    const freq = {};
    for(let n=1;n<=50;n++) freq[n]=0;
    weighted.forEach(d => d.nums.forEach(n => freq[n]++));

    const total = weighted.length;
    const avgFreq = (total * 5) / 50;
    const threshLow = Math.round(avgFreq * 0.67);

    // Pool = nummers boven of gelijk aan threshold
    const pool = [];
    for(let n=1;n<=50;n++) {
      if(freq[n] >= threshLow) pool.push(n);
    }

    const inPool = draw.nums.filter(n => pool.includes(n));
    const outPool = draw.nums.filter(n => !pool.includes(n));
    const pct = Math.round((inPool.length / draw.nums.length) * 100);

    // Sterren analyse
    const starFreq = {};
    for(let s=1;s<=12;s++) starFreq[s]=0;
    weighted.forEach(d => d.stars.forEach(s => starFreq[s]++));
    const avgStar = (total * 2) / 12;
    const hotStars = Object.keys(starFreq).map(Number).filter(s => starFreq[s] >= avgStar * 1.3);
    const starsHot = draw.stars.filter(s => hotStars.includes(s)).length;

    return { draw, pool, inPool, outPool, pct, starsHot, poolSize: pool.length };
  });

  // Statistieken
  const avgPct = Math.round(results.reduce((s,r) => s+r.pct, 0) / results.length);
  const perfect = results.filter(r => r.pct === 100).length;
  const good = results.filter(r => r.pct >= 80 && r.pct < 100).length;
  const poor = results.filter(r => r.pct < 60).length;
  const avgPool = Math.round(results.reduce((s,r) => s+r.poolSize, 0) / results.length);
  const bothStarsHot = results.filter(r => r.starsHot === 2).length;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div class="ss-card"><div class="ss-val">${avgPct}%</div><div class="ss-lbl">Gem. dekking</div></div>
      <div class="ss-card"><div class="ss-val">${perfect}</div><div class="ss-lbl">100% raak</div></div>
      <div class="ss-card"><div class="ss-val">${mbDraws.length}</div><div class="ss-lbl">Trekkingen</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div class="ss-card"><div class="ss-val">${avgPool}</div><div class="ss-lbl">Gem. pool</div></div>
      <div class="ss-card"><div class="ss-val">${bothStarsHot}</div><div class="ss-lbl">Beide ★ hot</div></div>
      <div class="ss-card"><div class="ss-val">${poor}</div><div class="ss-lbl">&lt;60% dekking</div></div>
    </div>
    <div style="font-size:11px;color:#aaa;margin-bottom:8px;">Per trekking — M${currentMachine}/B${currentBal}:</div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:320px;overflow-y:auto;">
      ${results.map(r => {
        const color = r.pct===100 ? '#3B6D11' : r.pct>=80 ? '#854F0B' : r.pct>=60 ? '#E67E22' : '#A32D2D';
        const bar = '█'.repeat(Math.round(r.pct/20)) + '░'.repeat(5-Math.round(r.pct/20));
        return `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#f8f8f6;border-radius:6px;">
          <span style="font-size:10px;color:#888;min-width:80px;">${r.draw.date}</span>
          <span style="font-size:10px;color:#aaa;flex:1;">${r.draw.nums.join(' ')} +★${r.draw.stars.join('★')}</span>
          <span style="font-size:10px;font-family:monospace;color:#bbb;">${bar}</span>
          <span style="font-size:11px;font-weight:600;color:${color};min-width:32px;text-align:right;">${r.pct}%</span>
          <span style="font-size:10px;color:#aaa;min-width:40px;">${r.outPool.length>0?'❌'+r.outPool.join(','):'✓'}</span>
        </div>`;
      }).join('')}
    </div>`;
}


// =====================
// ADMIN — GEBRUIKERS OVERZICHT
// =====================
async function adminLoadUsers() {
  const container = document.getElementById('adminUsersList');
  if (!container) return;
  container.innerHTML = '<div style="font-size:12px;color:#aaa;">Laden…</div>';
  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!users || users.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:#aaa;">Nog geen gebruikers</div>';
      return;
    }

    // Haal ticket counts op
    const { data: tickets } = await supabaseClient.from('tickets').select('user_id');
    const ticketCounts = {};
    (tickets || []).forEach(t => { ticketCounts[t.user_id] = (ticketCounts[t.user_id]||0) + 1; });

    container.innerHTML = users.map(u => `
      <div class="admin-draw-item" style="flex-direction:column;align-items:flex-start;gap:4px;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
          <span style="font-size:13px;font-weight:500;">${u.name || '—'}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            ${u.blocked ? '<span style="font-size:10px;color:#A32D2D;background:#fdf0f0;padding:2px 6px;border-radius:4px;">Geblokkeerd</span>' : ''}
            <button onclick="adminToggleBlock('${u.id}',${!u.blocked})" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #ddd;background:#fff;cursor:pointer;">${u.blocked?'Deblokkeren':'Blokkeren'}</button>
          </div>
        </div>
        <span style="font-size:11px;color:#888;">${u.email}</span>
        <span style="font-size:10px;color:#bbb;">${ticketCounts[u.id]||0} ticket(s) · ${u.profile||'standaard'} profiel</span>
      </div>`).join('');
  } catch(e) {
    container.innerHTML = `<div style="font-size:12px;color:#A32D2D;">⚠ ${e.message}</div>`;
  }
}

// adminToggleBlock — verplaatst naar Supabase script blok


// =====================
// ANALYSE EMAIL STUREN
// =====================
function adminSelectDraw() {
  const sel = document.getElementById('analysisDraw');
  const idx = parseInt(sel.value);
  const info = document.getElementById('analysisTicketInfo');
  const preview = document.getElementById('analysisDrawPreview');
  const balls = document.getElementById('analysisDrawBalls');

  if (isNaN(idx)) { preview.style.display='none'; info.textContent=''; return; }

  const mbDraws = ALL_DRAWS.filter(d => d.machine > 0);
  const draw = mbDraws[idx];
  if (!draw) return;

  // Toon uitslag preview
  preview.style.display = 'block';
  balls.innerHTML =
    draw.nums.map(n => `<span class="fetch-mini-ball fmb-num">${n}</span>`).join('') +
    `<span style="margin:0 6px;color:#ddd;font-size:16px;">+</span>` +
    draw.stars.map(s => `<span class="fetch-mini-ball fmb-star">★${s}</span>`).join('');

  // Converteer datum naar ISO voor Supabase query
  const months = {jan:'01',feb:'02',mrt:'03',apr:'04',mei:'05',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dec:'12'};
  const parts = draw.date.split(' ');
  const isoDate = parts.length === 3 && months[parts[1]]
    ? `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2,'0')}` : '';

  // Check tickets voor deze datum
  info.textContent = 'Tickets ophalen…';
  supabaseClient.from('tickets').select('user_id').eq('draw_date', isoDate)
    .then(({data, error}) => {
      if (error) { info.textContent = '⚠ ' + error.message; return; }
      const count = data?.length || 0;
      const users = new Set((data||[]).map(t=>t.user_id)).size;
      info.textContent = count > 0
        ? `✓ ${count} tickets van ${users} gebruiker${users>1?'s':''} gevonden`
        : `⚠ Geen tickets gevonden voor ${draw.date}`;
      info.style.color = count > 0 ? '#3B6D11' : '#A32D2D';
    });
}

async function adminSendAnalysis() {
  const btn = document.getElementById('sendAnalysisBtn');
  const msg = document.getElementById('analysisMsg');
  const sel = document.getElementById('analysisDraw');
  const idx = parseInt(sel.value);

  if (isNaN(idx)) { msg.textContent = '⚠ Kies eerst een trekking'; msg.style.color='#A32D2D'; return; }

  const mbDraws = ALL_DRAWS.filter(d => d.machine > 0);
  const draw = mbDraws[idx];
  if (!draw) return;

  const nums = draw.nums;
  const stars = draw.stars;

  // Converteer datum naar ISO
  const months = {jan:'01',feb:'02',mrt:'03',apr:'04',mei:'05',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dec:'12'};
  const parts = draw.date.split(' ');
  const isoDate = parts.length === 3 && months[parts[1]]
    ? `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2,'0')}` : '';

  btn.disabled = true; btn.textContent = 'Bezig…';
  msg.textContent = 'Tickets ophalen…'; msg.style.color = '#aaa';

  try {
    const { data: tickets, error } = await supabaseClient
      .from('tickets')
      .select('*, users(name, email)')
      .eq('draw_date', isoDate);

    if (error) throw error;
    if (!tickets || tickets.length === 0) {
      msg.textContent = `⚠ Geen tickets gevonden voor ${draw.date}`;
      msg.style.color = '#A32D2D';
      btn.disabled = false; btn.textContent = '📧 Stuur analyse emails';
      return;
    }

    // Groepeer per gebruiker
    const byUser = {};
    tickets.forEach(t => {
      if (!t.users) return;
      if (!byUser[t.user_id]) byUser[t.user_id] = { user: t.users, tickets: [] };
      byUser[t.user_id].tickets.push(t);
    });

    let sent = 0;
    for (const [uid, data] of Object.entries(byUser)) {
      await sendAnalysisEmail(data.user.name, data.user.email, data.tickets, nums, stars, draw);
      sent++;
      msg.textContent = `${sent}/${Object.keys(byUser).length} emails verzonden…`;
    }

    msg.textContent = `✓ ${sent} analyse email${sent>1?'s':''} verzonden voor ${draw.date}!`;
    msg.style.color = '#3B6D11';
  } catch(e) {
    msg.textContent = '⚠ ' + e.message;
    msg.style.color = '#A32D2D';
  }
  btn.disabled = false; btn.textContent = '📧 Stuur analyse emails';
}

async function sendAnalysisEmail(name, email, tickets, actualNums, actualStars, draw) {

  // ── Uitslag statistieken ──
  const actualSum = actualNums.reduce((a,b) => a+b, 0);
  const actualOdd = actualNums.filter(n => n%2!==0).length;
  const actualEven = actualNums.length - actualOdd;
  const actualLow = actualNums.filter(n => n<=25).length;
  const actualHigh = actualNums.length - actualLow;

  // ── Per ticket analyse ──
  let bestNumHits = 0, bestStarHits = 0;
  const ticketRows = tickets.map((t, i) => {
    const numHits = t.nums.filter(n => actualNums.includes(n));
    const starHits = t.stars.filter(s => actualStars.includes(s));
    if (numHits.length > bestNumHits || (numHits.length === bestNumHits && starHits.length > bestStarHits)) {
      bestNumHits = numHits.length;
      bestStarHits = starHits.length;
    }
    const prize = getPrize(numHits.length, starHits.length);
    const hasPrize = prize.label !== 'Geen prijs';
    const ticketSum = t.nums.reduce((a,b) => a+b, 0);
    const ticketOdd = t.nums.filter(n => n%2!==0).length;
    const ticketLow = t.nums.filter(n => n<=25).length;

    return `
      <div style="background:${hasPrize?'#f0f8ec':'#f8f8f6'};border:1px solid ${hasPrize?'#c8e0b8':'#e8e8e4'};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:500;color:#555;">Ticket ${t.ticket_number}</span>
          <span style="font-size:12px;font-weight:600;color:${prize.color};">${prize.label}</span>
        </div>
        <div style="margin-bottom:8px;">
          ${t.nums.map(n => {
            const hit = actualNums.includes(n);
            return `<span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:${hit?'#0C447C':'#E6F1FB'};color:${hit?'#fff':'#0C447C'};font-size:11px;font-weight:600;margin:2px;line-height:32px;text-align:center;vertical-align:middle;">${n}</span>`;
          }).join('')}
          <span style="margin:0 4px;color:#ddd;font-size:16px;">+</span>
          ${t.stars.map(s => {
            const hit = actualStars.includes(s);
            return `<span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:${hit?'#8a4510':'#fff4e6'};color:${hit?'#fff':'#8a4510'};font-size:11px;font-weight:600;margin:2px;line-height:32px;text-align:center;vertical-align:middle;">★${s}</span>`;
          }).join('')}
        </div>
        <div style="font-size:10px;color:#aaa;display:flex;gap:12px;">
          <span>Som: ${ticketSum}</span>
          <span>${ticketOdd} oneven · ${t.nums.length - ticketOdd} even</span>
          <span>${ticketLow} laag · ${t.nums.length - ticketLow} hoog</span>
          <span style="color:${numHits.length>0?'#0C447C':'#aaa'};">${numHits.length} nrs raak</span>
          <span style="color:${starHits.length>0?'#8a4510':'#aaa'};">${starHits.length} ★ raak</span>
        </div>
      </div>`;
  }).join('');

  // ── Algemene analyse ──
  const bestPrize = getPrize(bestNumHits, bestStarHits);

  // Som analyse
  const somMin = 90, somMax = 180; // standaard parameters
  const somOk = actualSum >= somMin && actualSum <= somMax;

  // Odd/even analyse
  const oddEvenAnalysis = actualOdd === 3 ? '3+2 (ideaal)' :
    actualOdd === 2 ? '2+3 (goed)' :
    actualOdd === 4 ? '4+1 (licht scheef)' : `${actualOdd}+${actualEven} (ongebruikelijk)`;

  // Laag/hoog analyse
  const lowHighAnalysis = actualLow === 2 || actualLow === 3 ? `${actualLow}+${actualHigh} (gebalanceerd)` :
    `${actualLow}+${actualHigh} (${actualLow>3?'overwegend laag':'overwegend hoog'})`;

  // Motiverende afsluiting
  const motivation = bestNumHits >= 3 ? '🔥 Geweldig resultaat! Je zit dicht bij een prijs.' :
    bestNumHits === 2 ? '👍 Goed begin! De statistieken werken — blijf spelen.' :
    bestNumHits === 1 ? '📊 Eén nummer raak. De formule bouwt zich op over tijd.' :
    '🎯 Geen nummers raak deze keer — dat hoort bij het spel. Volgende keer!';

  const html = `
    <!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8f8f6;padding:2rem;margin:0;">
    <div style="max-width:560px;margin:auto;">


      <div style="background:#1a1a18;border-radius:14px 14px 0 0;padding:1.5rem;color:#fff;text-align:center;">
        <div style="font-size:22px;margin-bottom:4px;">🎰 PickMyNumbers</div>
        <div style="font-size:14px;font-weight:500;">Trekking Analyse — ${draw ? draw.date : ''}</div>
        <div style="font-size:12px;color:#aaa;margin-top:4px;">Persoonlijk rapport voor ${name}</div>
      </div>

      <div style="background:#fff;border:1px solid #e8e8e4;border-top:none;border-radius:0 0 14px 14px;padding:1.5rem;">


        <div style="background:#f8f8f6;border-radius:10px;padding:14px 16px;margin-bottom:1.5rem;">
          <div style="font-size:11px;color:#aaa;font-weight:600;letter-spacing:0.06em;margin-bottom:10px;text-transform:uppercase;">Officiële uitslag</div>
          <div style="margin-bottom:4px;">
            ${actualNums.map(n => `<span style="display:inline-block;width:38px;height:38px;border-radius:50%;background:#1a1a18;color:#fff;font-size:13px;font-weight:600;margin:2px;line-height:38px;text-align:center;vertical-align:middle;">${n}</span>`).join('')}
            <span style="margin:0 8px;color:#ddd;font-size:20px;vertical-align:middle;">+</span>
            ${actualStars.map(s => `<span style="display:inline-block;width:38px;height:38px;border-radius:50%;background:#e8922a;color:#fff;font-size:13px;font-weight:600;margin:2px;line-height:38px;text-align:center;vertical-align:middle;">★${s}</span>`).join('')}
          </div>
        </div>


        <div style="background:${bestNumHits>=2?'#f0f8ec':'#fff4e6'};border:1px solid ${bestNumHits>=2?'#c8e0b8':'#fdd'};border-radius:10px;padding:12px 16px;margin-bottom:1.5rem;text-align:center;">
          <div style="font-size:13px;color:#555;margin-bottom:4px;">Jouw beste resultaat</div>
          <div style="font-size:20px;font-weight:600;color:${bestPrize.color};">${bestPrize.label}</div>
          <div style="font-size:12px;color:#888;margin-top:4px;">${bestNumHits} nummers + ${bestStarHits} ster${bestStarHits!==1?'ren':''} raak</div>
        </div>


        <div style="font-size:13px;font-weight:600;color:#111;margin-bottom:10px;">
          Jouw tickets <span style="font-size:11px;font-weight:400;color:#aaa;">(donkerblauw/oranje = raak)</span>
        </div>
        ${ticketRows}


        <div style="background:#f0f6ff;border:1px solid #bdd9f5;border-radius:10px;padding:14px 16px;margin-top:1.5rem;">
          <div style="font-size:11px;font-weight:600;color:#0C447C;letter-spacing:0.06em;margin-bottom:8px;text-transform:uppercase;">📊 Statistische analyse</div>
          <div style="font-size:12px;color:#333;line-height:1.8;">
            <div>• Uitslag som <strong>${actualSum}</strong> — ${somOk?'✓ binnen jouw filter (90-180)':'⚠ buiten het standaard filter (90-180)'}</div>
            <div>• Verdeling: <strong>${actualOdd} oneven + ${actualEven} even</strong> — ${oddEvenAnalysis}</div>
            <div>• Bereik: <strong>${actualLow} laag (≤25) + ${actualHigh} hoog (>25)</strong> — ${lowHighAnalysis}</div>
            <div>• Lucky Stars <strong>★${actualStars[0]} & ★${actualStars[1]}</strong> — ${
              actualStars.every(s => [6,5,9].includes(s)) ? '🔥 beide zijn hot sterren voor M13/B21' :
              actualStars.some(s => [6,5,9].includes(s)) ? '📊 1 hot ster gevallen' :
              '❄️ beide zijn avg/cold sterren deze ronde'
            }</div>
          </div>
        </div>


        <div style="text-align:center;margin-top:1.5rem;padding:14px;background:#f8f8f6;border-radius:10px;">
          <div style="font-size:14px;color:#333;margin-bottom:12px;">${motivation}</div>
          <a href="https://pickmynumbers.eu" style="display:inline-block;background:#1a1a18;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none;">
            🎰 Genereer tickets voor de volgende trekking
          </a>
        </div>


        <p style="font-size:11px;color:#888;text-align:center;margin-top:1.5rem;padding:12px;background:#fff8e6;border-radius:8px;line-height:1.6;border:1px solid #fde8a0;">
          ℹ️ <em>Deze analyse is gebaseerd op je gegenereerde tickets. Indien je niet of gedeeltelijk hebt deelgenomen aan deze trekking, kan de analyse afwijken van je werkelijke resultaat.</em>
        </p>
        <p style="font-size:10px;color:#bbb;text-align:center;margin-top:1rem;line-height:1.6;">
          EuroMillions is een kans- en gokspel. Geen enkele methode garandeert winst. 18+.<br>
          <a href="https://pickmynumbers.eu" style="color:#bbb;">pickmynumbers.eu</a> · 
          Uitschrijven? Stuur een email naar noreply@pickmynumbers.eu
        </p>

      </div>
    </div>
    </body></html>`;

  await fetch(EDGE_EMAIL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      to: [email],
      subject: `🎰 Jouw EuroMillions analyse — ${draw ? draw.date : new Date().toLocaleDateString('nl-NL')}`,
      html
    })
  });
}


// =====================
// ADMIN — INIT (laad opgeslagen data)
// =====================
adminLoadFromStorage();
// Laad actieve machine/bal instelling
try {
  const saved = JSON.parse(localStorage.getItem('em_active_mb'));
  if (saved && saved.machine && saved.bal) {
    currentMachine = saved.machine;
    currentBal = saved.bal;
  }
} catch(e) {}
updateAll();

// ===================== SUPABASE + AUTH + GEBRUIKERSPROFIEL =====================

const USER_KEY = 'em_user_profile';
let currentUser = null;
let currentSession = null;
let pendingTickets = [];
let selectedProfile = 'standard';
let loginSelectedProfile = 'standard';

const PROFILES = {
  standard: { label:'Freemium', tickets:3, nums:5, stars:2 },
  custom:   { label:'Premium',  tickets:3, nums:5, stars:2 },
};

// Laad opgeslagen gebruiker
try {
  const saved = localStorage.getItem(USER_KEY);
  if (saved) {
    currentUser = JSON.parse(saved);
    selectedProfile = currentUser.profile || 'standard';
  }
  const savedProfile = localStorage.getItem('em_user_profile_type');
  if (savedProfile) selectedProfile = savedProfile;
} catch(e) {}


