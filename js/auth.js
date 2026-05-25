// js/auth.js
// PickMyNumbers — EuroMillions Number Optimizer

// =====================
// SUPABASE AUTH
// =====================
async function initAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentSession = session;
    await loadUserProfile(session.user);
  }
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentSession = session;
      await loadUserProfile(session.user);
      document.getElementById('loginOverlay').classList.remove('open');
    } else if (event === 'SIGNED_OUT') {
      currentSession = null;
      currentUser = null;
      localStorage.removeItem(USER_KEY);
      updateUserBar(null);
    }
  });
}

async function loadUserProfile(authUser) {
  try {
    const { data } = await supabaseClient
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    const pendingName = localStorage.getItem('em_pending_name');
    const pendingProf = localStorage.getItem('em_pending_profile') || 'standard';

    if (data) {
      currentUser = {
        id: data.id, auth_id: authUser.id,
        name: data.name || pendingName || 'Gebruiker',
        email: authUser.email,
        profile: data.profile || pendingProf,
        ticket_count: data.ticket_count || 3,
        nums_per_ticket: data.nums_per_ticket || 5,
        stars_per_ticket: data.stars_per_ticket || 2,
        blocked: data.blocked || false
      };
    } else {
      // Nieuwe gebruiker aanmaken
      const p = PROFILES[pendingProf] || PROFILES.standard;
      const { data: newUser } = await supabaseClient.from('users').insert({
        auth_id: authUser.id,
        name: pendingName || 'Gebruiker',
        email: authUser.email,
        profile: pendingProf,
        ticket_count: p.tickets,
        nums_per_ticket: p.nums,
        stars_per_ticket: p.stars
      }).select().single();
      currentUser = { ...newUser, email: authUser.email };
    }

    selectedProfile = currentUser.profile || 'standard';
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    localStorage.removeItem('em_pending_name');
    localStorage.removeItem('em_pending_profile');
    applyProfileToGenerator(selectedProfile);
    updateUserBar(currentUser);
  } catch(e) {
    console.warn('Profiel laden:', e);
    updateUserBar({ email: authUser.email });
  }
}

function updateUserBar(user) {
  const bar = document.getElementById('userBar');
  const authBtns = document.getElementById('authButtons');
  const genBtn = document.getElementById('genBtn');
  const loginPrompt = document.getElementById('loginPrompt');

  if (user && user.email) {
    bar.style.display = 'flex';
    document.getElementById('userBarName').textContent = user.name || 'Welkom!';
    document.getElementById('userBarEmail').textContent = user.email;
    if (authBtns) authBtns.style.display = 'none';
    // Toon genereer knop
    if (genBtn) genBtn.style.display = '';
    if (loginPrompt) loginPrompt.style.display = 'none';
  } else {
    bar.style.display = 'none';
    if (authBtns) authBtns.style.display = '';
    // Verberg genereer knop — toon login prompt
    if (genBtn) genBtn.style.display = 'none';
    if (loginPrompt) loginPrompt.style.display = 'block';
  }
}

async function logoutUser() {
  if (!confirm('Uitloggen?')) return;
  await supabaseClient.auth.signOut();
}


// =====================
// SIGNUP / SIGNIN FLOWS
// =====================
function showStep(stepId) {
  ['loginStepSignup','loginStepSignin','loginStepSent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === stepId);
  });
}

function openSignup() {
  document.getElementById('loginHeaderSub').textContent = 'Gratis account aanmaken';
  showStep('loginStepSignup');
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('loginOverlay').classList.add('open');
}

function openSignin() {
  document.getElementById('loginHeaderSub').textContent = 'Inloggen';
  showStep('loginStepSignin');
  document.getElementById('signinMsg').textContent = '';
  document.getElementById('loginOverlay').classList.add('open');
}

// Aliassen voor knoppen in modal
function showSignup() { openSignup(); }
function showSignin() { openSignin(); }
function openLogin() { openSignup(); } // fallback

function backToLogin() {
  showStep('loginStepSignup');
  document.getElementById('loginMsg').textContent = '';
}

async function sendMagicLink(mode) {
  const isSignup = mode === 'signup';
  const email = isSignup
    ? document.getElementById('loginEmail').value.trim()
    : document.getElementById('signinEmail').value.trim();
  const name = isSignup ? document.getElementById('loginName').value.trim() : '';
  const msgEl = document.getElementById(isSignup ? 'loginMsg' : 'signinMsg');
  const btnEl = document.getElementById(isSignup ? 'magicLinkBtn' : 'signinBtn');

  if (isSignup && !name) { msgEl.textContent = '⚠ Vul je naam in'; msgEl.style.color='#A32D2D'; return; }
  if (!email || !/\S+@\S+\.\S+/.test(email)) { msgEl.textContent = '⚠ Vul een geldig emailadres in'; msgEl.style.color='#A32D2D'; return; }

  btnEl.disabled = true;
  btnEl.textContent = 'Bezig…';
  msgEl.textContent = '';

  try {
    if (isSignup) {
      localStorage.setItem('em_pending_name', name);
      localStorage.setItem('em_pending_profile', loginSelectedProfile);
    }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'https://pickmynumbers.eu',
        data: isSignup ? { name, profile: loginSelectedProfile } : {}
      }
    });

    if (error) throw error;

    document.getElementById('loginSentMsg').innerHTML =
      `We hebben een magic link gestuurd naar <strong>${email}</strong>.<br>
       Klik op de link in de email om direct in te ${isSignup ? 'registreren en in' : ''}loggen.`;
    showStep('loginStepSent');

  } catch(e) {
    msgEl.textContent = '⚠ ' + (e.message || 'Fout — probeer opnieuw');
    msgEl.style.color = '#A32D2D';
  }
  btnEl.disabled = false;
  btnEl.textContent = isSignup ? '✉ Maak account aan' : '✉ Stuur magic link';
}

function selectLoginProfile(profile) {
  loginSelectedProfile = profile;
  Object.keys(PROFILES).forEach(p => {
    const card = document.getElementById('lpc-' + p);
    const check = document.getElementById('lpck-' + p);
    if (card) card.classList.toggle('active', p === profile);
    if (check) check.textContent = p === profile ? '✓' : '';
  });
  const customOpts = document.getElementById('loginCustomOptions');
  if (customOpts) customOpts.style.display = profile === 'custom' ? 'block' : 'none';
}


// =====================
// SUPABASE REST HELPERS
// =====================
function selectProfileMain(profile) {
  selectedProfile = profile;

  // Update buttons
  document.querySelectorAll('.profile-main-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('pmb-' + profile);
  if (btn) btn.classList.add('active');

  // Toon/verberg eigen keuze opties
  const customOpts = document.getElementById('mainCustomOptions');
  if (customOpts) customOpts.style.display = profile === 'custom' ? 'block' : 'none';

  // Sla op in localStorage
  localStorage.setItem('em_user_profile_type', profile);

  // Pas tickets aan
  const p = getActiveProfile();
  selectTickets(p.tickets);

  // Herbereken sterren strategie + UI update
  updateAll();
}

function getActiveProfile() {
  if (selectedProfile === 'custom') {
    return {
      label: 'Eigen keuze',
      tickets: parseInt(document.getElementById('mainCustomTickets')?.value) || 3,
      nums: parseInt(document.getElementById('mainCustomNums')?.value) || 5,
      stars: parseInt(document.getElementById('mainCustomStars')?.value) || 2,
    };
  }
  return PROFILES[selectedProfile] || PROFILES.standard;
}

function applyProfileToGenerator(profile) {
  if (profile) selectedProfile = profile;
  const p = getActiveProfile();
  selectTickets(p.tickets);
  updateAll();
}

function selectProfile(profile) {
  selectProfileMain(profile);
}

function applyCustomProfile() {
  selectTickets(getActiveProfile().tickets);
  updateAll();
}


// =====================
// SUPABASE HELPERS
// =====================
async function sbFetch(path, method='GET', body=null) {
  // Gebruik actieve sessie token indien beschikbaar
  let token = SUPABASE_KEY;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.access_token) token = session.access_token;
  } catch(e) {}

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': method==='POST' ? 'return=representation' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Database fout (${r.status}): ${errText}`);
    }
    return r.status === 204 ? null : r.json();
  } catch(e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('Geen verbinding met database. Controleer je internetverbinding.');
    }
    throw e;
  }
}

async function getOrCreateUser(name, email, profile) {
  const p = profile || PROFILES.standard;

  // Altijd zoeken op email — meest betrouwbaar
  const { data: existing } = await supabaseClient
    .from('users').select('*').eq('email', email).maybeSingle();

  if (existing) {
    // Update profiel voorkeur
    await supabaseClient.from('users').update({
      name,
      ticket_count: p.tickets,
      nums_per_ticket: p.nums,
      stars_per_ticket: p.stars,
      profile: selectedProfile
    }).eq('id', existing.id);
    return existing;
  }

  // Nieuwe gebruiker aanmaken
  const { data: { session } } = await supabaseClient.auth.getSession();
  const authId = session?.user?.id || null;

  const { data: newUser, error } = await supabaseClient.from('users').insert({
    name, email,
    auth_id: authId,
    profile: selectedProfile,
    ticket_count: p.tickets,
    nums_per_ticket: p.nums,
    stars_per_ticket: p.stars
  }).select().single();

  if (error) throw new Error('Gebruiker aanmaken mislukt: ' + error.message);
  return newUser;
}

async function saveTicketsToDb(userId, tickets, drawDate, drawNumber, machine, bal) {
  const rows = tickets.map((t, i) => ({
    user_id: userId,
    draw_date: drawDate,
    draw_number: drawNumber || 0,
    ticket_number: i + 1,
    nums: t.nums,
    stars: t.stars,
    machine,
    bal
  }));
  const { error } = await supabaseClient.from('tickets').insert(rows);
  if (error) throw new Error('Tickets opslaan mislukt: ' + error.message);
}


// =====================
// PROFIEL MODAL
// =====================
function openSaveProfile() {
  const grid = document.getElementById('ticketsGrid');
  const cards = grid ? grid.querySelectorAll('.ticket-card, .ticket') : [];
  if (cards.length === 0) { alert('Genereer eerst tickets!'); return; }

  pendingTickets = [];
  cards.forEach(card => {
    const numBalls = [...card.querySelectorAll('.ball-num, .ball-hot, .ball-avg')].map(b => parseInt(b.textContent)).filter(n=>!isNaN(n)&&n>=1&&n<=50);
    const starBalls = [...card.querySelectorAll('.ball-star')].map(b => parseInt(b.textContent)).filter(n=>!isNaN(n)&&n>=1&&n<=12);
    if (numBalls.length >= 5 && starBalls.length >= 2) {
      pendingTickets.push({ nums: numBalls, stars: starBalls });
    }
  });

  if (pendingTickets.length === 0) { alert('Kon tickets niet lezen — genereer opnieuw.'); return; }

  // Haal actief profiel op van hoofdpagina
  const profile = getActiveProfile();
  const profileLabels = {standard:'Standaard',system:'Systeem',extended:'Uitgebreid',custom:'Eigen keuze'};
  const lbl = profileLabels[selectedProfile] || 'Standaard';
  document.getElementById('profileSummaryLabel').textContent = lbl + ' profiel';
  document.getElementById('profileSummaryDetail').textContent =
    `${pendingTickets.length} tickets · ${profile.nums} nummers + ${profile.stars} sterren`;

  if (currentUser) {
    document.getElementById('profileName').value = currentUser.name || '';
    document.getElementById('profileEmail').value = currentUser.email || '';
  }

  document.getElementById('profileFormArea').style.display = 'block';
  document.getElementById('profileSuccessArea').style.display = 'none';
  document.getElementById('profileOverlay').classList.add('open');
}

function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('open');
}

function profileOverlayClick(e) {
  if (e.target === document.getElementById('profileOverlay')) closeProfile();
}

async function saveUserTickets() {
  const name = document.getElementById('profileName').value.trim();
  const email = document.getElementById('profileEmail').value.trim();
  const msg = document.getElementById('profileMsg');
  const profile = getActiveProfile();

  if (!name || !email || !/\S+@\S+\.\S+/.test(email)) {
    msg.textContent = '⚠ Vul een geldige naam en email in';
    msg.style.color = '#A32D2D'; return;
  }

  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true; btn.textContent = 'Bezig…'; msg.textContent = '';

  try {
    const nextDraw = document.getElementById('nextDraw').textContent || 'volgende trekking';
    const lastDrawText = document.getElementById('lastDraw').textContent || '';
    const drawMatch = lastDrawText.match(/(\d{4})/);
    const drawNumber = drawMatch ? parseInt(drawMatch[1]) : 0;

    // Maak/haal gebruiker op — sla profiel voorkeur op
    const user = await getOrCreateUser(name, email, profile);

    currentUser = {
      id: user.id, name, email,
      profile: selectedProfile,
      ticket_count: profile.tickets,
      nums_per_ticket: profile.nums,
      stars_per_ticket: profile.stars
    };
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));

    // Gebruik de volgende trekkingsdatum als draw_date
    const nextDrawDateStr = getNextDrawDateISO();
    await saveTicketsToDb(user.id, pendingTickets, nextDrawDateStr, drawNumber, currentMachine, currentBal);
    await sendConfirmationEmail(name, email, pendingTickets, nextDraw, profile);

    document.getElementById('profileFormArea').style.display = 'none';
    document.getElementById('profileSuccessArea').style.display = 'block';
    document.getElementById('profileSuccessMsg').innerHTML =
      `Hallo <strong>${name}</strong>! (${profile.label} profiel)<br><br>` +
      `Je <strong>${pendingTickets.length} ticket${pendingTickets.length>1?'s':''}</strong> zijn opgeslagen.<br><br>` +
      `Na de trekking ontvang je een persoonlijke analyse op <strong>${email}</strong>.`;

  } catch(e) {
    msg.textContent = '⚠ Fout: ' + e.message;
    msg.style.color = '#A32D2D';
    btn.disabled = false; btn.textContent = '✓ Opslaan & analyse activeren';
  }
}


// =====================
// TOON OPSLAAN KNOP NA GENEREREN
// =====================
// Wrap de bestaande generateAll functie
const _origGenerateAll = window.generateAll;
window.generateAll = function() {
  if (_origGenerateAll) _origGenerateAll();
  setTimeout(() => {
    const grid = document.getElementById('ticketsGrid');
    if (grid && grid.children.length > 0) {
      document.getElementById('saveTicketsArea').style.display = 'block';
    }
  }, 200);
};

// Start authenticatie zodra pagina geladen is
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
// Fallback als DOMContentLoaded al voorbij is
if (document.readyState !== 'loading') initAuth();


const DISC_KEY = 'em_disclaimer_v1';

// ---- TRANSLATIONS ----
const DISC_TRANSLATIONS = {
  en: {
    'disc-age-title': 'Age Restriction — Adults Only',
    'disc-age-body': 'This tool is intended for persons aged 18 or over. If you are under 18, please leave this page immediately.',
    'disc-countries-title': 'EuroMillions Participating Countries',
    'disc-what-title': 'What This Tool Is',
    'disc-what-body': 'EuroMillions Number Optimizer is a <strong>free statistical analysis and number generation tool</strong>. It uses historical draw data to identify frequency patterns, hot/cold numbers, and statistical distributions. It does <strong>not</strong> sell lottery tickets, accept bets, or handle any monetary transactions. It is an entertainment and informational service only.',
    'disc-nog-title': 'No Guarantee of Winnings',
    'disc-nog-body': '<strong>EuroMillions is a game of pure chance.</strong> No statistical method, algorithm, machine learning model, or prediction system can predict or influence lottery outcomes. Past draw patterns do not guarantee future results. Any numbers generated by this tool have <strong>exactly the same probability of winning</strong> as any other combination.',
    'disc-liab-title': 'Limitation of Liability',
    'disc-liab-body': 'The operators of EuroMillions Number Optimizer accept <strong>no responsibility or liability</strong> for any financial loss, damages, or harm arising from the use of this tool or from participation in EuroMillions or any other lottery. Use of this tool is entirely at your own risk. This tool does not constitute financial, legal, or investment advice.',
    'disc-resp-title': 'Responsible Gambling',
    'disc-resp-body': 'Gambling can be addictive and harmful. <strong>Only spend what you can afford to lose.</strong> If you or someone you know has a gambling problem, seek help:<br><br>🇳🇱 <strong>NL:</strong> <a href="https://www.agog.nl" target="_blank">agog.nl</a> · 0900-2178710<br>🇧🇪 <strong>BE:</strong> <a href="https://www.gamblinginfo.be" target="_blank">gamblinginfo.be</a><br>🇫🇷 <strong>FR:</strong> <a href="https://www.joueurs-info-service.fr" target="_blank">joueurs-info-service.fr</a> · 09 74 75 13 13<br>🇩🇪 <strong>DE:</strong> <a href="https://www.bzga.de" target="_blank">bzga.de</a> · 0800 137 2700<br>🇪🇸 <strong>ES:</strong> <a href="https://www.jugarbien.es" target="_blank">jugarbien.es</a><br>🇵🇹 <strong>PT:</strong> <a href="https://www.sicad.pt" target="_blank">sicad.pt</a><br>🇬🇧 <strong>UK:</strong> <a href="https://www.gamcare.org.uk" target="_blank">gamcare.org.uk</a> · 0808 8020 133<br>🇮🇪 <strong>IE:</strong> <a href="https://www.problemgambling.ie" target="_blank">problemgambling.ie</a><br>🇦🇹 <strong>AT:</strong> <a href="https://www.spielsuchthilfe.at" target="_blank">spielsuchthilfe.at</a><br>🇨🇭 <strong>CH:</strong> <a href="https://www.sos-spielsucht.ch" target="_blank">sos-spielsucht.ch</a>',
    'disc-gdpr-title': 'Privacy & GDPR',
    'disc-gdpr-body': 'This tool stores your settings locally in your browser (localStorage). If you choose to save tickets and receive draw analysis by email, your email address will be stored securely and used solely for that purpose. You may request deletion at any time. We do not sell or share personal data with third parties. Compliant with EU GDPR.',
    'disc-param-title': 'Custom Parameters',
    'disc-param-body': 'This tool allows you to adjust statistical parameters. Our default settings are based on historical data analysis. <strong>Any modification is your own choice and responsibility.</strong> We are not liable for outcomes resulting from custom configurations.',
    'disc-check1': 'I confirm that I am <strong>18 years of age or older</strong> and legally permitted to participate in lotteries in my country of residence.',
    'disc-check2': 'I understand that <strong>EuroMillions is a game of chance</strong> and that no tool or system can guarantee or predict winning numbers. I use this tool for entertainment purposes only.',
    'disc-check3': 'I acknowledge that the operators of this tool accept <strong>no liability</strong> for any financial loss or harm resulting from use of this service, and I accept the full Terms & Disclaimer stated above.',
    'disc-legal-note': 'By proceeding you confirm you have read and accepted the full disclaimer. Last updated: May 2026.<br>This service is an informational tool and is not a licensed gambling operator.',
    'discAcceptLabel': '✓ Accept all & Enter',
    'discAcceptLabelDisabled': '☐ Please check all boxes above',
  },
  nl: {
    'disc-age-title': 'Leeftijdsbeperking — Alleen voor volwassenen',
    'disc-age-body': 'Dit hulpmiddel is uitsluitend bestemd voor personen van 18 jaar en ouder. Bent u jonger dan 18? Verlaat deze pagina onmiddellijk.',
    'disc-countries-title': 'EuroMillions deelnemende landen',
    'disc-what-title': 'Wat dit hulpmiddel is',
    'disc-what-body': 'EuroMillions Number Optimizer is een <strong>gratis statistisch analyse- en nummergeneratietool</strong>. Het gebruikt historische trekkingsdata om frequentiepatronen, hete/koude nummers en statistische verdelingen te identificeren. Het <strong>verkoopt geen</strong> loten, accepteert geen weddenschappen en verwerkt geen geldtransacties. Het is uitsluitend een vermaaks- en informatiedienst.',
    'disc-nog-title': 'Geen garantie op winst',
    'disc-nog-body': '<strong>EuroMillions is een kansspel.</strong> Geen enkele statistische methode, algoritme of voorspellingsmodel kan loterijuitslagen voorspellen of beïnvloeden. Historische patronen garanderen geen toekomstige resultaten. Gegenereerde nummers hebben <strong>precies dezelfde winkans</strong> als elke andere combinatie.',
    'disc-liab-title': 'Beperking van aansprakelijkheid',
    'disc-liab-body': 'De exploitanten van EuroMillions Number Optimizer aanvaarden <strong>geen enkele verantwoordelijkheid of aansprakelijkheid</strong> voor financieel verlies, schade of nadeel voortvloeiend uit het gebruik van dit hulpmiddel of deelname aan EuroMillions of enige andere loterij. Gebruik is volledig op eigen risico. Dit is geen financieel, juridisch of beleggingsadvies.',
    'disc-resp-title': 'Verantwoord gokken',
    'disc-resp-body': 'Gokken kan verslavend en schadelijk zijn. <strong>Speel alleen met geld dat u kunt missen.</strong> Heeft u of iemand die u kent een gokprobleem? Zoek hulp:<br><br>🇳🇱 <strong>NL:</strong> <a href="https://www.agog.nl" target="_blank">agog.nl</a> · 0900-2178710<br>🇧🇪 <strong>BE:</strong> <a href="https://www.gamblinginfo.be" target="_blank">gamblinginfo.be</a><br>🇫🇷 <strong>FR:</strong> <a href="https://www.joueurs-info-service.fr" target="_blank">joueurs-info-service.fr</a><br>🇩🇪 <strong>DE:</strong> <a href="https://www.bzga.de" target="_blank">bzga.de</a><br>🇪🇸 <strong>ES:</strong> <a href="https://www.jugarbien.es" target="_blank">jugarbien.es</a><br>🇬🇧 <strong>UK:</strong> <a href="https://www.gamcare.org.uk" target="_blank">gamcare.org.uk</a>',
    'disc-gdpr-title': 'Privacy & AVG',
    'disc-gdpr-body': 'Dit hulpmiddel slaat uw instellingen lokaal op in uw browser (localStorage). Als u kiest voor ticketopslag en e-mailanalyse, wordt uw e-mailadres veilig bewaard en uitsluitend daarvoor gebruikt. U kunt op elk moment verwijdering aanvragen. Wij verkopen of delen geen persoonsgegevens. AVG-conform.',
    'disc-param-title': 'Aangepaste parameters',
    'disc-param-body': 'U kunt statistische parameters aanpassen. Onze standaardinstellingen zijn gebaseerd op historische data-analyse. <strong>Elke wijziging is uw eigen keuze en verantwoordelijkheid.</strong> Wij zijn niet aansprakelijk voor uitkomsten op basis van aangepaste instellingen.',
    'disc-check1': 'Ik bevestig dat ik <strong>18 jaar of ouder</strong> ben en in mijn land wettelijk bevoegd ben deel te nemen aan loterijen.',
    'disc-check2': 'Ik begrijp dat <strong>EuroMillions een kansspel is</strong> en dat geen enkel hulpmiddel of systeem winnende nummers kan garanderen of voorspellen. Ik gebruik dit hulpmiddel uitsluitend voor entertainment.',
    'disc-check3': 'Ik erken dat de exploitanten van dit hulpmiddel <strong>geen aansprakelijkheid</strong> aanvaarden voor financieel verlies of schade door gebruik van deze dienst, en ik accepteer de volledige disclaimer hierboven.',
    'disc-legal-note': 'Door verder te gaan bevestigt u de volledige disclaimer te hebben gelezen en geaccepteerd. Laatste update: mei 2026.<br>Deze dienst is een informatietool en geen vergunde kansspeloperator.',
    'discAcceptLabel': '✓ Alles accepteren & Starten',
    'discAcceptLabelDisabled': '☐ Vink alle vakjes hierboven aan',
  },
  fr: {
    'disc-age-title': 'Restriction d\'âge — Adultes uniquement',
    'disc-age-body': 'Cet outil est destiné aux personnes âgées de 18 ans et plus. Si vous avez moins de 18 ans, quittez immédiatement cette page.',
    'disc-countries-title': 'Pays participants EuroMillions',
    'disc-what-title': 'Qu\'est-ce que cet outil',
    'disc-what-body': 'EuroMillions Number Optimizer est un <strong>outil gratuit d\'analyse statistique et de génération de numéros</strong>. Il utilise les données historiques des tirages pour identifier des modèles de fréquence. Il ne <strong>vend pas</strong> de billets de loterie, n\'accepte pas de paris et ne traite aucune transaction monétaire. C\'est un service de divertissement et d\'information uniquement.',
    'disc-nog-title': 'Aucune garantie de gains',
    'disc-nog-body': '<strong>EuroMillions est un jeu de pur hasard.</strong> Aucune méthode statistique ne peut prédire ou influencer les résultats de la loterie. Les modèles de tirages passés ne garantissent pas les résultats futurs. Les numéros générés ont <strong>exactement la même probabilité de gagner</strong> que toute autre combinaison.',
    'disc-liab-title': 'Limitation de responsabilité',
    'disc-liab-body': 'Les opérateurs d\'EuroMillions Number Optimizer n\'acceptent <strong>aucune responsabilité</strong> pour toute perte financière, dommage ou préjudice découlant de l\'utilisation de cet outil. L\'utilisation est entièrement à vos risques et périls. Cet outil ne constitue pas un conseil financier, juridique ou d\'investissement.',
    'disc-resp-title': 'Jeu responsable',
    'disc-resp-body': 'Le jeu peut être addictif et nuisible. <strong>Ne dépensez que ce que vous pouvez vous permettre de perdre.</strong> Besoin d\'aide? 🇫🇷 <a href="https://www.joueurs-info-service.fr" target="_blank">joueurs-info-service.fr</a> · 09 74 75 13 13',
    'disc-gdpr-title': 'Confidentialité & RGPD',
    'disc-gdpr-body': 'Cet outil stocke vos paramètres localement dans votre navigateur. Conforme au RGPD de l\'UE. Nous ne vendons ni ne partageons vos données personnelles.',
    'disc-param-title': 'Paramètres personnalisés',
    'disc-param-body': 'Vous pouvez ajuster les paramètres statistiques. <strong>Toute modification est votre propre choix et responsabilité.</strong> Nous déclinons toute responsabilité pour les résultats découlant de configurations personnalisées.',
    'disc-check1': 'Je confirme avoir <strong>18 ans ou plus</strong> et être légalement autorisé à participer aux loteries dans mon pays de résidence.',
    'disc-check2': 'Je comprends qu\'<strong>EuroMillions est un jeu de hasard</strong> et qu\'aucun outil ne peut garantir ni prédire les numéros gagnants. J\'utilise cet outil à des fins de divertissement uniquement.',
    'disc-check3': 'Je reconnais que les opérateurs n\'acceptent <strong>aucune responsabilité</strong> pour toute perte financière résultant de l\'utilisation de ce service.',
    'disc-legal-note': 'En continuant, vous confirmez avoir lu et accepté la clause de non-responsabilité complète. Dernière mise à jour: mai 2026.',
    'discAcceptLabel': '✓ Tout accepter & Entrer',
    'discAcceptLabelDisabled': '☐ Cochez toutes les cases ci-dessus',
  },
  de: {
    'disc-age-title': 'Altersbeschränkung — Nur für Erwachsene',
    'disc-age-body': 'Dieses Tool ist nur für Personen ab 18 Jahren bestimmt. Wenn Sie unter 18 Jahre alt sind, verlassen Sie diese Seite sofort.',
    'disc-countries-title': 'EuroMillions teilnehmende Länder',
    'disc-what-title': 'Was dieses Tool ist',
    'disc-what-body': 'EuroMillions Number Optimizer ist ein <strong>kostenloses statistisches Analyse- und Nummerntools</strong>. Es verwendet historische Ziehdaten zur Mustererkennung. Es <strong>verkauft keine</strong> Lottoscheine, nimmt keine Wetten an und führt keine Geldtransaktionen durch. Es ist ausschließlich ein Unterhaltungs- und Informationsdienst.',
    'disc-nog-title': 'Keine Gewinngarantie',
    'disc-nog-body': '<strong>EuroMillions ist ein reines Glücksspiel.</strong> Keine statistische Methode kann Lotterieziehergebnisse vorhersagen oder beeinflussen. Historische Muster garantieren keine zukünftigen Ergebnisse. Generierte Zahlen haben <strong>genau die gleiche Gewinnwahrscheinlichkeit</strong> wie jede andere Kombination.',
    'disc-liab-title': 'Haftungsbeschränkung',
    'disc-liab-body': 'Die Betreiber von EuroMillions Number Optimizer übernehmen <strong>keinerlei Verantwortung oder Haftung</strong> für finanzielle Verluste oder Schäden, die aus der Nutzung dieses Tools entstehen. Die Nutzung erfolgt ausschließlich auf eigene Gefahr. Dieses Tool stellt keine Finanz-, Rechts- oder Anlageberatung dar.',
    'disc-resp-title': 'Verantwortungsvolles Spielen',
    'disc-resp-body': 'Glücksspiel kann süchtig machen. <strong>Spielen Sie nur mit Geld, das Sie sich leisten können zu verlieren.</strong> Hilfe: 🇩🇪 <a href="https://www.bzga.de" target="_blank">bzga.de</a> · 0800 137 2700 · 🇦🇹 <a href="https://www.spielsuchthilfe.at" target="_blank">spielsuchthilfe.at</a> · 🇨🇭 <a href="https://www.sos-spielsucht.ch" target="_blank">sos-spielsucht.ch</a>',
    'disc-gdpr-title': 'Datenschutz & DSGVO',
    'disc-gdpr-body': 'Dieses Tool speichert Ihre Einstellungen lokal in Ihrem Browser. DSGVO-konform. Wir verkaufen oder teilen keine personenbezogenen Daten.',
    'disc-param-title': 'Benutzerdefinierte Parameter',
    'disc-param-body': 'Sie können statistische Parameter anpassen. <strong>Jede Änderung liegt in Ihrer eigenen Verantwortung.</strong> Wir haften nicht für Ergebnisse aufgrund benutzerdefinierter Konfigurationen.',
    'disc-check1': 'Ich bestätige, dass ich <strong>18 Jahre oder älter</strong> bin und in meinem Wohnsitzland berechtigt bin, an Lotterien teilzunehmen.',
    'disc-check2': 'Ich verstehe, dass <strong>EuroMillions ein Glücksspiel ist</strong> und kein Tool Gewinnzahlen garantieren oder vorhersagen kann. Ich nutze dieses Tool nur zur Unterhaltung.',
    'disc-check3': 'Ich erkenne an, dass die Betreiber dieses Tools <strong>keinerlei Haftung</strong> für finanzielle Verluste aus der Nutzung dieses Dienstes übernehmen.',
    'disc-legal-note': 'Mit dem Fortfahren bestätigen Sie, den vollständigen Haftungsausschluss gelesen und akzeptiert zu haben. Zuletzt aktualisiert: Mai 2026.',
    'discAcceptLabel': '✓ Alles akzeptieren & Eintreten',
    'discAcceptLabelDisabled': '☐ Bitte alle Kästchen oben ankreuzen',
  },
  es: {
    'disc-age-title': 'Restricción de edad — Solo adultos',
    'disc-age-body': 'Esta herramienta está destinada a personas mayores de 18 años. Si es menor de 18 años, abandone esta página inmediatamente.',
    'disc-countries-title': 'Países participantes en EuroMillones',
    'disc-what-title': 'Qué es esta herramienta',
    'disc-what-body': 'EuroMillions Number Optimizer es una <strong>herramienta gratuita de análisis estadístico y generación de números</strong>. Utiliza datos históricos de sorteos para identificar patrones de frecuencia. <strong>No vende</strong> billetes de lotería, no acepta apuestas ni gestiona transacciones monetarias. Es un servicio de entretenimiento e información únicamente.',
    'disc-nog-title': 'Sin garantía de premios',
    'disc-nog-body': '<strong>EuroMillones es un juego de puro azar.</strong> Ningún método estadístico puede predecir o influir en los resultados de la lotería. Los patrones históricos no garantizan resultados futuros. Los números generados tienen <strong>exactamente la misma probabilidad de ganar</strong> que cualquier otra combinación.',
    'disc-liab-title': 'Limitación de responsabilidad',
    'disc-liab-body': 'Los operadores de EuroMillions Number Optimizer no aceptan <strong>ninguna responsabilidad</strong> por pérdidas financieras, daños o perjuicios derivados del uso de esta herramienta. El uso es enteramente bajo su propia responsabilidad. Esta herramienta no constituye asesoramiento financiero, legal o de inversión.',
    'disc-resp-title': 'Juego responsable',
    'disc-resp-body': 'El juego puede ser adictivo y perjudicial. <strong>Juegue solo con lo que pueda permitirse perder.</strong> Ayuda: 🇪🇸 <a href="https://www.jugarbien.es" target="_blank">jugarbien.es</a> · 🇵🇹 <a href="https://www.sicad.pt" target="_blank">sicad.pt</a>',
    'disc-gdpr-title': 'Privacidad & RGPD',
    'disc-gdpr-body': 'Esta herramienta almacena su configuración localmente en su navegador. Cumple con el RGPD de la UE. No vendemos ni compartimos datos personales con terceros.',
    'disc-param-title': 'Parámetros personalizados',
    'disc-param-body': 'Puede ajustar los parámetros estadísticos. <strong>Cualquier modificación es su propia elección y responsabilidad.</strong> No somos responsables de los resultados derivados de configuraciones personalizadas.',
    'disc-check1': 'Confirmo que tengo <strong>18 años o más</strong> y que estoy legalmente autorizado a participar en loterías en mi país de residencia.',
    'disc-check2': 'Entiendo que <strong>EuroMillones es un juego de azar</strong> y que ninguna herramienta puede garantizar ni predecir números ganadores. Utilizo esta herramienta únicamente con fines de entretenimiento.',
    'disc-check3': 'Reconozco que los operadores de esta herramienta no aceptan <strong>ninguna responsabilidad</strong> por pérdidas financieras derivadas del uso de este servicio.',
    'disc-legal-note': 'Al continuar, confirma haber leído y aceptado el aviso legal completo. Última actualización: mayo 2026.',
    'discAcceptLabel': '✓ Aceptar todo & Entrar',
    'discAcceptLabelDisabled': '☐ Marque todas las casillas anteriores',
  },
  pt: {
    'disc-age-title': 'Restrição de idade — Apenas adultos',
    'disc-age-body': 'Esta ferramenta destina-se a pessoas com 18 anos ou mais. Se tiver menos de 18 anos, saia imediatamente desta página.',
    'disc-countries-title': 'Países participantes no EuroMilhões',
    'disc-what-title': 'O que é esta ferramenta',
    'disc-what-body': 'EuroMillions Number Optimizer é uma <strong>ferramenta gratuita de análise estatística e geração de números</strong>. Utiliza dados históricos de sorteios para identificar padrões de frequência. <strong>Não vende</strong> bilhetes de lotaria, não aceita apostas nem realiza transações monetárias. É um serviço de entretenimento e informação apenas.',
    'disc-nog-title': 'Sem garantia de prémios',
    'disc-nog-body': '<strong>O EuroMilhões é um jogo de puro acaso.</strong> Nenhum método estatístico pode prever ou influenciar os resultados da lotaria. Os padrões históricos não garantem resultados futuros. Os números gerados têm <strong>exatamente a mesma probabilidade de ganhar</strong> que qualquer outra combinação.',
    'disc-liab-title': 'Limitação de responsabilidade',
    'disc-liab-body': 'Os operadores do EuroMillions Number Optimizer não aceitam <strong>nenhuma responsabilidade</strong> por perdas financeiras, danos ou prejuízos decorrentes da utilização desta ferramenta. A utilização é inteiramente por sua conta e risco.',
    'disc-resp-title': 'Jogo responsável',
    'disc-resp-body': 'O jogo pode ser viciante e prejudicial. <strong>Jogue apenas com o que pode perder.</strong> Ajuda: 🇵🇹 <a href="https://www.sicad.pt" target="_blank">sicad.pt</a>',
    'disc-gdpr-title': 'Privacidade & RGPD',
    'disc-gdpr-body': 'Esta ferramenta armazena as suas definições localmente no seu navegador. Conforme com o RGPD da UE. Não vendemos nem partilhamos dados pessoais.',
    'disc-param-title': 'Parâmetros personalizados',
    'disc-param-body': 'Pode ajustar os parâmetros estatísticos. <strong>Qualquer modificação é da sua própria escolha e responsabilidade.</strong>',
    'disc-check1': 'Confirmo que tenho <strong>18 anos ou mais</strong> e que estou legalmente autorizado a participar em lotarias no meu país de residência.',
    'disc-check2': 'Compreendo que o <strong>EuroMilhões é um jogo de acaso</strong> e que nenhuma ferramenta pode garantir ou prever números vencedores. Utilizo esta ferramenta apenas para entretenimento.',
    'disc-check3': 'Reconheço que os operadores desta ferramenta não aceitam <strong>nenhuma responsabilidade</strong> por perdas financeiras resultantes da utilização deste serviço.',
    'disc-legal-note': 'Ao continuar, confirma ter lido e aceite o aviso legal completo. Última atualização: maio de 2026.',
    'discAcceptLabel': '✓ Aceitar tudo & Entrar',
    'discAcceptLabelDisabled': '☐ Marque todas as caixas acima',
  }
};

let currentDiscLang = 'en';
const discChecks = { check1: false, check2: false, check3: false };

// ---- LANGUAGE SWITCH ----
function discLang(lang) {
  currentDiscLang = lang;
  document.querySelectorAll('.disc-lang-tab').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const t = DISC_TRANSLATIONS[lang] || DISC_TRANSLATIONS.en;
  Object.keys(t).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t[id];
  });

  // Update intro tagline per taal
  const taglines = {
    en: {
      title: 'The only tool that optimizes numbers based on actual use of draw machine and ball set.',
      sub: 'While others analyse 20 years of general draws — we filter on the specific machine &amp; ball set in use tonight.'
    },
    nl: {
      title: 'De enige tool die nummers optimaliseert op basis van de daadwerkelijk gebruikte trekkmachine en balset.',
      sub: 'Terwijl anderen 20 jaar algemene trekkingen analyseren — filteren wij op de specifieke machine &amp; balset van vanavond.'
    },
    fr: {
      title: 'Le seul outil qui optimise les numéros en fonction de la machine et du jeu de boules réellement utilisés.',
      sub: 'Pendant que d\'autres analysent 20 ans de tirages généraux — nous filtrons sur la machine &amp; le jeu de boules spécifique utilisé ce soir.'
    },
    de: {
      title: 'Das einzige Tool, das Zahlen basierend auf der tatsächlich verwendeten Ziehmaschine und dem Ballsatz optimiert.',
      sub: 'Während andere 20 Jahre allgemeine Ziehungen analysieren — filtern wir nach der spezifischen Maschine &amp; dem Ballsatz von heute Abend.'
    },
    es: {
      title: 'La única herramienta que optimiza números basándose en el uso real de la máquina de sorteo y el juego de bolas.',
      sub: 'Mientras otros analizan 20 años de sorteos generales — nosotros filtramos por la máquina &amp; juego de bolas específico de esta noche.'
    },
    pt: {
      title: 'A única ferramenta que otimiza números com base no uso real da máquina de sorteio e do conjunto de bolas.',
      sub: 'Enquanto outros analisam 20 anos de sorteios gerais — nós filtramos pela máquina &amp; conjunto de bolas específico desta noite.'
    },
  };
  const tl = taglines[lang] || taglines.en;
  const titleEl = document.getElementById('taglineTitle');
  const subEl = document.getElementById('taglineSub');
  if (titleEl) titleEl.innerHTML = tl.title;
  if (subEl) subEl.innerHTML = tl.sub;

  updateDiscAcceptBtn();
}

// ---- CHECKBOX TOGGLE ----
function toggleCheck(id) {
  discChecks[id] = !discChecks[id];
  const el = document.getElementById(id + '-el');
  const mark = document.getElementById(id + '-mark');
  el.classList.toggle('checked', discChecks[id]);
  mark.textContent = discChecks[id] ? '✓' : '';
  updateDiscAcceptBtn();
}

function updateDiscAcceptBtn() {
  const allChecked = discChecks.check1 && discChecks.check2 && discChecks.check3;
  const btn = document.getElementById('discAcceptBtn');
  const t = DISC_TRANSLATIONS[currentDiscLang] || DISC_TRANSLATIONS.en;
  btn.disabled = !allChecked;
  document.getElementById('discAcceptLabel').textContent =
    allChecked ? (t.discAcceptLabel || '✓ Accept all & Enter') : (t.discAcceptLabelDisabled || '☐ Please check all boxes above');
}

// ---- ACCEPT ----
function discAccept() {
  if (!discChecks.check1 || !discChecks.check2 || !discChecks.check3) return;
  const record = { accepted: true, date: new Date().toISOString(), lang: currentDiscLang, version: 'v1-may2026' };
  localStorage.setItem(DISC_KEY, JSON.stringify(record));
  document.getElementById('discOverlay').classList.remove('open');
}

// ---- SHOW AGAIN (from footer link) ----
function showDisclaimer() {
  document.getElementById('discOverlay').classList.add('open');
}

// ---- INIT: show on first visit ----
(function initDisclaimer() {
  try {
    const stored = JSON.parse(localStorage.getItem(DISC_KEY));
    if (stored && stored.accepted && stored.version === 'v1-may2026') return; // already accepted
  } catch(e) {}
  // Try to auto-detect language
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const supported = ['nl', 'fr', 'de', 'es', 'pt'];
  if (supported.includes(lang)) {
    currentDiscLang = lang;
    document.querySelectorAll('.disc-lang-tab').forEach(b => b.classList.remove('active'));
    const tab = [...document.querySelectorAll('.disc-lang-tab')].find(b => b.textContent.includes(lang.toUpperCase()));
    if (tab) tab.classList.add('active');
    const t = DISC_TRANSLATIONS[lang];
    if (t) Object.keys(t).forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = t[id]; });
  }
  document.getElementById('discOverlay').classList.add('open');
})();



