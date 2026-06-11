// js/config.js
// PickMyNumbers — EuroMillions Number Optimizer

// =====================
// SUPABASE INITIALISATIE — moet als eerste!
// =====================
const SUPABASE_URL = 'https://bcdzusstvnsikkhdmjqn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_12OtIWelNKVROgLr6WULUQ_8PcTVPuN';
const RESEND_KEY   = 're_i81eQ4t7_8mrprcfWwaNWCn1hnQH6BqiU';
const EDGE_EMAIL_URL = 'https://bcdzusstvnsikkhdmjqn.supabase.co/functions/v1/smooth-responder';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// =====================
// SETTINGS
// =====================
const TOTAL_FN = () => ALL_DRAWS.length;
const AVG_FN   = () => (TOTAL_FN()*5)/50;
let threshLow  = () => Math.round(AVG_FN()*0.67);
let threshHigh_v = 4;
let threshLow_v  = 2;
let numTickets = 3;
let maxOverlap = 1;

// Actieve machine/bal — wordt dynamisch ingesteld door admin.js na laden dataset
let currentMachine = 0;
let currentBal = 0;

// 2D MATRIX
const MATRIX_DATA = {
  '3_3':{count:14,pct:13.5},'2_3':{count:10,pct:9.6},
  '3_2':{count:9,pct:8.7},'3_1':{count:9,pct:8.7},
  '2_1':{count:8,pct:7.7},'4_3':{count:8,pct:7.7},
  '2_2':{count:7,pct:6.7},'4_1':{count:6,pct:5.8},
  '1_2':{count:6,pct:5.8},'4_2':{count:5,pct:4.8},
  '2_4':{count:5,pct:4.8},'3_4':{count:3,pct:2.9},
  '4_4':{count:2,pct:1.9},'4_0':{count:2,pct:1.9},
  '1_1':{count:2,pct:1.9},'0_2':{count:2,pct:1.9},
};
let selectedMatrix = new Set(['3_3','2_3','3_2','3_1','2_1','4_3','2_2','4_1','1_2']);


// =====================
// PRIJSTABEL
// =====================
function getPrize(numHits, starHits) {
  if (numHits===5 && starHits===2) return { label:'🏆 JACKPOT!', color:'#B8860B', amount:'Jackpot' };
  if (numHits===5 && starHits===1) return { label:'🥇 2e prijs', color:'#B8860B', amount:500000 };
  if (numHits===5 && starHits===0) return { label:'🥈 3e prijs', color:'#B8860B', amount:50000 };
  if (numHits===4 && starHits===2) return { label:'🥉 4e prijs', color:'#2E7D32', amount:3500 };
  if (numHits===4 && starHits===1) return { label:'✅ 5e prijs', color:'#2E7D32', amount:150 };
  if (numHits===3 && starHits===2) return { label:'✅ 6e prijs', color:'#2E7D32', amount:60 };
  if (numHits===4 && starHits===0) return { label:'✅ 7e prijs', color:'#2E7D32', amount:60 };
  if (numHits===2 && starHits===2) return { label:'✅ 8e prijs', color:'#2E7D32', amount:12 };
  if (numHits===3 && starHits===1) return { label:'✅ 9e prijs', color:'#2E7D32', amount:15 };
  if (numHits===3 && starHits===0) return { label:'✅ 10e prijs', color:'#2E7D32', amount:12 };
  if (numHits===1 && starHits===2) return { label:'✅ 11e prijs', color:'#2E7D32', amount:8 };
  if (numHits===2 && starHits===1) return { label:'✅ 12e prijs', color:'#2E7D32', amount:8 };
  if (numHits===2 && starHits===0) return { label:'✅ 13e prijs', color:'#2E7D32', amount:4 };
  return { label:'Geen prijs', color:'#aaa', amount:0 };
}


