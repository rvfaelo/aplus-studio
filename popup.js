import {DEFAULTS, makeSlots} from "./shared.js";
import {normalizeAsins, auditLabel} from "./catalog-audit.js";
import {buildFullImagePrompt} from "./planning.js";
import {providerForModel} from "./providers.js";

const $ = id => document.getElementById(id);
let latest = null, locked = false, renderedVersion = "", savedKey = false, pollTimer;
let initialized = false, keyBusy = false, draftRevision = 0, rateLimitTimer;
let replaceMode = false, savedFingerprint = null;
let cloudKeySaved = false, cloudKeyFingerprint = null;
let keyStates={},cloudKeyStates={};
let auditLatest = null, auditItems = [], auditLocked = false;
let planningLatest = null, planResult = null, qualityResult = null, planningLocked = false;
const editableFields = ["title", "description", "model", "customModel", "faqCount", "specCount", "apiKey", "cloudPassphrase"];
const MODEL_MIGRATIONS = Object.freeze({"gemini/gemini-2.5-flash":"gemini/gemini-3.5-flash","gemini/gemini-2.5-flash-lite":"gemini/gemini-3.5-flash-lite","tokenrouter/z-ai/glm-5.3-free":"kira/glm-5.3-free"});
const selectedModel = () => $("model").value === "custom" ? $("customModel").value.trim() : $("model").value;
const providerModel=()=>({gemini:"gemini/gemini-3.5-flash",kira:"kira/qwen3.8-flash",groq:"openai/gpt-oss-20b",deepseek:"deepseek/deepseek-flash"})[$("keyProvider").value];
const selectedProvider=()=>providerForModel(selectedModel())==="auto"?"gemini":providerForModel(selectedModel());
const selectProviderState=()=>{const provider=$("keyProvider").value,local=keyStates[provider]||{} ,cloud=cloudKeyStates[provider]||{};replaceMode=false;keyState(!!local.saved,local.fingerprint);cloudKeyState(!!cloud.saved,cloud.fingerprint);};
const rawConfig = () => ({model: selectedModel(), faqCount: Number($("faqCount").value), specCount: Number($("specCount").value)});
$("openDashboard").onclick = async () => { await chrome.tabs.create({url: chrome.runtime.getURL("dashboard.html")}); window.close(); };
const config = () => {
  if (!selectedModel()) throw new Error("Digite o nome do modelo em Outro modelo ou selecione uma opção da lista.");
  return rawConfig();
};
async function send(action, data = {}) {
  const reply = await chrome.runtime.sendMessage({channel: "aplus-extension", action, ...data});
  if (!reply?.ok) throw new Error(reply?.error || "A extensão não respondeu. Reabra o popup.");
  return reply.data;
}
async function tabId() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
  return tab.id;
}
function status(message, kind = "") { $("status").textContent = message; $("statusBox").className = `status-box ${kind}`; }
function renderDiagnostic(diagnostic) {
  $("apiDiagnostic").hidden = !diagnostic;
  $("apiDiagnostic").open = !!diagnostic;
  $("copyDiagnostic").textContent = "Copiar diagnóstico";
  if (!diagnostic) { $("diagnosticText").value = ""; return; }
  const fields = [["Modelo", "model"], ["HTTP", "httpStatus"], ["Evento", "event"],
    ["Código", "code"], ["Tipo", "type"], ["Parâmetro", "param"], ["Mensagem da API", "message"],
    ["Motivo de resposta incompleta", "incompleteReason"], ["ID da requisição", "requestId"],
    ["ID da resposta", "responseId"], ["Tentativa", "attempt"], ["Limite de tokens", "maxOutputTokens"]];
  $("diagnosticText").value = ["DIAGNÓSTICO A+ PREMIUM", `Versão: ${chrome.runtime.getManifest().version}`,
    ...fields.map(([label, key]) => `${label}: ${diagnostic[key] ?? "não informado"}`)].join("\n");
}
function renderRateLimit(rateLimit) {
  clearInterval(rateLimitTimer);
  const box = $("rateLimit");
  if (!rateLimit || typeof rateLimit.resetAt !== "number") { box.hidden = true; return; }
  const tick = () => {
    const remaining = rateLimit.resetAt - Date.now();
    if (remaining <= 0) { box.hidden = true; clearInterval(rateLimitTimer); return; }
    const secs = Math.ceil(remaining / 1000);
    const hasNumbers = Number.isFinite(rateLimit.limit) && Number.isFinite(rateLimit.remaining);
    const used = hasNumbers ? rateLimit.limit - rateLimit.remaining : null;
    box.hidden = false;
    box.className = "rate-limit" + (used !== null && rateLimit.limit > 0
      ? (used / rateLimit.limit >= 0.9 ? " critical" : used / rateLimit.limit >= 0.7 ? " warn" : "")
      : "");
    box.textContent = hasNumbers
      ? `Limite da API: ${used} de ${rateLimit.limit} tokens · renova em ${secs}s`
      : `Limite da API · renova em ${secs}s`;
  };
  tick();
  rateLimitTimer = setInterval(tick, 500);
}
function busy(value) {
  locked = value;
  for (const id of ["generate", "scan", "map", "refill", "undo", "forgetKey", "applyKey", "replaceKey", "cancelReplace"])
    $(id).disabled = value || !initialized || keyBusy;
  $("apiKey").disabled = !initialized || keyBusy || value;
  $("cancel").hidden = !value;
  for (const id of ["auditCapture", "auditClear", "auditRun"])
    $(id).disabled = value || auditLocked || !initialized;
  for (const id of ["planningRun", "qualityRun", "planningClear"])
    $(id).disabled = value || planningLocked || !initialized;
  syncCloudControls();
}

function syncCloudControls() {
  const blocked=locked||keyBusy||!initialized;
  $("cloudSaveKey").disabled=blocked||!savedKey; $("cloudUnlockKey").disabled=blocked||!cloudKeySaved;
  $("cloudRemoveKey").disabled=blocked||!cloudKeySaved; $("cloudPassphrase").disabled=blocked||(!savedKey&&!cloudKeySaved);
}
function cloudKeyState(has,fingerprint) {
  cloudKeySaved=!!has; cloudKeyFingerprint=fingerprint||null;
  $("cloudKeyStatus").textContent=has?"Criptografada":"Não configurada";
  $("cloudKeyStatus").className=`key-status ${has?"ok":"missing"}`;
  $("cloudKeyHint").textContent=has?`Cópia criptografada disponível${cloudKeyFingerprint?`, final ••••${cloudKeyFingerprint}`:""}. Digite sua senha para desbloquear neste computador.`:"A chave é criptografada antes de ir para o Chrome Sync. A senha não é salva.";
  syncCloudControls();
}

function planningStatus(message, kind = "") {
  $("planningStatus").textContent = message;
  $("planningStatusBox").className = `audit-status ${kind}`;
}

function setPlanningBusy(value) {
  planningLocked = value;
  for (const id of ["planningRun", "qualityRun", "planningClear"])
    $(id).disabled = value || locked || !initialized;
  $("planningCancel").hidden = !value;
}

function addPlanRow(parent, title, lines = [], prompt = "") {
  const row = document.createElement("div"); row.className = "plan-row";
  const heading = document.createElement("strong"); heading.textContent = title; row.append(heading);
  for (const line of lines.filter(Boolean)) { const p = document.createElement("p"); p.textContent = line; row.append(p); }
  if (prompt) {
    const text = document.createElement("p"); text.className = "plan-prompt"; text.textContent = prompt; row.append(text);
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "text-button copy-plan"; copy.textContent = "Copiar prompt";
    copy.onclick = async () => { try { await navigator.clipboard.writeText(prompt); copy.textContent = "Copiado"; } catch { copy.textContent = "Não foi possível copiar"; } };
    row.append(copy);
  }
  parent.append(row);
}

function renderPlan(plan = planResult) {
  planResult = plan || null;
  $("planningResults").hidden = !planResult;
  if (!planResult) return;
  const diagnosis = planResult.diagnosis || {}, report = $("diagnosisReport"); report.replaceChildren();
  const diagnosisRows = [
    ["Categoria", diagnosis.category],
    ["Público", `${diagnosis.audience || "Não identificado"}${planResult.audienceIsInference ? " (inferência para revisão)" : ""}`],
    ["Problema principal", diagnosis.main_problem], ["Benefício central", diagnosis.central_benefit], ["Resumo", diagnosis.summary]
  ];
  for (const [label, value] of diagnosisRows) {
    const p = document.createElement("p"), strong = document.createElement("strong"); strong.textContent = `${label}: `;
    p.append(strong, document.createTextNode(value || "Não identificado")); report.append(p);
  }
  const missing = $("missingReport"); missing.replaceChildren();
  for (const item of planResult.missingInformation || []) addPlanRow(missing, item.field, [item.reason]);
  $("missingTitle").textContent = `Informações ausentes (${planResult.missingInformation?.length || 0})`;
  const benefits = $("benefitsReport"); benefits.replaceChildren();
  for (const item of planResult.featureBenefits || []) addPlanRow(benefits, item.feature, [item.benefit, `Base: ${item.evidence}`]);
  $("benefitsTitle").textContent = `Características e benefícios (${planResult.featureBenefits?.length || 0})`;
  const briefs = $("briefsReport"); briefs.replaceChildren();
  for (const item of planResult.imageBriefs || []) addPlanRow(briefs, `${item.module} · ${item.size}`,
    [`Objetivo: ${item.goal}`, `Cena: ${item.scene}`, `Composição: ${item.composition}`], item.prompt);
  $("briefsTitle").textContent = `Briefings de imagens (${planResult.imageBriefs?.length || 0})`;
  $("planningBadge").textContent = "Plano pronto"; $("planningBadge").className = "key-status ok";
}

function renderQuality(result = qualityResult) {
  qualityResult = result || null;
  $("qualityResults").hidden = !qualityResult;
  if (!qualityResult) return;
  $("qualityScore").textContent = qualityResult.score;
  $("qualityScore").className = `quality-score ${qualityResult.score < 60 ? "bad" : qualityResult.score < 80 ? "warn" : ""}`;
  $("qualitySummary").textContent = qualityResult.score >= 90 ? "Excelente. Faça apenas a revisão final." :
    qualityResult.score >= 75 ? "Bom, mas ainda há pontos para revisar." : "Revise os problemas antes de publicar.";
  const criteria = $("qualityCriteria"); criteria.replaceChildren();
  for (const item of qualityResult.criteria || []) {
    const row = document.createElement("div"); row.className = "quality-criterion";
    const name = document.createElement("span"); name.textContent = item.name;
    const score = document.createElement("strong"); score.textContent = `${item.score}/${item.max}`; row.append(name, score); criteria.append(row);
  }
  const issues = $("qualityIssues"); issues.replaceChildren();
  if (!(qualityResult.issues || []).length) paragraph(issues, "Nenhum problema automático encontrado.").className = "success";
  else for (const issue of qualityResult.issues) paragraph(issues, issue);
}

function auditStatus(message, kind = "") {
  $("auditStatus").textContent = message;
  $("auditStatusBox").className = `audit-status ${kind}`;
}

function setAuditBusy(value) {
  auditLocked = value;
  for (const id of ["auditCapture", "auditClear", "auditRun"])
    $(id).disabled = value || locked || !initialized;
  $("asinList").disabled = value || !initialized;
  $("auditCancel").hidden = !value;
}

function auditMatches(item, filter) {
  if (filter === "missing") return item.status === "not_published";
  if (filter === "published") return ["published_standard", "published_premium"].includes(item.status);
  if (filter === "issues") return ["blocked", "error", "unavailable", "queued", "checking"].includes(item.status) || !item.status;
  return true;
}

function renderAudit(items = auditItems) {
  auditItems = Array.isArray(items) ? items : [];
  $("auditBadge").textContent = `${auditItems.length} produto${auditItems.length === 1 ? "" : "s"}`;
  $("auditResults").hidden = auditItems.length === 0;
  if (!auditItems.length) return;
  const published = auditItems.filter(item => ["published_standard", "published_premium"].includes(item.status)).length;
  const missing = auditItems.filter(item => item.status === "not_published").length;
  $("auditSummary").textContent = `${missing} sem A+ · ${published} com A+`;
  const report = $("auditReport"); report.replaceChildren();
  const visible = auditItems.filter(item => auditMatches(item, $("auditFilter").value));
  if (!visible.length) {
    const empty = document.createElement("p"); empty.className = "hint"; empty.textContent = "Nenhum produto neste filtro."; report.append(empty); return;
  }
  for (const item of visible) {
    const row = document.createElement("div"); row.className = "audit-row";
    const top = document.createElement("div"); top.className = "audit-row-top";
    const asin = document.createElement("strong"); asin.textContent = item.sku ? `${item.asin} · SKU ${item.sku}` : item.asin;
    const badge = document.createElement("span"); badge.className = `audit-result ${item.status || item.sellerStatus || "unknown"}`; badge.textContent = auditLabel(item);
    top.append(asin, badge); row.append(top);
    if (item.title) { const title = document.createElement("p"); title.className = "audit-title"; title.textContent = item.title; row.append(title); }
    if (item.detail) { const detail = document.createElement("p"); detail.className = "audit-detail"; detail.textContent = item.detail; row.append(detail); }
    const open = document.createElement("button"); open.type = "button"; open.className = "text-button audit-open";
    open.textContent = "Abrir produto"; open.onclick = () => chrome.tabs.create({url: item.publicUrl || `https://www.amazon.com.br/dp/${item.asin}`});
    row.append(open); report.append(row);
  }
}
// Três estados possíveis:
//   1. Sem chave        → mostra input + "Aplicar e salvar chave"
//   2. Chave salva      → mostra campo cinza read-only + "Substituir" / "Remover"
//   3. Substituindo     → mostra input + "Aplicar nova chave" + "Cancelar"
function keyState(has, fingerprint, initial = false) {
  savedKey = has;
  savedFingerprint = fingerprint || null;
  const badge = $("keyStatus");
  badge.textContent = has ? "Configurada" : "Não configurada";
  badge.className = `key-status ${has ? "ok" : "missing"}`;

  const showSaved = has && !replaceMode;
  $("keySavedView").hidden = !showSaved;
  $("keyInputView").hidden = showSaved;

  if (showSaved) {
    $("keyMask").textContent = "•".repeat(12) + (savedFingerprint || "");
    $("keyHint").textContent = "Chave aplicada neste navegador. Use Substituir para trocá-la ou Remover para apagá-la.";
  } else if (has) {
    $("keyHint").textContent = "Cole a nova chave do provedor selecionado e clique em Aplicar nova chave.";
    $("cancelReplace").hidden = false;
    $("applyKey").textContent = "Aplicar nova chave";
  } else {
    $("keyHint").textContent = "Cole a chave do provedor selecionado e clique em Aplicar e salvar chave.";
    $("cancelReplace").hidden = true;
    $("applyKey").textContent = "Aplicar e salvar chave";
  }
  if (initial && !has) $("keySettings").open = true;
}
function paragraph(parent, text) { const p = document.createElement("p"); p.textContent = text; parent.append(p); return p; }
function render(job, scanOnly = null) {
  const scan = scanOnly?.scan || job?.scan;
  const generated = scanOnly ? null : job?.generated;
  if (!scan && !generated) return;
  const slots = scanOnly?.slots || job?.slots || makeSlots(rawConfig());
  $("results").hidden = false;
  $("refill").disabled = locked || !job?.generated;
  $("export").disabled = !job?.generated;
  $("undo").disabled = locked;
  $("warnings").replaceChildren();
  for (const note of [...new Set([...(scan?.warnings || []), ...(generated?.notes || [])])]) paragraph($("warnings"), note);
  $("report").replaceChildren();
  const entries = new Map((scan?.entries || []).map(row => [row.key, row]));
  const report = new Map((scanOnly ? [] : job?.report?.results || []).map(row => [row.key, row]));
  const found = scan?.entries.filter(e => e.found).length || 0;
  $("reportTitle").textContent = generated ? `Campos e textos (${slots.length})` : `${found} de ${slots.length} campos identificados`;
  for (const slot of slots) {
    const d = document.createElement("div"); d.className = "field-row";
    const title = document.createElement("strong"); title.textContent = slot.label; d.append(title);
    const entry = entries.get(slot.key), result = report.get(slot.key);
    const info = paragraph(d, result?.detail || (entry?.found ? `Identificado: ${entry.field}${entry.existing ? ". Texto existente será substituído." : "."}` : "Campo não identificado."));
    info.className = result ? (["filled", "same"].includes(result.status) ? "success" : "pending") : entry?.found ? "success" : "pending";
    if (generated && Object.hasOwn(generated.texts, slot.key)) {
      const value = generated.texts[slot.key];
      const ta = document.createElement("textarea"); ta.readOnly = true; ta.value = value; ta.rows = value.length > 180 ? 4 : 2; ta.setAttribute("aria-label", slot.label); d.append(ta);
      const row = document.createElement("div"); row.className = "copy-row";
      const count = document.createElement("span"); count.textContent = `${value.length}/${slot.limit} caracteres`;
      const copy = document.createElement("button"); copy.type = "button"; copy.className = "text-button"; copy.textContent = "Copiar";
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(value); copy.textContent = "Copiado"; }
        catch { ta.select(); document.execCommand("copy"); copy.textContent = "Texto selecionado"; }
      };
      row.append(count, copy); d.append(row);
    }
    $("report").append(d);
  }
}

async function refresh(initial = false) {
  const data = await send("status"); latest = data.job; keyStates=data.keyStates||{gemini:{saved:data.keySaved,fingerprint:data.keyFingerprint}};cloudKeyStates=data.cloudKeyStates||{gemini:{saved:data.cloudKeySaved,fingerprint:data.cloudKeyFingerprint}};
  auditLatest = data.auditJob || null;
  auditItems = data.auditItems || [];
  planningLatest = data.planningJob || null;
  planResult = data.planResult || null;
  qualityResult = data.qualityResult || null;
  renderDiagnostic(data.job?.status === "error" ? data.job.diagnostic : null);
  renderRateLimit(data.job?.rateLimit);
  if (initial) {
    $("title").value = data.draft.title || ""; $("description").value = data.draft.description || "";
    const cfg = data.config || DEFAULTS, form = data.formOptions;
    $("faqCount").value = form?.faqCount ?? cfg.faqCount; $("specCount").value = form?.specCount ?? cfg.specCount;
    const models = [...$("model").options].map(option => option.value);
    const savedChoice = form?.modelChoice ?? cfg.model;
    const choice = MODEL_MIGRATIONS[savedChoice] || savedChoice;
    if (models.includes(choice) && choice !== "custom") $("model").value = choice;
    else $("model").value = "custom";
    const savedCustom = form?.customModel ?? (models.includes(cfg.model) ? "" : cfg.model);
    $("customModel").value = MODEL_MIGRATIONS[savedCustom] || savedCustom;
    $("customModel").hidden = $("model").value !== "custom";
    $("keyProvider").value=selectedProvider();
    initialized = true;
    for (const id of editableFields) $(id).disabled = false;
    $("draftHint").textContent = "Título, descrição e modelo são salvos automaticamente neste navegador.";
    busy(false);
    $("asinList").value = auditItems.map(item => item.asin).join("\n");
  }
  selectProviderState();
  renderAudit(auditItems);
  renderPlan(planResult);
  renderQuality(qualityResult);
  if (planningLatest) {
    const runningPlanning = planningLatest.status === "planning";
    setPlanningBusy(runningPlanning);
    planningStatus(planningLatest.message, runningPlanning ? "busy" : planningLatest.status === "error" ? "error" : "");
    if (planningLatest.rateLimit) renderRateLimit(planningLatest.rateLimit);
  } else setPlanningBusy(false);
  if (auditLatest) {
    const runningAudit = ["queued", "checking"].includes(auditLatest.status);
    setAuditBusy(runningAudit);
    auditStatus(auditLatest.message, runningAudit ? "busy" : auditLatest.status === "error" ? "error" : "");
  } else setAuditBusy(false);
  if (data.job) {
    const running = ["scanning", "generating", "filling"].includes(data.job.status);
    busy(running); status(data.job.message, running ? "busy" : data.job.status === "error" ? "error" : "");
    const version = `${data.job.id}:${data.job.status}:${data.job.report?.filled}:${Boolean(data.job.generated)}`;
    if (version !== renderedVersion) { render(data.job); renderedVersion = version; }
  }
}

$("form").addEventListener("submit", async event => {
  event.preventDefault(); if (locked || !initialized || keyBusy) return;
  if ($("apiKey").value.trim()) { status("Aplique a chave digitada antes de gerar. Clique em Aplicar e salvar chave.", "error"); $("apiKey").focus(); return; }
  if (!(selectedModel()==="auto/economico"?Object.values(keyStates).some(item=>item.saved):savedKey)) { status("Cadastre a API Key necessária antes de gerar.", "error"); $("keySettings").open = true; return; }
  clearTimeout(pollTimer); busy(true); renderDiagnostic(null); status("Iniciando…", "busy");
  try {
    const cfg = config();
    await persistDraft();
    await send("start", {tabId: await tabId(), title: $("title").value, description: $("description").value, config: cfg});
    $("results").hidden = true; renderedVersion = ""; await refresh();
  } catch (error) { busy(false); status(error.message, "error"); }
  finally { schedulePoll(); }
});

async function perform(action) {
  if (locked || !initialized || keyBusy) return;
  clearTimeout(pollTimer); busy(true); status(action === "scan" ? "Analisando campos da página…" : "Processando…", "busy");
  try {
    const result = await send(action, {tabId: await tabId(), config: rawConfig()}); busy(false);
    if (action === "scan") {
      render(latest, result);
      status(`${result.scan.entries.filter(e => e.found).length} de ${result.slots.length} campos identificados. Expanda os módulos ou use Mapear campos para os demais.`);
    } else if (action === "map") {
      status("O painel de associação foi aberto na página da Amazon."); window.close();
    } else { renderedVersion = ""; await refresh(); }
  } catch (error) { busy(false); status(error.message, "error"); }
  schedulePoll();
}
for (const id of ["scan", "map", "refill", "undo"]) $(id).onclick = () => perform(id);
$("cancel").onclick = async () => { try { await send("cancel"); status("Cancelando. Campos já preenchidos podem ser restaurados com Desfazer."); } catch (e) { status(e.message, "error"); } };

$("applyKey").onclick = async () => {
  if (locked || !initialized || keyBusy) return;
  keyBusy = true; busy(false);
  try {
    const result = await send("saveKey", {apiKey: $("apiKey").value,model:providerModel()});
    $("apiKey").value = ""; $("apiKey").type = "password"; $("toggleKey").textContent = "Mostrar";
    replaceMode = false;
    keyState(true, result.fingerprint);
    keyStates[$("keyProvider").value]={saved:true,fingerprint:result.fingerprint};
    status("API Key aplicada e salva neste navegador.");
  } catch (error) { status(error.message, "error"); }
  finally { keyBusy = false; busy(locked); }
};
$("forgetKey").onclick = async () => {
  if (locked || !initialized || keyBusy) return;
  keyBusy = true; busy(false);
  try {
    await send("forgetKey",{model:providerModel()});
    $("apiKey").value = ""; replaceMode = false;
    keyState(false);
    keyStates[$("keyProvider").value]={saved:false,fingerprint:null};
    status("API Key removida deste navegador.");
  } catch (error) { status(error.message, "error"); }
  finally { keyBusy = false; busy(locked); }
};
$("replaceKey").onclick = () => {
  if (locked || !initialized || keyBusy) return;
  replaceMode = true;
  $("apiKey").value = "";
  $("apiKey").type = "password"; $("toggleKey").textContent = "Mostrar";
  keyState(savedKey, savedFingerprint);
  $("apiKey").focus();
};
$("cancelReplace").onclick = () => {
  if (locked || !initialized || keyBusy) return;
  replaceMode = false;
  $("apiKey").value = "";
  keyState(savedKey, savedFingerprint);
};
$("apiKey").addEventListener("input", () => keyState(savedKey, savedFingerprint));

async function performCloudKey(action) {
  if(locked||!initialized||keyBusy)return; const passphrase=$("cloudPassphrase").value;
  if(action!=="cloudRemoveKey"&&passphrase.length<10){status("Digite uma senha de sincronização com pelo menos 10 caracteres.","error");return}
  keyBusy=true; busy(false);
  try{const result=await send(action,{...(action==="cloudRemoveKey"?{}:{passphrase}),model:providerModel()});$("cloudPassphrase").value="";
    if(action==="cloudSaveKey"){cloudKeyState(true,result.fingerprint);cloudKeyStates[$("keyProvider").value]={saved:true,fingerprint:result.fingerprint};status("API Key criptografada e salva no Chrome Sync.")}
    else if(action==="cloudUnlockKey"){keyState(true,result.fingerprint);keyStates[$("keyProvider").value]={saved:true,fingerprint:result.fingerprint};cloudKeyState(true,result.fingerprint);status("API Key desbloqueada neste computador.")}
    else{cloudKeyState(false,null);cloudKeyStates[$("keyProvider").value]={saved:false,fingerprint:null};status("Cópia da nuvem removida; a chave local foi mantida.")}
  }catch(error){status(error.message,"error")}finally{keyBusy=false;busy(locked)}
}
$("cloudSaveKey").onclick=()=>performCloudKey("cloudSaveKey");
$("cloudUnlockKey").onclick=()=>performCloudKey("cloudUnlockKey");
$("cloudRemoveKey").onclick=()=>performCloudKey("cloudRemoveKey");
$("copyDiagnostic").onclick = async () => {
  const text = $("diagnosticText").value;
  if (!text) return;
  try { await navigator.clipboard.writeText(text); $("copyDiagnostic").textContent = "Diagnóstico copiado"; }
  catch {
    $("diagnosticText").focus(); $("diagnosticText").select();
    $("copyDiagnostic").textContent = "Texto selecionado. Pressione Ctrl+C";
  }
};
$("toggleKey").onclick = () => {
  const show = $("apiKey").type === "password"; $("apiKey").type = show ? "text" : "password";
  $("toggleKey").textContent = show ? "Ocultar" : "Mostrar"; $("toggleKey").setAttribute("aria-label", show ? "Ocultar chave" : "Mostrar chave");
};

$("export").onclick = () => {
  if (!latest?.generated) return;
  const lines = ["TEXTOS A+ PREMIUM", "", ...latest.slots.flatMap(s => [s.label, latest.generated.texts[s.key] || "[Sem informação suficiente]", ""]),
    "OBSERVAÇÕES", ...(latest.generated.notes || [])];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {type: "text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "textos-aplus-premium.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

$("asinList").addEventListener("input", () => {
  const count = normalizeAsins($("asinList").value).length;
  $("asinHint").textContent = `${count} ASIN${count === 1 ? "" : "s"} válido${count === 1 ? "" : "s"}. Máximo de 250 por verificação.`;
  if (initialized && !auditLocked) void send("auditSaveList", {text: $("asinList").value}).catch(() => {});
});

$("auditCapture").onclick = async () => {
  if (auditLocked || locked || !initialized) return;
  setAuditBusy(true); auditStatus("Capturando ASINs carregados nesta página…", "busy");
  try {
    const result = await send("auditCapture", {tabId: await tabId()});
    auditItems = result.items || [];
    $("asinList").value = auditItems.map(item => item.asin).join("\n");
    renderAudit(auditItems);
    auditStatus(result.found
      ? `${result.found} ASIN${result.found === 1 ? "" : "s"} encontrado${result.found === 1 ? "" : "s"} na página. A lista foi atualizada.`
      : "Nenhum ASIN foi encontrado. Abra Gerenciar todos os produtos, aguarde a lista carregar e tente novamente.", result.found ? "" : "error");
  } catch (error) { auditStatus(error.message, "error"); }
  finally { setAuditBusy(false); }
};

$("auditRun").onclick = async () => {
  if (auditLocked || locked || !initialized) return;
  const asins = normalizeAsins($("asinList").value);
  if (!asins.length) { auditStatus("Cole pelo menos um ASIN ou capture os produtos da página.", "error"); $("asinList").focus(); return; }
  setAuditBusy(true); auditStatus(`Preparando ${asins.length} produto${asins.length === 1 ? "" : "s"}…`, "busy");
  try {
    await send("auditStart", {text: asins.join("\n")});
    $("auditSection").open = true;
    await refresh();
  } catch (error) { auditStatus(error.message, "error"); setAuditBusy(false); }
};

$("auditCancel").onclick = async () => {
  try { await send("auditCancel"); auditStatus("Cancelando verificação…", "busy"); }
  catch (error) { auditStatus(error.message, "error"); }
};

$("auditClear").onclick = async () => {
  if (auditLocked || locked || !initialized) return;
  try {
    await send("auditClear"); auditItems = []; auditLatest = null; $("asinList").value = "";
    renderAudit([]); auditStatus("Lista e resultados removidos.");
  } catch (error) { auditStatus(error.message, "error"); }
};

$("auditFilter").addEventListener("change", () => renderAudit());

$("auditExport").onclick = () => {
  if (!auditItems.length) return;
  const cell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [["ASIN", "SKU", "Produto", "Situação", "Detalhes", "Link"], ...auditItems.map(item =>
    [item.asin, item.sku || "", item.title || "", auditLabel(item), item.detail || "", item.publicUrl || `https://www.amazon.com.br/dp/${item.asin}`])]
    .map(row => row.map(cell).join(";"));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "auditoria-produtos-aplus.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

$("planningRun").onclick = async () => {
  if (planningLocked || locked || !initialized) return;
  if (!(selectedModel()==="auto/economico"?Object.values(keyStates).some(item=>item.saved):savedKey)) { planningStatus("Cadastre a API Key necessária antes de criar o planejamento.", "error"); $("keySettings").open = true; return; }
  if (!$("title").value.trim() || !$("description").value.trim()) { planningStatus("Preencha o título e a descrição do produto acima.", "error"); return; }
  setPlanningBusy(true); planningStatus("Preparando o planejamento…", "busy"); renderDiagnostic(null);
  try {
    const cfg = config(); await persistDraft();
    await send("planningStart", {title: $("title").value, description: $("description").value, config: cfg});
    $("planningSection").open = true; await refresh();
  } catch (error) { planningStatus(error.message, "error"); setPlanningBusy(false); }
};

$("planningCancel").onclick = async () => {
  try { await send("planningCancel"); planningStatus("Cancelando planejamento…", "busy"); }
  catch (error) { planningStatus(error.message, "error"); }
};

$("qualityRun").onclick = async () => {
  if (planningLocked || locked || !initialized) return;
  try {
    qualityResult = await send("qualityCheck"); renderQuality(qualityResult);
    $("planningSection").open = true; planningStatus(`Nota de qualidade calculada: ${qualityResult.score}/100.`);
  } catch (error) { planningStatus(error.message, "error"); }
};

$("planningClear").onclick = async () => {
  if (planningLocked || locked || !initialized) return;
  try {
    await send("planningClear"); planResult = null; qualityResult = null; planningLatest = null;
    renderPlan(null); renderQuality(null); $("planningBadge").textContent = "Novo"; $("planningBadge").className = "key-status";
    planningStatus("Planejamento e avaliação removidos.");
  } catch (error) { planningStatus(error.message, "error"); }
};

$("planningExport").onclick = () => {
  if (!planResult) return;
  const d = planResult.diagnosis || {};
  const lines = ["PLANEJAMENTO A+", "", `Categoria: ${d.category || ""}`, `Público: ${d.audience || ""}`,
    `Problema principal: ${d.main_problem || ""}`, `Benefício central: ${d.central_benefit || ""}`, `Resumo: ${d.summary || ""}`, "",
    "INFORMAÇÕES AUSENTES", ...(planResult.missingInformation || []).flatMap(item => [`${item.field}: ${item.reason}`]), "",
    "CARACTERÍSTICAS E BENEFÍCIOS", ...(planResult.featureBenefits || []).flatMap(item => [item.feature, `Benefício: ${item.benefit}`, `Base: ${item.evidence}`, ""]),
    "BRIEFINGS DE IMAGENS", ...(planResult.imageBriefs || []).flatMap(item => [item.module, `Tamanho: ${item.size}`, `Objetivo: ${item.goal}`,
      `Cena: ${item.scene}`, `Composição: ${item.composition}`, `Prompt: ${item.prompt}`, ""]),
    "OBSERVAÇÕES", ...(planResult.notes || [])];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {type: "text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "planejamento-aplus.txt";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

$("planningCopyAll").onclick = async () => {
  const prompt = buildFullImagePrompt(planResult, $("title").value);
  if (!prompt) { planningStatus("Crie o planejamento antes de copiar os prompts.", "error"); return; }
  try {
    await navigator.clipboard.writeText(prompt);
    $("planningCopyAll").textContent = "Prompt completo copiado";
    planningStatus("Prompt das 8 imagens copiado. Cole tudo de uma vez na IA.");
    setTimeout(() => { $("planningCopyAll").textContent = "Copiar prompt completo"; }, 2500);
  } catch {
    planningStatus("Não foi possível copiar. Use Baixar plano como alternativa.", "error");
  }
};

$("openChangelog").onclick = event => {
  event.preventDefault();
  chrome.tabs.create({url: chrome.runtime.getURL("changelog.html")});
};

$("model").addEventListener("change", () => { $("customModel").hidden = $("model").value !== "custom"; if (!$("customModel").hidden) $("customModel").focus(); else if(selectedModel()!=="auto/economico"){ $("keyProvider").value=selectedProvider();selectProviderState();} });
$("keyProvider").addEventListener("change",selectProviderState);
async function persistDraft() {
  if (!initialized) return;
  const revision = ++draftRevision;
  $("draftHint").textContent = "Salvando dados…";
  try {
    await send("draft", {title: $("title").value, description: $("description").value, config: rawConfig(),
      formOptions: {modelChoice: $("model").value, customModel: $("customModel").value,
        faqCount: $("faqCount").value, specCount: $("specCount").value}});
    if (revision === draftRevision) $("draftHint").textContent = "Dados salvos neste navegador.";
  } catch (error) {
    if (revision === draftRevision) $("draftHint").textContent = "Não foi possível salvar os dados. Reabra a extensão e tente novamente.";
    throw error;
  }
}
for (const id of ["title", "description", "model", "customModel", "faqCount", "specCount"]) {
  $(id).addEventListener("input", () => { void persistDraft().catch(() => {}); });
}
for (const id of ["model", "faqCount", "specCount"]) $(id).addEventListener("change", () => { void persistDraft().catch(() => {}); });
function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try { if (locked || auditLocked || planningLocked || ["scanning", "generating", "filling"].includes(latest?.status) || ["queued", "checking"].includes(auditLatest?.status) || planningLatest?.status === "planning") await refresh(); }
    catch (error) { status(error.message, "error"); busy(false); }
    schedulePoll();
  }, 800);
}

async function initialLoad(attempt = 1) {
  try {
    await refresh(true);
    $("retryLoad").hidden = true;
    schedulePoll();
  } catch (error) {
    if (attempt < 3) {
      status(`Não foi possível carregar os dados (tentativa ${attempt}). Tentando novamente…`, "busy");
      await new Promise(r => setTimeout(r, 700 * attempt));
      return initialLoad(attempt + 1);
    }
    status(`${error.message} Clique em Tentar novamente para recarregar.`, "error");
    $("retryLoad").hidden = false;
  }
}

$("retryLoad").onclick = () => {
  $("retryLoad").hidden = true;
  status("Recarregando dados…", "busy");
  initialLoad();
};

for (const id of editableFields) $(id).disabled = true;
$("asinList").disabled = true;
busy(false);
initialLoad();
