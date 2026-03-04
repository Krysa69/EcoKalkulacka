window.solveSimpleChallenge = window.solveSimpleChallenge || function solveSimpleChallenge(){ return true; };


const PRICE = {"tuv": [{"label": "Vyberte možnost", "price_gj": 1200.0, "price_mwh": 4320.0}, {"label": "Vlastní plynová kotelna", "price_gj": 650.0, "price_mwh": 2200.0}, {"label": "Dálkové TUV a Teplo (Teplárna)", "price_gj": 1150.0, "price_mwh": 4140.0}, {"label": "Individuální Boiler", "price_gj": 2200.0, "price_mwh": 7500.0}], "teplo": [{"label": "Vyberte možnost", "price_gj": 1200.0, "price_mwh": 4320.0}, {"label": "Vlastní plynová kotelna", "price_gj": 650.0, "price_mwh": 2200.0}, {"label": "Dálkové TUV a Teplo (Teplárna)", "price_gj": 1150.0, "price_mwh": 4140.0}], "electricity_price_mwh": 7359.0};

const STORAGE_KEY = "ecoCalcState_v2";
const TIMER_KEY = "ecoCalcTimer_v2";

function nowMs(){ return Date.now(); }

function loadState(){
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (s && typeof s === "object") return s;
  } catch(_e) {}
  return {
    // V CZ kontextu je pro teplo/TUV nejběžnější GJ; MWh zůstává jako alternativa.
    unitHeat: "GJ", // GJ | MWh
    consTuv: null,
    consHeat: null,
    consElec: null, // MWh
    costTuv: null,
    costHeat: null,
    costElec: null,
    // Pro UX a reporting: jak uživatel dodal data (nevynucujeme, jen informativně)
    inputMode: null, // 'consumption' | 'costs' | 'mixed'
    sysTuv: "Vyberte možnost",
    sysHeat: "Vyberte možnost",
    floorArea: null,
    roofArea: null,
    ppCount: null,
    npCount: null,
    bjCount: null,
    bdPeople: null,
    energyClass: null,
    penbNote: "",
    ico: "",
    subjectName: "",
    seat: "",
    personName: "",
    role: "",
    street: "",
    city: "",
    zip: "",
    ds: "",
    phone: "",
    email: ""
  };
}
function saveState(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function resetAll(){ localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(TIMER_KEY); }

function parseNumber(v){
  // Accept inputs like "1 200", "1,2", "1.2", "1200 Kč", "1 200Kc"
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.replace(/\s+/g,'');
  // strip common currency/unit suffixes
  s = s.replace(/(kc|kč|czk|\/rok|rok|mwh|gj)/ig,'');
  // keep digits, minus, dot, comma
  s = s.replace(/[^0-9\-\.,]/g,'');
  if (!s) return null;
  // if both comma and dot exist, treat comma as thousands separator -> remove commas
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g,'');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseIntSafe(v){
  const n = parseNumber(v);
  if (n === null) return null;
  const i = Math.trunc(n);
  return Number.isFinite(i) ? i : null;
}

function fmtCZK(n){
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Kč / rok";
}
function fmtUnit(n, unit){
  if (!Number.isFinite(n)) return "—";
  const x = Math.round(n*100)/100;
  return String(x).replace('.', ',') + " " + unit + " / rok";
}

function getUnitPrice(list, label, unitHeat){
  const row = list.find(x => x.label === label) || list[0];
  return unitHeat === "GJ" ? row.price_gj : row.price_mwh;
}
function computeCosts(s){
  const estTuv = (s.consTuv ?? 0) * getUnitPrice(PRICE.tuv, s.sysTuv, s.unitHeat);
  const estHeat = (s.consHeat ?? 0) * getUnitPrice(PRICE.teplo, s.sysHeat, s.unitHeat);
  const estElec = (s.consElec ?? 0) * PRICE.electricity_price_mwh;

  const cTuv = Number.isFinite(s.costTuv) ? s.costTuv : estTuv;
  const cHeat = Number.isFinite(s.costHeat) ? s.costHeat : estHeat;
  const cElec = Number.isFinite(s.costElec) ? s.costElec : estElec;

  return { estTuv, estHeat, estElec, costTuv: cTuv, costHeat: cHeat, costElec: cElec, total: cTuv + cHeat + cElec };
}

// Cena elektřiny (Kč/MWh) – v aktuálním modelu je fixní dle tabulky PRICE.
// (Do budoucna se dá přepsat na vstup uživatele nebo načítat z konfigurace.)
function getElectricityPrice(_st){
  return Number(PRICE.electricity_price_mwh);
}

function getTimer(){
  const raw = localStorage.getItem(TIMER_KEY);
  if (!raw) {
    const start = nowMs();
    localStorage.setItem(TIMER_KEY, JSON.stringify({start}));
    return {start};
  }
  try {
    const t = JSON.parse(raw);
    if (t && Number.isFinite(t.start)) return t;
  } catch(_e) {}
  const start = nowMs();
  localStorage.setItem(TIMER_KEY, JSON.stringify({start}));
  return {start};
}
function renderTimer(){
  const el = document.querySelector("[data-timer]");
  if (!el) return;
  const t = getTimer();
  const duration = 10 * 60 * 1000;
  const tick = () => {
    const left = Math.max(0, duration - (nowMs() - t.start));
    const sec = Math.floor(left/1000);
    const mm = String(Math.floor(sec/60)).padStart(2,'0');
    const ss = String(sec%60).padStart(2,'0');
    el.textContent = mm + ":" + ss;
  };
  tick();
  setInterval(tick, 1000);
}

function setWizardTop(step, total){
  const stepEl = document.querySelector("[data-stepLabel]");
  const bar = document.querySelector("[data-progress]");
  if (stepEl) stepEl.textContent = "Krok " + step + " z " + total;
  if (bar) bar.style.width = Math.round(((step-1)/(total-1))*100) + "%";
  setPhase(step);
}

function populateSelect(el, options){
  if (!el) return;
  el.innerHTML = "";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.label;
    opt.textContent = o.label;
    el.appendChild(opt);
  }
}

function showError(box, msgs){
  if (!box) return;
  box.hidden = !msgs.length;
  box.innerHTML = msgs.length ? "<b>Ještě tohle:</b><br>" + msgs.map(m => "• " + m).join("<br>") : "";
}


function clamp(n, min, max){
  if (!Number.isFinite(n)) return n;
  if (Number.isFinite(min) && n < min) return min;
  if (Number.isFinite(max) && n > max) return max;
  return n;
}
function validateRange(name, n, min, max, errs){
  if (n === null) return;
  if (!Number.isFinite(n)) { errs.push(name + " není číslo."); return; }
  if (Number.isFinite(min) && n < min) errs.push(name + " je podezřele nízko.");
  if (Number.isFinite(max) && n > max) errs.push(name + " je podezřele vysoko.");
}


function validateICO(value){
  const ico = String(value || "").replace(/\D/g, "");
  if (ico.length !== 8) return false;
  const digits = ico.split("").map(d => parseInt(d,10));
  const weights = [8,7,6,5,4,3,2];
  let sum = 0;
  for (let i=0;i<7;i++) sum += digits[i]*weights[i];
  let mod = sum % 11;
  let check = 11 - mod;
  if (check === 10) check = 0;
  if (check === 11) check = 1;
  return digits[7] === check;
}

function ensureOverlay(){
  let ov = document.getElementById("ecoOverlay");
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = "ecoOverlay";
  ov.className = "overlay";
  ov.innerHTML = `
    <div class="overlay__card">
      <div class="overlay__title" id="ecoOverlayTitle">Vyhodnocuji vstupy…</div>
      <div class="overlay__sub" id="ecoOverlaySub">Probíhá kontrola vstupů a výpočtu.</div>
      <div class="overlay__bar" aria-hidden="true"><div class="overlay__barFill"></div></div>
      <div class="overlay__meta mono" id="ecoOverlayEta">Odhad: ~1 s</div>
    </div>`;
  document.body.appendChild(ov);
  return ov;
}
function showOverlay(title, sub, etaText){
  const ov = ensureOverlay();
  ov.querySelector("#ecoOverlayTitle").textContent = title || "Vyhodnocuji vstupy…";
  ov.querySelector("#ecoOverlaySub").textContent = sub || "Probíhá kontrola vstupů a výpočtu.";
  ov.querySelector("#ecoOverlayEta").textContent = etaText || "Odhad: ~1 s";
  ov.classList.add("overlay--show");
}
function hideOverlay(){
  const ov = document.getElementById("ecoOverlay");
  if (ov) ov.classList.remove("overlay--show");
}
function navigate(url, opts){
  // Bez umělého zpoždění (žádné 1s „načítání“ mezi kroky).
  window.location.href = url;
}

function setPhase(step){
  const phaseEl = document.querySelector("[data-phase]");
  if (!phaseEl) return;
  const isCalc = step <= 4;
  phaseEl.textContent = isCalc ? "Fáze: Výpočet (1–4)" : "Fáze: Kontakt (5–8)";
}


async function lookupICOInAres(ico){
  // ARES – veřejný registr ekonomických subjektů (orientační načtení dat).
  // Pozn.: Pokud aplikaci spouštíte přes file://, některé prohlížeče mohou blokovat požadavky.
  // Doporučeno spouštět přes lokální server (např. VS Code Live Server / python -m http.server).
  const url = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/" + encodeURIComponent(ico);
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) return null;

  const data = await res.json();
  const name = data?.obchodniJmeno ?? data?.nazev ?? "";

  const sidlo = data?.sidlo ?? null;
  const street = sidlo?.nazevUlice ?? sidlo?.ulice ?? sidlo?.nazevCastiObce ?? "";
  const houseNo = sidlo?.cisloDomovni ?? sidlo?.cisloOrientacni ?? sidlo?.cisloDoAdresy ?? "";
  const city = sidlo?.nazevObce ?? sidlo?.obec ?? "";
  const zip = sidlo?.psc ?? sidlo?.postovniSmerovaciCislo ?? "";

  const streetFull = [street, houseNo].filter(Boolean).join(" ").trim();
  const seat = (streetFull ? streetFull : "").trim() + (city ? (", " + city) : "") + (zip ? (" " + zip) : "");

  return {
    ico: String(ico),
    subjectName: String(name || "").trim(),
    seat: String(seat || "").trim(),
    street: String(streetFull || "").trim(),
    city: String(city || "").trim(),
    zip: String(zip || "").trim()
  };
}

window.ECO = { PRICE, lookupICOInAres, loadState, saveState, resetAll, parseNumber, parseIntSafe, fmtCZK, fmtUnit, computeCosts, getTimer, renderTimer, setWizardTop, populateSelect, showError, clamp, validateRange, showOverlay, hideOverlay, navigate, validateICO };


// ===== Excel-derived simulation constants (List A/B/D) =====
const EXCEL_MONTHS = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
// Měsíční podíly výroby FVE v %, součet ~ 99.99 (Excel)
const EXCEL_FVE_PCT = [3.10,4.75,8.33,10.92,13.16,12.53,13.81,12.38,8.69,7.15,2.99,2.18];
// Excel konfigurace: 100 kWp -> 120 MWh/rok
const EXCEL_BASE_KWP = 100;
const EXCEL_BASE_PROD_MWH = 120;
const EXCEL_DEFAULT_SCOP = 5.2;
// Excel D: investice s DPH + NZÚ podíl
const EXCEL_DEFAULT_INVEST_VAT = 9034368;
const EXCEL_DEFAULT_SUBSIDY_RATE = 0.48;
// Excel B: inflace/růst cen 2 %, úvěr 3 %
const EXCEL_DEFAULT_INFLATION = 0.02;
const EXCEL_DEFAULT_LOAN_RATE = 0.03;

function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

function parseNumFlexible(s){
  if (s === null || s === undefined) return null;
  if (typeof s === "number") return isFinite(s) ? s : null;
  const raw = String(s).trim();
  if (!raw) return null;
  // odstraní Kč, mezery, NBSP
  let t = raw.replace(/\s|\u00A0/g, "").replace(/Kč/gi, "");
  // 1,23 -> 1.23
  t = t.replace(/,/g, ".");
  // nech jen čísla, tečku a minus
  t = t.replace(/[^0-9.\-]/g, "");
  if (!t) return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}

function money(n){
  if (n === null || n === undefined || !isFinite(n)) return "–";
  return Math.round(n).toLocaleString("cs-CZ") + " Kč";
}
function mwh(n){
  if (n === null || n === undefined || !isFinite(n)) return "–";
  return (Math.round(n*100)/100).toLocaleString("cs-CZ") + " MWh";
}

function estimateKwpFromState(st, baseLoadMWh){
  // Heuristika pro "předběžné" defaulty:
  // - cílíme na cca 60% pokrytí roční elektrické spotřeby (bez plného nettingu),
  // - výnos cca 1.2 MWh / kWp / rok (odpovídá EXCEL_BASE_PROD_MWH / EXCEL_BASE_KWP),
  // - omezíme to plochou střechy (pokud je známá) a rozumným stropem.
  const yieldMwhPerKwp = (EXCEL_BASE_PROD_MWH / EXCEL_BASE_KWP) || 1.2;
  const targetCoverage = 0.60;

  const roofArea = Number(st?.roofArea || 0); // m2
  const roofCapKwp = roofArea > 0 ? (roofArea / 7.0) : Infinity; // ~7 m2/kWp (orientačně)
  const loadTargetKwp = (baseLoadMWh * targetCoverage) / yieldMwhPerKwp;

  const cap = isFinite(roofCapKwp) ? Math.min(roofCapKwp, 30) : 30; // předběžně max 30 kWp
  return clamp(loadTargetKwp, 2, cap);
}

function getProjectDefaults(st){
  const base = computeBaselineFromState(st);
  const scop = clamp(EXCEL_DEFAULT_SCOP, 1.5, 10);

  // Baseline roční elektrická zátěž po realizaci (elektřina objektu + TČ)
  const hpElecMWh = (base.tuvMWh + base.heatMWh) / scop;
  const totalLoad = base.elecMWh + hpElecMWh;

  return {
    kwp: estimateKwpFromState(st, totalLoad),
    scop: scop,
    investVat: EXCEL_DEFAULT_INVEST_VAT,
    subsidyRate: EXCEL_DEFAULT_SUBSIDY_RATE,
    inflation: EXCEL_DEFAULT_INFLATION,
    loanYears: 10,
    loanRate: EXCEL_DEFAULT_LOAN_RATE,
    loanShare: 1
  };
}

function computeBaselineFromState(st){
  // state už má konsumpce + ceny, ale baseline náklady bereme z computeCosts() výsledku uloženého ve state (pokud existuje)
  // fallback: přepočet z consumptions * unit price
  const unit = st.unitHeat || "GJ";
  const consTuv = Number(st.consTuv || 0);
  const consHeat = Number(st.consHeat || 0);
  const consElec = Number(st.consElec || 0); // MWh
  // ceny: buď faktura (cost / cons), nebo default z PRICE podle techType
  const costs = computeCosts(st);
  const baseline = {
    costTuv: costs.costTuv,
    costHeat: costs.costHeat,
    costElec: costs.costElec,
    total: costs.total,
    // spotřeby převedené na MWh pro simulaci
    tuvMWh: unit === "GJ" ? consTuv/3.6 : consTuv,
    heatMWh: unit === "GJ" ? consHeat/3.6 : consHeat,
    elecMWh: consElec
  };
  return baseline;
}

function computeFveProductionMwh(kwp){
  const annual = (kwp / EXCEL_BASE_KWP) * EXCEL_BASE_PROD_MWH;
  const monthly = EXCEL_FVE_PCT.map(p => annual * (p/100));
  return { annual, monthly };
}

function computeSimulation(st, proj){
  const base = computeBaselineFromState(st);
  const elecPrice = getElectricityPrice(st); // Kč/MWh
  const scop = clamp(proj.scop, 1.5, 10);
  const fve = computeFveProductionMwh(clamp(proj.kwp, 0, 100000));

  // Elektrická spotřeba pro TUV + teplo přes TČ (MWh_el)
  const hpElecMWh = (base.tuvMWh + base.heatMWh) / scop;

  // Celková měsíční zátěž (zjednodušeně rovnoměrně) – bez měsíčního profilu spotřeby v sešitu
  // Pro účely modelu (Excel list A) jde hlavně o roční bilanci + měsíční distribuci výroby.
  const monthlyLoad = Array(12).fill((base.elecMWh + hpElecMWh) / 12);

  let self = 0;
  let excess = 0;
  for (let i=0;i<12;i++){
    const prod = fve.monthly[i];
    const load = monthlyLoad[i];
    self += Math.min(prod, load);
    excess += Math.max(0, prod - load);
  }

  // hodnota výroby: nejdřív pokryje vlastní spotřebu, přebytky počítáme jako komunitní sdílení (stejná cena jako elektřina)
  const valueSelf = self * elecPrice;
  const valueExcess = excess * elecPrice;

  // Náklad po realizaci:
  // - Elektřina: platíš jen za (load - self - využité sdílení). Pokud sdílení bereme jako plný kredit, pak je to max(0, (load - prod)) * cena.
  const totalLoad = base.elecMWh + hpElecMWh;
  const netGridMWh = Math.max(0, totalLoad - fve.annual); // zjednodušeně ročně
  const newElecCost = netGridMWh * elecPrice;

  // Po realizaci předpokládáme, že TUV+Teplo nejsou už fakturovány jako teplo (nahrazeno TČ), takže jejich náklady přesuneme do elektřiny.
  const sim = {
    newCostElec: newElecCost,
    newCostHeat: 0,
    newCostTuv: 0,
    newTotal: newElecCost,
    savings: base.total - newElecCost,
    savingsPct: base.total > 0 ? (base.total - newElecCost)/base.total : 0,
    fveAnnualMWh: fve.annual,
    selfMWh: self,
    excessMWh: excess,
    hpElecMWh: hpElecMWh,
    elecPrice: elecPrice,
    baseTotal: base.total
  };
  return sim;
}

function computeRoiAndLoan(sim, proj){
  const investVat = Math.max(0, proj.investVat);
  const subsidy = investVat * clamp(proj.subsidyRate, 0, 1);
  const netInvest = Math.max(0, investVat - subsidy);

  const inflation = clamp(proj.inflation, -0.5, 0.5);
  const yearsMax = 30;

  let cum = 0;
  let paybackYear = null;
  const series = [];
  for (let y=1; y<=yearsMax; y++){
    const yearSaving = sim.savings * Math.pow(1+inflation, y-1);
    cum += yearSaving;
    series.push({year:y, cum:cum});
    if (paybackYear === null && cum >= netInvest){
      paybackYear = y;
    }
  }

  // Úvěr (anuitní splátka) z podílu netInvest
  const loanShare = clamp(proj.loanShare, 0, 1);
  const principal = netInvest * loanShare;
  const loanYears = Number(proj.loanYears || 10);
  const r = clamp(proj.loanRate, 0, 1);
  const n = loanYears * 12;
  const i = r/12;
  let monthly = 0;
  if (principal > 0 && i > 0){
    monthly = principal * (i) / (1 - Math.pow(1+i, -n));
  } else if (principal > 0 && i === 0){
    monthly = principal / n;
  }

  return { investVat, subsidy, netInvest, inflation, paybackYear, series, loan: {principal, monthly, loanYears, rate:r} };
}

function drawRoiChart(canvas, netInvest, series){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const pad = 40;
  const maxY = Math.max(netInvest, series[series.length-1].cum);
  const xStep = (w - pad*2) / (series.length-1);
  const yScale = (h - pad*2) / maxY;

  // axes
  ctx.strokeStyle = "#2f3a32";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h-pad);
  ctx.lineTo(w-pad, h-pad);
  ctx.stroke();

  // invest line
  ctx.strokeStyle = "#8a1f1f";
  ctx.setLineDash([6,4]);
  ctx.beginPath();
  const yInv = h-pad - netInvest*yScale;
  ctx.moveTo(pad, yInv);
  ctx.lineTo(w-pad, yInv);
  ctx.stroke();
  ctx.setLineDash([]);

  // curve
  ctx.strokeStyle = "#1d6a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((p,idx)=>{
    const x = pad + idx*xStep;
    const y = h-pad - p.cum*yScale;
    if (idx===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // labels
  ctx.fillStyle = "#2f3a32";
  ctx.font = "12px system-ui";
  ctx.fillText("0", pad-18, h-pad+14);
  ctx.fillText("Rok", w-pad-26, h-pad+30);
  ctx.fillText("Kumulace", 8, pad-10);
  ctx.fillText("Investice", pad+6, yInv-6);
}

function setupResult1Extended(){
  const st = loadState();
  if (!st) return;

  // Projektové konstanty / defaulty (odpovídají excelu) – interní výpočet, nezobrazujeme.
  st.project = getProjectDefaults(st);

  // 1) Baseline (stávající) – už z faktur/odhadu
  const base = computeCosts(st);

  // 2) Simulace po realizaci (orientační)
  const sim = computeSimulation(st, st.project);

  // KPI fill
  const elBase = document.getElementById("kpiBase");
  const elNew = document.getElementById("kpiNew");
  const elSave = document.getElementById("kpiSave");
  const elSavePct = document.getElementById("kpiSavePct");

  if (elBase) elBase.textContent = money(base.total) + " / rok";
  if (elNew) elNew.textContent = money(Math.max(0, sim.newTotal)) + " / rok";
  if (elSave) elSave.textContent = money(Math.max(0, sim.savings)) + " / rok";
  if (elSavePct) elSavePct.textContent = base.total > 0 ? ("(" + (sim.savingsPct*100).toFixed(1).replace('.', ',') + " %)") : "";

  // Detailní box (financování + ROI)
  const roi = computeRoiAndLoan(sim, st.project);
  const roiBox = document.getElementById("roiBox");
  if (roiBox){
    const pb = roi.paybackYear ? (roi.paybackYear + " let") : "nedosaženo do 30 let";
    const annualLoan = roi.loan.monthly * 12;
    roiBox.textContent =
      "Předpokládané roční náklady po realizaci: " + money(sim.newTotal) + " / rok\n" +
      "Předpokládaná roční úspora: " + money(sim.savings) + " / rok (" + (sim.savingsPct*100).toFixed(1).replace('.', ',') + " %)\n\n" +
      "Investice s DPH: " + money(roi.investVat) + "\n" +
      "Dotace: " + money(roi.subsidy) + "\n" +
      "Vlastní investice po dotaci: " + money(roi.netInvest) + "\n" +
      "Návratnost (při inflaci " + (roi.inflation*100).toFixed(1).replace('.', ',') + " % p.a.): " + pb + "\n\n" +
      "Úvěr: " + (st.project.loanShare*100).toFixed(0) + " % z investice\n" +
      "Měsíční splátka: " + money(roi.loan.monthly) + "\n" +
      "Roční splátka: " + money(annualLoan) + "\n" +
      "Bilance (úspora − splátka): " + money(sim.savings - annualLoan) + " / rok";
  }

  // Doporučení: stručné a obhajitelné zdůvodnění podle úspory a návratnosti
  const rec = document.getElementById("recBox");
  if (rec){
    const savePct = sim.savingsPct * 100;
    const pb = roi.paybackYear;
    let text = "";

    if (!isFinite(sim.savings) || sim.savings <= 0){
      text = "Na základě zadaných údajů nelze potvrdit ekonomickou úsporu. Doporučujeme doplnit přesné fakturační náklady a upřesnit parametry objektu.";
    } else if (pb && pb <= 15){
      text = "Projekt je podle předběžné simulace ekonomicky přínosný. Očekávaná roční úspora je " + money(sim.savings) + " (" + savePct.toFixed(1).replace('.', ',') + " %) a návratnost vlastní investice vychází přibližně " + pb + " let.";
    } else if (pb){
      text = "Projekt může být ekonomicky přínosný, nicméně návratnost vlastní investice vychází přibližně " + pb + " let. Doporučujeme ověřit úspory na přesných fakturačních datech a zvážit optimalizaci návrhu i financování.";
    } else {
      text = "Projekt může přinést úsporu " + money(sim.savings) + " ročně (" + savePct.toFixed(1).replace('.', ',') + " %), návratnost však v horizontu 30 let dle modelu nevychází. Doporučujeme upřesnit vstupy a varianty návrhu.";
    }

    rec.innerHTML = "<b>Doporučení:</b><br>" + text;
  }

  // Graf: stávající vs. nové náklady
  drawCostChart(document.getElementById("costChart"), base.total, sim.newTotal);

  // Graf kumulované úspory
  drawRoiChart(document.getElementById("roiChart"), roi.netInvest, roi.series);
}

function drawCostChart(canvas, baseTotal, newTotal){
  if (!canvas) return;
  baseTotal = Number.isFinite(baseTotal) ? baseTotal : 0;
  newTotal = Number.isFinite(newTotal) ? newTotal : 0;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const pad = 24;
  const barW = 160;
  const gap = 120;
  const maxV = Math.max(1, baseTotal, newTotal);
  const scale = (h - pad*2) / maxV;

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#dfe6df";
  ctx.beginPath(); ctx.moveTo(pad, h-pad); ctx.lineTo(w-pad, h-pad); ctx.stroke();

  const bars = [
    {label:"Stávající", value: Math.max(0, baseTotal), x: pad + 120},
    {label:"Po realizaci", value: Math.max(0, newTotal), x: pad + 120 + barW + gap}
  ];

  ctx.fillStyle = "#2aa55a";
  bars.forEach(b=>{
    const bh = b.value * scale;
    const y = (h - pad) - bh;
    ctx.fillRect(b.x, y, barW, bh);

    ctx.fillStyle = "#0b2b14";
    ctx.font = "16px system-ui";
    ctx.fillText(b.label, b.x, h - pad + 18);
    ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.fillText(money(b.value), b.x, Math.max(18, y - 8));
    ctx.fillStyle = "#2aa55a";
  });
}

// Expose for pages that want to trigger it explicitly (bez čekání na DOMContentLoaded hook)
ECO.setupResult1Extended = setupResult1Extended;

// hook for result1.html
document.addEventListener("DOMContentLoaded", ()=>{
  if (document.getElementById("roiChart")) {
    setupResult1Extended();
  }
});
