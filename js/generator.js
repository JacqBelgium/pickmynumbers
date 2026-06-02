// js/generator.js
// PickMyNumbers — EuroMillions Number Optimizer

// =====================
// GEWOGEN SCORING
// =====================
function getWeight(machine, bal) {
  // Gewichtsfactor op basis van aantal M/B trekkingen
  const mbDraws = ALL_DRAWS.filter(d => d.machine === machine && d.bal === bal).length;
  if (mbDraws > 80) return 10;
  if (mbDraws > 60) return 8;
  if (mbDraws > 40) return 6;
  if (mbDraws > 20) return 4;
  if (mbDraws >= 10) return 2;
  return 1; // <10: factor 1, telt mee als gewone trekking
}

function getWeightedDraws(machine, bal) {
  const weight = getWeight(machine, bal);
  const mbDraws = ALL_DRAWS.filter(d => d.machine === machine && d.bal === bal).length;
  
  // Bepaal welke algemene data te gebruiken
  // < 100 M/B trekkingen: alleen 2025+ (recente data, minder dilutie)
  // >= 100 M/B trekkingen: alle jaren (2023-2026)
  const useAllYears = mbDraws >= 100;
  const cutoffDraw = 1804; // draw 1761 = 3 jan 2025

  const weighted = [];
  ALL_DRAWS.forEach(d => {
    if (d.machine === machine && d.bal === bal) {
      for (let i = 0; i < weight; i++) weighted.push(d);
    } else if (d.machine === 0 || d.machine !== machine || d.bal !== bal) {
      // Algemene data: alleen meenemen als useAllYears of trekking is uit 2025+
      if (useAllYears || (d.draw && d.draw >= cutoffDraw)) {
        weighted.push(d);
      }
    }
  });
  return weighted;
}

// Beschikbare machine/bal combinaties
function getAvailableMachineBal() {
  const combos = {};
  ALL_DRAWS.forEach(d => {
    if (d.machine > 0) {
      const key = `M${d.machine}/B${d.bal}`;
      combos[key] = (combos[key] || 0) + 1;
    }
  });
  return combos;
}


// =====================
// FREQ DATA
// =====================
function getFreqData(field) {
  const maxN=field==='stars'?12:50;
  const freq=new Array(maxN+1).fill(0),lastSeen=new Array(maxN+1).fill(undefined);
  const draws = getWeightedDraws(currentMachine, currentBal);
  draws.forEach((d,i)=>{d[field].forEach(n=>{freq[n]++;if(lastSeen[n]===undefined)lastSeen[n]=i;});});
  return{freq,lastSeen,maxN,total:draws.length};
}

function getTier(f){
  const T=getWeightedDraws(currentMachine, currentBal).length;
  const avg=(T*5)/50;
  const lo=Math.round(avg*0.67), hi=Math.round(avg*1.33);
  return f>hi?'hot':f>=lo?'avg':'cold';
}

function buildPool(field,tier){
  const{freq,lastSeen,maxN,total}=getFreqData(field);
  const pool=[];
  for(let n=1;n<=maxN;n++){
    const f=freq[n]||0,t=field==='stars'?'star':getTier(f);
    if(t!==tier) continue;
    const absent=lastSeen[n]!==undefined?lastSeen[n]:total;
    pool.push({num:n,score:f>0?Math.max(0.01,absent/(total/f)):0.01,freq:f});
  }
  return pool;
}

function getPickDist(){
  const hp=buildPool('nums','hot'),ap=buildPool('nums','avg');
  const active=hp.length+ap.length;
  return hp.length/active>0.5?{hot:3,avg:2,label:'3h+2a'}:{hot:2,avg:3,label:'2h+3a'};
}

function getStarStrategy(){
  // Bereken sterren frequentie op gewogen dataset (M/B trekkingen wegen zwaarder)
  const weighted = getWeightedDraws(currentMachine, currentBal);
  const starFreq = {};
  const starLastSeen = {};
  for(let n=1;n<=12;n++) starFreq[n]=0;

  weighted.forEach((d,i) => {
    d.stars.forEach(s => {
      starFreq[s]++;
      if(starLastSeen[s]===undefined) starLastSeen[s]=i;
    });
  });

  const total = weighted.length;
  const avgFreq = (total * 2) / 12; // verwachte frequentie per ster

  // Bereken score per ster: combinatie van frequentie en recentheid
  const starData = [];
  for(let n=1;n<=12;n++){
    const f = starFreq[n] || 0;
    const lastSeen = starLastSeen[n] !== undefined ? starLastSeen[n] : total;
    // Score = frequentie gewogen + overdue bonus
    const freqScore = f / avgFreq; // >1 = hot, <1 = cold
    const overdueScore = lastSeen / (total / Math.max(f,1));
    const combinedScore = (freqScore * 0.6) + (overdueScore * 0.4);

    // Tier bepalen
    const hotThresh = avgFreq * 1.3;
    const coldThresh = avgFreq * 0.7;
    const tier = f >= hotThresh ? 'hot' : f <= coldThresh ? 'cold' : 'avg';

    starData.push({n, f, freqScore, overdueScore, combinedScore, tier, lastSeen});
  }

  // Sorteer op combined score (hoogste = meest aanbevolen)
  starData.sort((a,b) => b.combinedScore - a.combinedScore);

  // Hot sterren (>1.3× gemiddeld)
  const hotStars = starData.filter(s => s.tier === 'hot').map(s => s.n);
  // Avg sterren
  const avgStars = starData.filter(s => s.tier === 'avg').map(s => s.n);
  // Cold sterren (vermijden)
  const coldStars = starData.filter(s => s.tier === 'cold').map(s => s.n);

  // Top 5 voor combinaties (hot eerst, dan avg) — GEEN cold sterren
  const top5 = [...hotStars, ...avgStars].slice(0, 5);
  const top3 = top5.slice(0, 3);

  // 2-ster combinaties — altijd minstens 1 hot ster erin
  const combis2 = [];
  const allCandidates = [...hotStars, ...avgStars];
  for(let i=0; i<allCandidates.length && combis2.length<6; i++){
    for(let j=i+1; j<allCandidates.length && combis2.length<6; j++){
      if(hotStars.includes(allCandidates[i]) || hotStars.includes(allCandidates[j])){
        combis2.push([allCandidates[i], allCandidates[j]].sort((a,b)=>a-b));
      }
    }
  }
  if(combis2.length < 3) {
    combis2.push(...[[top3[0],top3[1]],[top3[0],top3[2]],[top3[1],top3[2]]]);
  }

  // 3-ster combinaties — uit top5 (hot+avg), altijd minstens 1 hot
  const combis3 = [];
  for(let i=0;i<top5.length;i++)
    for(let j=i+1;j<top5.length;j++)
      for(let k=j+1;k<top5.length;k++){
        const combo = [top5[i],top5[j],top5[k]];
        if(combo.some(s => hotStars.includes(s)))
          combis3.push(combo.sort((a,b)=>a-b));
      }

  // 4-ster combinaties — uit top6 (hot+avg), altijd minstens 1 hot
  const top6 = [...hotStars, ...avgStars].slice(0, 6);
  const combis4 = [];
  for(let i=0;i<top6.length;i++)
    for(let j=i+1;j<top6.length;j++)
      for(let k=j+1;k<top6.length;k++)
        for(let l=k+1;l<top6.length;l++){
          const combo = [top6[i],top6[j],top6[k],top6[l]];
          if(combo.some(s => hotStars.includes(s)))
            combis4.push(combo.sort((a,b)=>a-b));
        }

  return {top3, top5, top6, hotStars, avgStars, coldStars, starData, combis:combis2, combis3, combis4, avgFreq};
}

function weightedPick(pool,count){
  const av=[...pool],pk=[];
  for(let i=0;i<count;i++){
    if(!av.length) break;
    const tot=av.reduce((s,x)=>s+x.score,0);
    let r=Math.random()*tot,idx=av.length-1;
    for(let j=0;j<av.length;j++){r-=av[j].score;if(r<=0){idx=j;break;}}
    pk.push(av[idx]);av.splice(idx,1);
  }
  return pk;
}


// =====================
// FILTERS
// =====================
function check2D(nums){
  // Gebruik altijd de eerste 5 nummers voor 2D check
  const n5 = nums.slice(0,5);
  const odd=n5.filter(n=>n%2!==0).length,laag=n5.filter(n=>n<=25).length;
  return selectedMatrix.has(odd+'_'+laag);
}
function checkSom(nums){
  // Som van eerste 5 nummers
  const n5 = nums.slice(0,5);
  const min=parseInt(document.getElementById('somMin').value),max=parseInt(document.getElementById('somMax').value);
  const s=n5.reduce((a,b)=>a+b,0);return s>=min&&s<=max;
}
function checkConsec(nums){
  // Check eerste 5 nummers op consecutive
  const n5 = nums.slice(0,5);
  if(!document.getElementById('consecToggle').checked) return true;
  const s=[...n5].sort((a,b)=>a-b);let run=1;
  for(let i=1;i<s.length;i++){if(s[i]===s[i-1]+1)run++;else run=1;if(run>=3)return false;}
  return true;
}
function checkOverlap(nums, prevTickets){
  if(maxOverlap>=99) return true;
  for(const prev of prevTickets){
    const overlap=nums.filter(n=>prev.includes(n)).length;
    if(overlap>maxOverlap) return false;
  }
  return true;
}

function pickWithFilters(hp,ap,hc,ac,prevTickets,extraNums=0){
  for(let a=0;a<200;a++){
    const h=weightedPick(hp,hc),av=weightedPick(ap,ac);
    let nums=[...h,...av].map(x=>x.num);

    // Extra nummers voor systeem spel (6+, 7+, 8+)
    if(extraNums>0){
      const allPool=[...hp,...ap].map(x=>x.num).filter(n=>!nums.includes(n));
      for(let e=0;e<extraNums&&allPool.length>0;e++){
        const idx=Math.floor(Math.random()*allPool.length);
        nums.push(allPool.splice(idx,1)[0]);
      }
    }

    if(check2D(nums.slice(0,5))&&checkSom(nums.slice(0,5))&&checkConsec(nums.slice(0,5))&&checkOverlap(nums,prevTickets)){
      const odd=nums.filter(n=>n%2!==0).length,laag=nums.filter(n=>n<=25).length;
      return{h,a:av,nums,odd,even:nums.length-odd,laag,hoog:nums.length-laag,som:nums.reduce((a,b)=>a+b,0),ok:true};
    }
  }
  const h=weightedPick(hp,hc),av=weightedPick(ap,ac);
  let nums=[...h,...av].map(x=>x.num);
  if(extraNums>0){
    const allPool=[...hp,...ap].map(x=>x.num).filter(n=>!nums.includes(n));
    for(let e=0;e<extraNums&&allPool.length>0;e++){
      const idx=Math.floor(Math.random()*allPool.length);
      nums.push(allPool.splice(idx,1)[0]);
    }
  }
  const odd=nums.filter(n=>n%2!==0).length,laag=nums.filter(n=>n<=25).length;
  return{h,a:av,nums,odd,even:nums.length-odd,laag,hoog:nums.length-laag,som:nums.reduce((a,b)=>a+b,0),ok:false,fallback:true};
}


// =====================
// MATRIX RENDER
// =====================
function renderMatrix(){
  const grid=document.getElementById('matrixGrid');
  let html='<div class="matrix-header"></div>';
  [1,2,3,4].forEach(l=>html+=`<div class="matrix-header">${l}L+${5-l}H</div>`);
  [1,2,3,4].forEach(o=>{
    html+=`<div class="matrix-row-label">${o}o+${5-o}e</div>`;
    [1,2,3,4].forEach(l=>{
      const key=o+'_'+l,d=MATRIX_DATA[key],pct=d?d.pct:0,on=selectedMatrix.has(key);
      const bg=on?`hsl(100,${40+pct*2}%,${90-pct}%)`:'#f8f8f6';
      html+=`<div class="matrix-cell ${on?'on':'off'}" onclick="toggleMatrix('${key}')" style="background:${bg};">
        <span class="cell-pct" style="color:${on?'#3B6D11':'#bbb'}">${d?d.pct+'%':'—'}</span>
        <span class="cell-count" style="color:${on?'#5a8a30':'#ccc'}">${d?d.count+'x':''}</span>
      </div>`;
    });
  });
  grid.innerHTML=html;
  const cov=Array.from(selectedMatrix).reduce((s,k)=>s+(MATRIX_DATA[k]?.count||0),0);
  document.getElementById('matrixCoverage').textContent=`Dekking: ${(cov/104*100).toFixed(0)}%`;
  document.getElementById('matrixDetail').textContent=`${selectedMatrix.size} patronen actief · 104 trekkingen 2025`;
  document.getElementById('rule2D').textContent=selectedMatrix.size+' van 16';
}
function toggleMatrix(key){
  if(selectedMatrix.has(key)){if(selectedMatrix.size>1)selectedMatrix.delete(key);}
  else selectedMatrix.add(key);
  renderMatrix();
}


// =====================
// OVERLAP
// =====================
function setOverlap(n){
  maxOverlap=n;
  document.querySelectorAll('.overlap-btn').forEach((b,i)=>{
    const vals=[0,1,2,3,99];
    b.classList.toggle('active',vals[i]===n);
  });
  const labels={0:'Geen overlap toegestaan',1:'Max 1 overlappend nummer',2:'Max 2 overlappende nummers',3:'Max 3 overlappende nummers',99:'Geen beperking'};
  document.getElementById('overlapLabel').textContent=labels[n]||'';
  document.getElementById('ruleOverlap').textContent=n===99?'geen':('max '+n);
  document.getElementById('overlapStat').textContent=n===99?'Uitgeschakeld':'Actief';
}


// =====================
// MACHINE/BAL SELECTOR
// =====================
function selectMachineBal(machine, bal, btn) {
  currentMachine = machine;
  currentBal = bal;
  document.querySelectorAll('.mb-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const weight = getWeight(machine, bal);
  const mbCount = ALL_DRAWS.filter(d => d.machine === machine && d.bal === bal).length;
  document.getElementById('machineBadge').textContent = `M${machine}/B${bal}`;
  updateAll();
  renderMatrix();
  updateSom();
  updateConsec();
  selectTickets(3);
  renderRendement();
}


// =====================
// UPDATE UI
// =====================
function updateAll(){
  threshLow_v=parseInt(document.getElementById('sliderLow').value);
  threshHigh_v=parseInt(document.getElementById('sliderHigh').value);
  if(threshLow_v>threshHigh_v){threshHigh_v=threshLow_v+1;document.getElementById('sliderHigh').value=threshHigh_v;}
  document.getElementById('valLow').textContent=threshLow_v;
  document.getElementById('valHigh').textContent=threshHigh_v;

  // Show warning if user has changed defaults
  if(typeof defaultThreshLow!=='undefined' && typeof defaultThreshHigh!=='undefined'){
    const changed=(threshLow_v!==defaultThreshLow||threshHigh_v!==defaultThreshHigh);
    const w=document.getElementById('paramWarnSlider');
    if(w) w.classList.toggle('show',changed);
  }

  const draws=ALL_DRAWS.filter(d=>d.machine===currentMachine&&d.bal===currentBal);
  const weighted=getWeightedDraws(currentMachine,currentBal);
  const weight=getWeight(currentMachine,currentBal);
  const hp=buildPool('nums','hot'),ap=buildPool('nums','avg'),cp=buildPool('nums','cold'),sp=buildPool('stars','star');
  const dist=getPickDist();
  const avg=(draws.length*5/50).toFixed(1);
  document.getElementById('avgDisp').textContent=avg;
  document.getElementById('totalDraws').textContent=`${ALL_DRAWS.length} totaal, ${draws.length} M${currentMachine}/B${currentBal} · gewicht ×${weight}`;
  document.getElementById('machineLabel').textContent='M'+currentMachine+'/B'+currentBal;
  document.getElementById('machineBadge').textContent='M'+currentMachine+'/B'+currentBal;
  document.getElementById('machineTag').textContent='M'+currentMachine+'/B'+currentBal+' · '+draws.length+' trekkingen · ×'+weight;
  // Dynamische stat label voor som/consecutive
  const somLabel = document.getElementById('somStatLabel');
  if(somLabel) somLabel.textContent = `${weighted.length} gewogen trekkingen · M${currentMachine}/B${currentBal} ×${weight}`;
  document.getElementById('ruleMain').innerHTML=`<span style="color:#0C447C;">${dist.hot}</span>h+<span style="color:#7a5c1e;">${dist.avg}</span>a`;
  document.getElementById('s-hot').textContent=hp.length;
  document.getElementById('s-avg').textContent=ap.length;
  document.getElementById('s-star').textContent=sp.length;
  document.getElementById('s-cold').textContent=cp.length;
  document.getElementById('poolPills').innerHTML=
    `<span class="pill pill-hot">Hot ${hp.length} (&gt;${threshHigh_v}×)</span>`+
    `<span class="pill pill-avg">Avg ${ap.length} (${threshLow_v}–${threshHigh_v}×)</span>`+
    `<span class="pill pill-cold">Cold ${cp.length} (&lt;${threshLow_v}×)</span>`;
  const{top3,top5,top6,hotStars,avgStars,coldStars,starData,combis,combis3,combis4,avgFreq}=getStarStrategy();
  const profile = typeof getActiveProfile === 'function' ? getActiveProfile() : {stars:2};
  const starsInProfile = profile.stars || 2;
  const displayCombis = starsInProfile >= 4 ? combis4.slice(0,6) : starsInProfile >= 3 ? combis3.slice(0,6) : combis.slice(0,3);

  // Update titel
  const starTitle = document.getElementById('starStratTitle');
  const starSub = document.getElementById('starSub');
  const ruleStarCount = document.getElementById('ruleStarCount');
  if(starTitle) starTitle.textContent = starsInProfile >= 4
    ? '4-Sterren strategie — hot/cold analyse M/B specifiek'
    : starsInProfile >= 3
    ? '3-Sterren strategie — hot/cold analyse M/B specifiek'
    : '2-Sterren strategie — hot/cold analyse M/B specifiek';
  if(starSub) starSub.innerHTML =
    `<span style="color:#A32D2D;">🔥 Hot: ${hotStars.join(' ')||'—'}</span> &nbsp;` +
    `<span style="color:#7a5c1e;">📊 Avg: ${avgStars.join(' ')||'—'}</span> &nbsp;` +
    `<span style="color:#888;">❄️ Cold: ${coldStars.join(' ')||'—'}</span>`;
  if(ruleStarCount) ruleStarCount.textContent = starsInProfile >= 4 ? 'Top 6' : starsInProfile >= 3 ? 'Top 5' : 'Top 3';

  document.getElementById('starCombis').innerHTML=displayCombis.map((c,i)=>`
    <div class="star-combi"><span class="star-combi-label">Combi ${i+1}:</span>
    ${c.map(s=>{
      const isHot = hotStars.includes(s);
      const isAvg = avgStars.includes(s);
      const bg = isHot ? '#C0392B' : isAvg ? '#E67E22' : '#fff4e6';
      const color = isHot || isAvg ? '#fff' : '#8a4510';
      const border = isHot ? '#C0392B' : isAvg ? '#E67E22' : '#e8922a';
      return `<div class="ball ball-star" style="width:34px;height:34px;font-size:12px;background:${bg};color:${color};border-color:${border};display:inline-flex;align-items:center;justify-content:center;line-height:1;">${s}</div>`;
    }).join('')}</div>`).join('') +
    `<div style="font-size:10px;color:#aaa;margin-top:8px;display:flex;gap:12px;">
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#C0392B;display:inline-block;"></span>Hot</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#E67E22;display:inline-block;"></span>Avg</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#fff4e6;border:1px solid #e8922a;display:inline-block;"></span>Cold</span>
    </div>`;
  if(document.getElementById('pane-freq').classList.contains('active')) renderFreq();
}

function updateSom(){
  let min=parseInt(document.getElementById('somMin').value),max=parseInt(document.getElementById('somMax').value);
  if(min>max-20){min=max-20;document.getElementById('somMin').value=min;}
  document.getElementById('somMinVal').textContent=min;
  document.getElementById('somMaxVal').textContent=max;
  document.getElementById('ruleSom').textContent=min+'–'+max;
  const draws=ALL_DRAWS.filter(d=>d.machine===currentMachine&&d.bal===currentBal);
  const fits=draws.filter(d=>{const s=d.nums.reduce((a,b)=>a+b,0);return s>=min&&s<=max;}).length;
  document.getElementById('somDetail').textContent=`${fits} van ${draws.length} trekkingen in bereik (${draws.length>0?(fits/draws.length*100).toFixed(0):0}%)`;
}

function updateConsec(){
  document.getElementById('consecLabel').textContent=document.getElementById('consecToggle').checked
    ?'Consecutive filter actief — geen 3+ opeenvolgend':'Consecutive filter uitgeschakeld';
}


// =====================
// GENERATE
// =====================
function nextDrawDate(){
  const d=new Date(),days=['zo','ma','di','wo','do','vr','za'],months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  let nd=new Date(d);
  for(let i=0;i<=7;i++){const wd=nd.getDay();if((wd===2||wd===5)&&(i>0||nd.getHours()<21))break;nd.setDate(nd.getDate()+1);}
  return`${days[nd.getDay()]} ${nd.getDate()} ${months[nd.getMonth()]}`;
}

function getNextDrawDateISO(){
  // Geeft de volgende trekkingsdatum als YYYY-MM-DD
  const d=new Date();
  let nd=new Date(d);
  for(let i=0;i<=7;i++){
    const wd=nd.getDay();
    if((wd===2||wd===5)&&(i>0||nd.getHours()<21)) break;
    nd.setDate(nd.getDate()+1);
  }
  return nd.toISOString().split('T')[0];
}

function selectTickets(n){
  numTickets=n;
  document.querySelectorAll('.sel-btn').forEach((b,i)=>b.classList.toggle('active',i===n-1));
  const profile = typeof getActiveProfile === 'function' ? getActiveProfile() : {nums:5,stars:2};
  // Systeem spel kost meer: 6 nummers = €5, 7 nummers = €14, etc.
  const costs = {5:2.5, 6:5, 7:14, 8:35};
  const costPerTicket = costs[profile.nums] || 2.5;
  const total = (n * costPerTicket).toFixed(2).replace('.',',');
  document.getElementById('inzetInfo').innerHTML=`${n} ticket${n>1?'s':''} · <strong>€${total}</strong>${profile.nums>5?' (systeem spel)':''}`;
  document.getElementById('genBtn').textContent=`Genereer ${n} ticket${n>1?'s':''}`;
  renderEmpty(n);
}

function renderEmpty(n){
  const g=document.getElementById('ticketsGrid');g.innerHTML='';
  const p = typeof getActiveProfile === 'function' ? getActiveProfile() : {nums:5,stars:2};
  for(let i=1;i<=n;i++){
    const d=document.createElement('div');d.className='ticket';
    d.innerHTML=`<div class="ticket-header"><span class="ticket-num">Ticket ${i}</span><span>—</span></div>
      <div class="balls">${Array(p.nums).fill(0).map(()=>`<div class="ball ball-empty">?</div>`).join('')}<span class="sep">+</span>${Array(p.stars).fill(0).map(()=>`<div class="ball ball-empty">?</div>`).join('')}</div>`;
    g.appendChild(d);
  }
}

function generateAll(){
  // Check of gebruiker ingelogd is
  if (!currentSession && !currentUser) {
    document.getElementById('genBtn').style.display = 'none';
    document.getElementById('loginPrompt').style.display = 'block';
    return;
  }
  const hp=buildPool('nums','hot'),ap=buildPool('nums','avg');
  const dist=getPickDist();
  const{combis,combis3,combis4}=getStarStrategy();
  if(hp.length<dist.hot){alert('Hot pool te klein — pas grenzen aan.');return;}
  if(ap.length<dist.avg){alert('Average pool te klein — pas grenzen aan.');return;}

  // Haal profiel op
  const profile = typeof getActiveProfile === 'function' ? getActiveProfile() : {nums:5,stars:2,tickets:numTickets};
  const numsCount = profile.nums || 5;
  const starsCount = profile.stars || 2;

  // Kies juiste ster combinaties op basis van profiel
  const starCombis = starsCount >= 4 ? combis4 : starsCount >= 3 ? combis3 : combis;

  const nd=nextDrawDate(),g=document.getElementById('ticketsGrid');
  g.innerHTML='';
  playedTickets=[];
  const pickedNums=[];

  for(let t=1;t<=numTickets;t++){
    const extraNums = numsCount - 5;
    const r=pickWithFilters(hp,ap,dist.hot,dist.avg,pickedNums,extraNums);
    const allNums=r.nums.sort((a,b)=>a-b),hotNums=r.h.map(x=>x.num);

    // Roteer door ster combinaties — elke ticket een andere
    const sc = starCombis[(t-1) % starCombis.length];

    pickedNums.push(allNums);
    playedTickets.push({nums:allNums,stars:sc});

    let overlapInfo='';
    if(t>1){
      const maxOv=pickedNums.slice(0,-1).map(prev=>allNums.filter(n=>prev.includes(n)).length);
      const maxO=Math.max(...maxOv);
      overlapInfo=maxO===0?'✓ Geen overlap':`~ Max ${maxO} overlap`;
    }

    const div=document.createElement('div');div.className='ticket ticket-card';
    div.innerHTML=`
      <div class="ticket-header"><span class="ticket-num">Ticket ${t}</span><span>${nd} · ${dist.label}</span></div>
      <div class="balls">
        ${allNums.map(n=>`<div class="ball ball-num ${hotNums.includes(n)?'ball-hot':'ball-avg'}">${n}</div>`).join('')}
        <span class="sep">+</span>
        ${sc.map(s=>`<div class="ball ball-star">${s}</div>`).join('')}
      </div>
      <div class="ticket-tags">
        <span class="ttag ${r.ok?'ttag-g':'ttag-w'}">${r.ok?'✓':'~'} ${r.odd}o+${r.even}e · ${r.laag}L+${r.hoog}H</span>
        <span class="ttag ttag-b">Som: ${r.som}</span>
        <span class="ttag ttag-o">★ ${sc.join('-')}</span>
        ${overlapInfo?`<span class="ttag ${overlapInfo.startsWith('✓')?'ttag-g':'ttag-p'}">${overlapInfo}</span>`:''}
        ${r.fallback?'<span class="ttag ttag-w">Fallback</span>':''}
      </div>`;
    g.appendChild(div);
  }
  document.getElementById('attemptInfo').textContent=`${numTickets} ticket${numTickets>1?'s':''} gegenereerd met anti-overlap (max ${maxOverlap===99?'∞':maxOverlap})`;

  // Vul gespeelde tickets in het resultaatformulier
  buildTicketInputs();
}


// =====================
// RESULTAAT INVOER
// =====================
function buildTicketInputs(){
  const container=document.getElementById('ticketInputs');
  container.innerHTML='';
  playedTickets.forEach((t,i)=>{
    const div=document.createElement('div');
    div.style.cssText='background:#f8f8f6;border:1px solid #e8e8e4;border-radius:8px;padding:8px 12px;';
    div.innerHTML=`<div style="font-size:11px;color:#888;margin-bottom:4px;">Ticket ${i+1}: ${t.nums.join(' ')} + ${t.stars.join(' ')}</div>
      <div style="font-size:11px;color:#aaa;">Inzet: €2,50</div>`;
    container.appendChild(div);
  });
}

function addTicketInput(){
  const container=document.getElementById('ticketInputs');
  const div=document.createElement('div');
  div.style.cssText='display:flex;gap:6px;flex-wrap:wrap;align-items:center;';
  div.innerHTML=`<span style="font-size:11px;color:#888;min-width:55px;">Ticket ${container.children.length+1}:</span>
    ${[1,2,3,4,5].map(()=>`<input type="number" class="num-input manual-ticket-num" min="1" max="50" placeholder="nr">`).join('')}
    <span style="font-size:11px;color:#888;">+</span>
    ${[1,2].map(()=>`<input type="number" class="num-input manual-ticket-star" min="1" max="12" placeholder="★">`).join('')}`;
  container.appendChild(div);
}

function saveResult(){
  const dateVal=document.getElementById('resDate').value;
  const machine=parseInt(document.getElementById('resMachine').value);
  const bal=parseInt(document.getElementById('resBal').value);
  const numInputs=[...document.querySelectorAll('.res-num')].map(i=>parseInt(i.value)).filter(n=>!isNaN(n));
  const starInputs=[...document.querySelectorAll('.res-star')].map(i=>parseInt(i.value)).filter(n=>!isNaN(n));

  if(!dateVal||numInputs.length!==5||starInputs.length!==2||isNaN(machine)||isNaN(bal)){
    document.getElementById('saveMsg').textContent='⚠ Vul alle velden correct in (datum, 5 nummers, 2 sterren, machine, balset)';
    document.getElementById('saveMsg').style.color='#A32D2D';
    return;
  }

  const d=new Date(dateVal);
  const days=['zo','ma','di','wo','do','vr','za'],months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const dateStr=`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

  // Check machine/balset wijziging
  const machineChanged=(machine!==currentMachine||bal!==currentBal);
  if(machineChanged){
    document.getElementById('machineAlert').style.display='block';
    document.getElementById('machineAlertText').innerHTML=
      `Machine/Balset gewijzigd van <strong>M${currentMachine}/B${currentBal}</strong> naar <strong>M${machine}/B${bal}</strong>.<br>
      De generator is automatisch omgeschakeld. Pools en scores worden herberekend op basis van de nieuwe combinatie.`;
    currentMachine=machine;
    currentBal=bal;
    updateAll();
  }

  // Voeg toe aan dataset
  const newDraw={date:dateStr,nums:numInputs.sort((a,b)=>a-b),stars:starInputs.sort((a,b)=>a-b),machine,bal};
  ALL_DRAWS.unshift(newDraw);

  // Verwerk gespeelde tickets voor rendement
  const tickets=playedTickets.length>0?playedTickets:[];
  let bestPrize=0, bestHits={nums:0,stars:0};
  tickets.forEach(t=>{
    const numH=t.nums.filter(n=>numInputs.includes(n)).length;
    const starH=t.stars.filter(s=>starInputs.includes(s)).length;
    const prize=getPrize(numH,starH);
    if(prize>bestPrize||(prize===0&&numH>bestHits.nums)){
      bestPrize=prize;bestHits={nums:numH,stars:starH};
    }
  });

  rendementHistory.unshift({
    date:dateStr,
    drawNums:numInputs,
    drawStars:starInputs,
    tickets,
    inzet:tickets.length*2.5,
    prize:bestPrize,
    hits:bestHits,
    machine,bal
  });

  document.getElementById('saveMsg').textContent=`✓ Trekking ${dateStr} opgeslagen! Dataset nu ${ALL_DRAWS.length} trekkingen.`;
  document.getElementById('saveMsg').style.color='#3B6D11';
  document.getElementById('lastDraw').textContent=`${dateStr} — ${numInputs.join(' ')} + ${starInputs.join(' ')}`;

  updateAll();
  renderRendement();

  // Reset
  setTimeout(()=>document.getElementById('saveMsg').textContent='',3000);
}


// =====================
// RENDEMENT
// =====================
function renderRendement(){
  const totalInzet=rendementHistory.reduce((s,r)=>s+r.inzet,0);
  const totalPrize=rendementHistory.reduce((s,r)=>s+(r.prize==='JACKPOT'?0:r.prize||0),0);
  const rend=totalInzet>0?(totalPrize/totalInzet*100).toFixed(1):'—';

  document.getElementById('r-inzet').textContent='€'+totalInzet.toFixed(2).replace('.',',');
  document.getElementById('r-opbrengst').textContent='€'+totalPrize.toFixed(2).replace('.',',');
  document.getElementById('r-rendement').textContent=rend+'%';
  document.getElementById('r-rendement').className='rcard-val '+(parseFloat(rend)>=100?'rcard-green':'rcard-red');

  if(rendementHistory.length===0){
    document.getElementById('historyBody').innerHTML='<tr><td colspan="5" style="text-align:center;color:#bbb;padding:20px;">Nog geen resultaten ingevoerd</td></tr>';
    return;
  }

  document.getElementById('historyBody').innerHTML=rendementHistory.map(r=>{
    const ticketBalls=r.tickets.length>0
      ?r.tickets.map(t=>
        t.nums.map(n=>`<span class="mini-ball ${r.drawNums.includes(n)?'mb-hit':'mb-miss'}">${n}</span>`).join('')+
        t.stars.map(s=>`<span class="mini-ball ${r.drawStars.includes(s)?'mb-star-hit':'mb-star'}">${s}</span>`).join('')
      ).join('<br>')
      :'—';
    const drawBalls=r.drawNums.map(n=>`<span class="mini-ball mb-hit">${n}</span>`).join('')+
      r.drawStars.map(s=>`<span class="mini-ball mb-star">${s}</span>`).join('');
    const prizeVal=r.prize>0?`<span style="color:#3B6D11;font-weight:500;">€${r.prize}</span>`:
      r.prize==='JACKPOT'?'<span style="color:#3B6D11;font-weight:500;">JACKPOT!</span>':
      '<span style="color:#bbb;">—</span>';
    const hitBadge=r.hits.nums>=3?'pb-win':'pb-lose';
    return`<tr>
      <td style="white-space:nowrap;font-size:11px;">${r.date}<br><span style="color:#bbb;font-size:10px;">M${r.machine}/B${r.bal}</span></td>
      <td>${drawBalls}</td>
      <td style="font-size:10px;">${ticketBalls}</td>
      <td><span class="prize-badge ${hitBadge}">${r.hits.nums}+${r.hits.stars}★</span></td>
      <td>${prizeVal}</td>
    </tr>`;
  }).join('');
}


// =====================
// FREQ + SCORES
// =====================
function renderFreq(){
  const field=document.getElementById('freqField').value,sort=document.getElementById('freqSort').value;
  const{freq,maxN,total}=getFreqData(field);
  const maxCount=Math.max(...Array.from({length:maxN},(_,i)=>freq[i+1])||[1]);
  const avgLine=field==='stars'?(total*2)/12:(total*5)/50;
  let nums=Array.from({length:maxN},(_,i)=>i+1);
  if(sort==='desc') nums.sort((a,b)=>freq[b]-freq[a]||a-b);
  else if(sort==='asc') nums.sort((a,b)=>freq[a]-freq[b]||a-b);
  const linePos=maxCount>0?(avgLine/maxCount*100).toFixed(1):0;
  const avg=(total*5)/50;
  const lo=Math.round(avg*0.67),hi=Math.round(avg*1.33);
  document.getElementById('freqLegend').innerHTML=field==='nums'
    ?`<span><span class="freq-dot" style="background:#378ADD;"></span>Hot (&gt;${hi}×)</span>
      <span><span class="freq-dot" style="background:#d4a840;"></span>Average (${lo}–${hi}×)</span>
      <span><span class="freq-dot" style="background:#e05555;"></span>Cold (&lt;${lo}×)</span>`
    :`<span><span class="freq-dot" style="background:#e8922a;"></span>Lucky Stars</span>`;
  document.getElementById('freqChart').innerHTML=nums.map(n=>{
    const c=freq[n],pct=maxCount>0?(c/maxCount*100).toFixed(1):0;
    const color=field==='stars'?'#e8922a':c>hi?'#378ADD':c>=lo?'#d4a840':'#e05555';
    return`<div class="bar-row"><div class="bar-num">${n}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div><div class="bar-avg-line" style="left:${linePos}%;"></div></div><div class="bar-count">${c}</div></div>`;
  }).join('');
}

let cst='hot';
function showScoreTab(t){
  cst=t;
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderScoreTable();
}
function renderScoreTable(){
  const isStar=cst==='star', isCold=cst==='cold', isHot=cst==='hot';
  const field=isStar?'stars':'nums';
  const tier=isStar?'star':isHot?'hot':isCold?'cold':'avg';
  const pool=buildPool(field,tier).sort((a,b)=>b.score-a.score);
  const draws=ALL_DRAWS.filter(d=>d.machine===currentMachine&&d.bal===currentBal);
  const maxScore=pool[0]?.score||1,total=pool.length;
  const bc=isStar?'sball-star':isHot?'sball-hot':isCold?'sball-cold':'sball-avg';
  function qp(i){if(i<Math.ceil(total*.25))return`<span class="q-high">Hoog</span>`;if(i<Math.ceil(total*.5))return`<span class="q-mid">Mid</span>`;if(i<Math.ceil(total*.75))return`<span class="q-low">Laag</span>`;return`<span class="q-rest">Rest</span>`;}
  function ac(s){return s>=1.5?'overdue':s>=0.8?'normal':'fresh';}
  document.getElementById('scoreTable').innerHTML=pool.length===0
    ?`<div style="color:#bbb;font-size:12px;padding:1rem 0;">Geen nummers in deze pool.</div>`
    :`<table><thead><tr><th>Rank</th><th>Nr</th><th>Freq</th><th>Interval</th><th>Afwezig</th><th>Score</th><th>Quote</th></tr></thead>
    <tbody>${pool.map((r,i)=>{const bw=Math.round(r.score/maxScore*80);const iv=(draws.length/r.freq).toFixed(1);const ab=draws.findIndex(d=>(isStar?d.stars:d.nums).includes(r.num));const al=ab===0?'laatste':ab+' geleden';
    return`<tr><td style="color:#bbb;font-size:11px;">${i+1}</td><td><div class="sball ${bc}">${r.num}</div></td><td>${r.freq}×</td><td>${iv}</td><td class="${ac(r.score)}">${al}</td><td><div class="score-bar-wrap"><div class="score-bar" style="width:${bw}px;"></div><span style="font-size:11px;" class="${ac(r.score)}">${r.score.toFixed(2)}</span></div></td><td>${qp(i)}</td></tr>`}).join('')}</tbody></table>`;
}

let currentAnalyseTab = 'hot';

function showAnalyseTab(t) {
  currentAnalyseTab = t;
  ['hot','avg','cold','star'].forEach(tab => {
    const btn = document.getElementById('atab-' + tab);
    if (btn) btn.classList.toggle('active', tab === t);
  });
  // Map analyse tab naar freq field en filter
  if (t === 'star') {
    document.getElementById('freqSort').value = 'num';
    renderFreqFiltered('stars', null);
  } else {
    document.getElementById('freqSort').value = 'num';
    renderFreqFiltered('nums', t);
  }
}

function renderFreqFiltered(field, tier) {
  const sort = document.getElementById('freqSort').value;
  const {freq, maxN, total} = getFreqData(field);
  const avg = field === 'stars' ? (total*2)/12 : (total*5)/50;
  const lo = Math.round(avg * 0.67);
  const hi = Math.round(avg * 1.33);

  // Filter op tier
  let nums = Array.from({length: maxN}, (_, i) => i+1);
  if (tier === 'hot') nums = nums.filter(n => freq[n] > hi);
  else if (tier === 'avg') nums = nums.filter(n => freq[n] >= lo && freq[n] <= hi);
  else if (tier === 'cold') nums = nums.filter(n => freq[n] < lo);

  if (sort === 'desc') nums.sort((a,b) => freq[b]-freq[a] || a-b);
  else if (sort === 'asc') nums.sort((a,b) => freq[a]-freq[b] || a-b);

  const maxCount = nums.length > 0 ? Math.max(...nums.map(n => freq[n])) : 1;
  const linePos = maxCount > 0 ? (avg/maxCount*100).toFixed(1) : 0;

  const colorMap = { hot: '#378ADD', avg: '#d4a840', cold: '#e05555' };
  const color = field === 'stars' ? '#e8922a' : (colorMap[tier] || '#378ADD');

  const legend = field === 'stars'
    ? `<span><span class="freq-dot" style="background:#e8922a;"></span>Lucky Stars (1-12)</span>`
    : tier === 'hot' ? `<span><span class="freq-dot" style="background:#378ADD;"></span>Hot nummers (&gt;${hi}×)</span>`
    : tier === 'avg' ? `<span><span class="freq-dot" style="background:#d4a840;"></span>Average nummers (${lo}–${hi}×)</span>`
    : `<span><span class="freq-dot" style="background:#e05555;"></span>Cold nummers (&lt;${lo}×)</span>`;

  document.getElementById('freqLegend').innerHTML = legend +
    `<span style="margin-left:12px;color:#bbb;font-size:11px;">${nums.length} nummers · ${total} trekkingen M${currentMachine}/B${currentBal}</span>`;

  if (nums.length === 0) {
    document.getElementById('freqChart').innerHTML = '<div style="color:#bbb;padding:1rem;font-size:12px;">Geen nummers in deze categorie.</div>';
    return;
  }

  document.getElementById('freqChart').innerHTML = nums.map(n => {
    const c = freq[n];
    const pct = maxCount > 0 ? (c/maxCount*100).toFixed(1) : 0;
    return `<div class="bar-row">
      <div class="bar-num">${n}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${color};"></div>
        <div class="bar-avg-line" style="left:${linePos}%;"></div>
      </div>
      <div class="bar-count">${c}×</div>
    </div>`;
  }).join('');
}

function showTab(t) {
  ['rand','result','freq','score'].forEach(p => {
    const pane = document.getElementById('pane-' + p);
    const tab = document.getElementById('tab-' + p);
    if (pane) pane.classList.toggle('active', p === t);
    if (tab) tab.classList.toggle('active', p === t);
  });
  if (t === 'freq') showAnalyseTab(currentAnalyseTab);
  if (t === 'score') renderScoreTable();
}



// Update lastDraw dynamisch vanuit dataset
(function updateLastDrawDisplay() {
  const last = ALL_DRAWS[0];
  if (last) {
    const el = document.getElementById('lastDraw');
    if (el) el.textContent = `${last.date} — ${last.nums.join(' ')} + ${last.stars.join(' ')}`;
  }
})();

// =====================
// INITIALISATIE bij opstarten
// =====================
document.addEventListener('DOMContentLoaded', function() {
  updateAll();
  renderMatrix();
  updateSom();
  updateConsec();
  setOverlap(1);
  selectTickets(3);
  document.getElementById('nextDraw').textContent = nextDrawDate();
  if (typeof updateProfileDisplay === 'function') updateProfileDisplay();
  // Init analyse tab
  showAnalyseTab('hot');
});
