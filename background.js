import {DEFAULTS, settings, isSellerURL, isAplusEditorURL, safeSellerURL, makeSlots} from "./shared.js";
import {generateTexts} from "./openai.js";
import {writeAmazonField} from "./page-writer.js";
import {normalizeAsins, inspectProductHTML, scanSellerCatalogPage} from "./catalog-audit.js";
import {generatePlan, scoreAplus} from "./planning.js";
import {createProject, factualDescription, normalizeAsin, validateProject} from "./projects.js";
import {isPanelSender} from "./panel-connection.js";
import {captureProductPage, matchesProductURL} from "./product-page.js";
import {encryptApiKey, decryptApiKey, isCloudKeyRecord} from "./key-sync.js";
import {providerForModel, routesFor} from "./providers.js";

// Somente páginas confiáveis da extensão leem a sessão. A chave nunca vai ao content script.
const ready = Promise.all([
  chrome.storage.session.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"}),
  // Impede que content scripts leiam a chave persistida; apenas popup e worker acessam.
  chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"}),
  chrome.storage.sync?.setAccessLevel?.({accessLevel: "TRUSTED_CONTEXTS"})
]);
let active = null;
let auditActive = null;
let planningActive = null;
let projectActive = null;
let stateQueue = Promise.resolve();
let draftQueue = Promise.resolve();
const activeStates = new Set(["scanning", "generating", "filling"]);
const auditActiveStates = new Set(["queued", "checking"]);
const planningActiveStates = new Set(["planning"]);
const EXTENSION_VERSION = chrome.runtime.getManifest?.().version || "1.5.3";
const PAGE_CHANNEL = `aplus-page-v${EXTENSION_VERSION}`;

async function providerKeys(model) {
  const saved=await chrome.storage.local.get(["apiKeys","apiKey"]), keys={...(saved.apiKeys||{})};
  if(saved.apiKey){const provider=providerForModel(model)==="auto"?"gemini":providerForModel(model);if(!keys[provider])keys[provider]=saved.apiKey}
  return keys;
}
async function routed(model,purpose,onStage,operation) {
  const routes=routesFor(model,await providerKeys(model),purpose);
  if(!routes.length)throw new Error(model==="auto/economico"?"Cadastre ao menos uma API Key para usar o modo automático.":"Cadastre a API Key do provedor selecionado.");
  let last;
  for(let index=0;index<routes.length;index++){
    const route=routes[index];
    try{return await operation(route.apiKey,route.model,message=>onStage?.(`${message} · ${route.model}`))}
    catch(error){last=error;if(/cancelad/i.test(error.message||""))throw error;if(index+1<routes.length)onStage?.(`Modelo indisponível. Alternando para ${routes[index+1].model}…`)}
  }
  throw last;
}

async function readProjects() {
  const saved = await chrome.storage.local.get(["projects", "activeProjectId"]);
  return {projects: Array.isArray(saved.projects) ? saved.projects.map(item => createProject(item)) : [],
    activeProjectId: String(saved.activeProjectId || "")};
}

async function writeProjects(projects, activeProjectId = "") {
  const clean = projects.slice(0, 500).map(item => createProject(item));
  await chrome.storage.local.set({projects: clean, activeProjectId});
  return {projects: clean, activeProjectId};
}

async function upsertProject(input) {
  const saved = await readProjects();
  const next = createProject({...input, updatedAt: Date.now()});
  const index = saved.projects.findIndex(item => item.id === next.id);
  if (index >= 0) saved.projects[index] = next; else saved.projects.unshift(next);
  return writeProjects(saved.projects, next.id);
}

async function importProjectProduct(asin, signal) {
  const normalized = normalizeAsin(asin);
  if (!normalized) throw new Error("Informe um ASIN válido com 10 caracteres.");
  const url = `https://www.amazon.com.br/dp/${normalized}`;
  const response = await fetch(url, {credentials: "omit", redirect: "follow", signal,
    headers: {Accept: "text/html,application/xhtml+xml"}});
  const html = await response.text();
  const audit = inspectProductHTML(html, response.status);
  if (["blocked", "unavailable", "error"].includes(audit.status)) throw new Error(audit.detail);
  const decode = value => String(value || "").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ").trim();
  const title = decode((/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i.exec(html) ||
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html) || [])[1]);
  const bulletArea = (/<div[^>]+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i.exec(html) || [])[1] || "";
  const bullets = [...bulletArea.matchAll(/<span[^>]+class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map(match => decode(match[1])).filter(Boolean).slice(0, 10);
  const description = bullets.join("\n");
  return {asin: normalized, title, description, publicUrl: url, audit};
}

async function generateProjectDraft(project, signal, onStage = () => {}) {
  const next = createProject(project);
  const cfg = settings(next.config);
  const slots = makeSlots(cfg);
  const description = factualDescription(next);
  if (!next.title) throw new Error("Informe o título do produto.");
  if (!description) throw new Error("Informe a descrição ou ao menos um fato confirmado.");
  const generated = await routed(cfg.model,"texts",onStage,(apiKey,model,routedStage)=>generateTexts({apiKey,title:next.title,description,model,slots,signal,onStage:routedStage}));
  next.slots = slots; next.texts = generated.texts; next.notes = generated.notes;
  next.quality = scoreAplus({slots, texts: next.texts, title: next.title, description});
  next.approved = false; next.status = "review"; next.error = ""; next.updatedAt = Date.now();
  return next;
}

function repetitionRevisionPrompt(project, slots, targetKeys, quality) {
  const targets = new Set(targetKeys);
  const pairs = (quality.repetitions || []).filter(item => targets.has(item.rightKey))
    .map(item => `- ${item.leftLabel} x ${item.rightLabel}: ${item.score}% de semelhança.`).join("\n");
  const previous = slots.filter(slot => targets.has(slot.key)).map(slot =>
    `${slot.label}: ${String(project.texts?.[slot.key] || "").slice(0, 800)}`).join("\n");
  const protectedTexts = slots.filter(slot => !targets.has(slot.key) && ["headline", "body"].includes(slot.role) && project.texts?.[slot.key])
    .map(slot => `${slot.label}: ${String(project.texts[slot.key]).slice(0, 800)}`).join("\n");
  return `CORREÇÃO SELETIVA DE REPETIÇÕES
Reescreva somente as chaves solicitadas no schema. Os demais campos serão preservados.
Cada novo texto deve ter um ângulo, benefício ou uso diferente dos textos protegidos e também dos outros campos reescritos.
Não repita o nome completo do produto apenas para preencher espaço. Use o nome quando necessário e varie a construção naturalmente.
Mantenha somente fatos presentes no título, descrição ou ficha factual. Não invente materiais, medidas, usos, compatibilidades ou promessas.

PARES CONFIRMADOS PELO REVISOR:
${pairs || "- Repetição lexical entre campos equivalentes."}

TEXTOS QUE SERÃO SUBSTITUÍDOS:
${previous}

TEXTOS PROTEGIDOS, QUE NÃO PODEM SER COPIADOS OU ALTERADOS:
${protectedTexts}

Retorne somente o JSON exigido, com todos os campos solicitados no schema.`;
}

async function startProjectQueue(ids) {
  if (projectActive) throw new Error("Uma geração de projetos já está em andamento.");
  if (active || planningActive) throw new Error("Aguarde a operação atual terminar.");
  const state = await readProjects();
  const selected = [...new Set(ids || [])].slice(0, 50).filter(id => state.projects.some(item => item.id === id));
  if (!selected.length) throw new Error("Selecione ao menos um projeto.");
  const task = {id: crypto.randomUUID(), controller: new AbortController()}; projectActive = task;
  await chrome.storage.session.set({projectJob: {id: task.id, status: "queued", total: selected.length, completed: 0,
    message: `Preparando ${selected.length} projeto(s)…`, updatedAt: Date.now()}});
  void (async () => {
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
    try {
      for (let index = 0; index < selected.length; index++) {
        if (task.controller.signal.aborted) throw new Error("Geração em massa cancelada.");
        let current = await readProjects();
        const projectIndex = current.projects.findIndex(item => item.id === selected[index]);
        if (projectIndex < 0) continue;
        if(current.projects[projectIndex].approved&&Object.keys(current.projects[projectIndex].texts||{}).length){
          await chrome.storage.session.set({projectJob:{id:task.id,status:"generating",total:selected.length,completed:index+1,message:`${index+1} de ${selected.length}: projeto aprovado reaproveitado sem gastar tokens.`,updatedAt:Date.now()}});continue;
        }
        current.projects[projectIndex] = {...current.projects[projectIndex], status: "generating", error: "", updatedAt: Date.now()};
        await writeProjects(current.projects, current.activeProjectId);
        await chrome.storage.session.set({projectJob: {id: task.id, status: "generating", total: selected.length, completed: index,
          currentId: selected[index], message: `Gerando ${index + 1} de ${selected.length}: ${current.projects[projectIndex].title || current.projects[projectIndex].asin}`, updatedAt: Date.now()}});
        try {
          const generated = await generateProjectDraft(current.projects[projectIndex], task.controller.signal, message =>
            chrome.storage.session.set({projectJob: {id: task.id, status: "generating", total: selected.length, completed: index,
              currentId: selected[index], message, updatedAt: Date.now()}}).catch(() => {}));
          current = await readProjects();
          const freshIndex = current.projects.findIndex(item => item.id === selected[index]);
          if (freshIndex >= 0) current.projects[freshIndex] = generated;
          await writeProjects(current.projects, current.activeProjectId);
        } catch (error) {
          current = await readProjects();
          const freshIndex = current.projects.findIndex(item => item.id === selected[index]);
          if (freshIndex >= 0) current.projects[freshIndex] = {...current.projects[freshIndex], status: "error", error: error.message, updatedAt: Date.now()};
          await writeProjects(current.projects, current.activeProjectId);
        }
        await chrome.storage.session.set({projectJob: {id: task.id, status: "generating", total: selected.length, completed: index + 1,
          message: `${index + 1} de ${selected.length} projeto(s) concluído(s).`, updatedAt: Date.now()}});
      }
      await chrome.storage.session.set({projectJob: {id: task.id, status: "done", total: selected.length, completed: selected.length,
        message: "Fila concluída. Revise e aprove cada produto individualmente.", updatedAt: Date.now()}});
    } catch (error) {
      await chrome.storage.session.set({projectJob: {id: task.id, status: task.controller.signal.aborted ? "cancelled" : "error",
        total: selected.length, message: error.message, updatedAt: Date.now()}});
    } finally { clearInterval(keepAlive); if (projectActive === task) projectActive = null; }
  })();
  return {started: true, total: selected.length};
}

async function planningState(patch) {
  const old = (await chrome.storage.session.get("planningJob")).planningJob || {};
  const planningJob = {...old, ...patch, updatedAt: Date.now()};
  await chrome.storage.session.set({planningJob});
  return planningJob;
}

async function runPlanning(task, request) {
  const keepAlive = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
  try {
    const cfg = settings(request.config);
    await planningState({id: task.id, status: "planning", message: "Analisando o produto e criando o planejamento…"});
    const planResult = await routed(cfg.model,"planning",message=>planningState({message}).catch(()=>{}),(apiKey,model,onStage)=>generatePlan({apiKey,title:request.title.trim(),description:request.description.trim(),model,signal:task.controller.signal,onStage,onRateLimit:rateLimit=>planningState({rateLimit}).catch(()=>{})}));
    if (task.controller.signal.aborted) throw new Error("Operação cancelada.");
    await chrome.storage.local.set({planResult});
    await planningState({status: "done", message: "Planejamento concluído. Revise as informações e os briefings."});
  } catch (error) {
    await planningState({status: task.controller.signal.aborted ? "cancelled" : "error", message: error.message,
      diagnostic: task.controller.signal.aborted ? null : error.diagnostic || null});
  } finally {
    clearInterval(keepAlive);
    if (planningActive === task) planningActive = null;
  }
}

async function startPlanning(message) {
  if (planningActive) throw new Error("Um planejamento já está em andamento.");
  if (active) throw new Error("Aguarde a geração e o preenchimento terminarem.");
  if (typeof message.title !== "string" || !message.title.trim()) throw new Error("Informe o título do produto.");
  if (typeof message.description !== "string" || !message.description.trim()) throw new Error("Informe a descrição e as informações reais do produto.");
  const task = {id: crypto.randomUUID(), controller: new AbortController()};
  planningActive = task;
  await chrome.storage.session.set({planningJob: {id: task.id, status: "planning",
    message: "Preparando o planejamento…", updatedAt: Date.now()}});
  void runPlanning(task, message);
  return {started: true};
}

async function auditState(patch) {
  const old = (await chrome.storage.session.get("auditJob")).auditJob || {};
  const auditJob = {...old, ...patch, updatedAt: Date.now()};
  await chrome.storage.session.set({auditJob});
  return auditJob;
}

function mergeAuditItems(oldItems, incoming) {
  const map = new Map((Array.isArray(oldItems) ? oldItems : []).map(item => [item.asin, item]));
  for (const item of incoming) {
    if (!/^B[0-9A-Z]{9}$/.test(item.asin)) continue;
    const old = map.get(item.asin) || {};
    map.set(item.asin, {...old, ...item, sku: item.sku || old.sku || "", title: item.title || old.title || "",
      sellerStatus: item.sellerStatus === "unknown" ? old.sellerStatus || "unknown" : item.sellerStatus || old.sellerStatus || "unknown"});
  }
  return [...map.values()].slice(0, 250);
}

async function saveAuditList(text) {
  const asins = normalizeAsins(text);
  const saved = await chrome.storage.local.get("auditItems");
  const old = new Map((saved.auditItems || []).map(item => [item.asin, item]));
  const auditItems = asins.map(asin => old.get(asin) || {asin, sku: "", title: "", sellerStatus: "unknown", status: "queued"});
  await chrome.storage.local.set({auditItems});
  return {items: auditItems};
}

async function captureAuditItems(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { throw new Error("A aba foi fechada. Abra Gerenciar todos os produtos no Seller Central."); }
  if (!isSellerURL(tab.url)) throw new Error("Abra Gerenciar todos os produtos no Amazon Seller Central e clique na extensão.");
  let pageResult;
  try {
    const injected = await chrome.scripting.executeScript({target: {tabId}, world: "ISOLATED", func: scanSellerCatalogPage});
    pageResult = injected[0]?.result;
  } catch { throw new Error("Não foi possível ler os produtos desta página. Recarregue o Seller Central e tente novamente."); }
  if (!pageResult || pageResult.url !== tab.url) throw new Error("A página mudou durante a captura. Tente novamente.");
  const saved = await chrome.storage.local.get("auditItems");
  const auditItems = mergeAuditItems(saved.auditItems, pageResult.products || []);
  await chrome.storage.local.set({auditItems});
  return {found: (pageResult.products || []).length, items: auditItems};
}

async function inspectPublicProduct(asin, signal) {
  const url = `https://www.amazon.com.br/dp/${encodeURIComponent(asin)}`;
  try {
    const response = await fetch(url, {method: "GET", credentials: "omit", redirect: "follow", signal,
      headers: {Accept: "text/html,application/xhtml+xml"}});
    const html = await response.text();
    return {...inspectProductHTML(html, response.status), checkedAt: Date.now(), publicUrl: url};
  } catch (error) {
    if (signal.aborted) throw new Error("Verificação cancelada.");
    return {status: "error", detail: "Falha de conexão ao consultar a página pública.", checkedAt: Date.now(), publicUrl: url};
  }
}

async function runAudit(task, items) {
  const keepAlive = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
  let current = items.map(item => ({...item, status: "queued"}));
  try {
    await chrome.storage.local.set({auditItems: current});
    await auditState({id: task.id, status: "checking", total: current.length, completed: 0,
      message: `Verificando 0 de ${current.length} produtos…`});
    for (let index = 0; index < current.length; index++) {
      if (task.controller.signal.aborted) throw new Error("Verificação cancelada.");
      current[index] = {...current[index], status: "checking"};
      await chrome.storage.local.set({auditItems: current});
      const result = await inspectPublicProduct(current[index].asin, task.controller.signal);
      current[index] = {...current[index], ...result};
      await chrome.storage.local.set({auditItems: current});
      await auditState({status: "checking", completed: index + 1,
        message: `Verificando ${index + 1} de ${current.length} produtos…`});
      if (index + 1 < current.length) await new Promise(resolve => setTimeout(resolve, 350));
    }
    const missing = current.filter(item => item.status === "not_published").length;
    await auditState({status: "done", completed: current.length,
      message: `Verificação concluída: ${missing} produto${missing === 1 ? "" : "s"} sem A+ publicado.`});
  } catch (error) {
    await auditState({status: task.controller.signal.aborted ? "cancelled" : "error", message: error.message});
  } finally {
    clearInterval(keepAlive);
    if (auditActive === task) auditActive = null;
  }
}

async function startAudit(message) {
  if (auditActive) throw new Error("A verificação de A+ já está em andamento.");
  const asins = normalizeAsins(message.text);
  if (!asins.length) throw new Error("Cole pelo menos um ASIN ou capture os produtos da página.");
  const saved = await chrome.storage.local.get("auditItems");
  const old = new Map((saved.auditItems || []).map(item => [item.asin, item]));
  const items = asins.map(asin => old.get(asin) || {asin, sku: "", title: "", sellerStatus: "unknown"});
  const task = {id: crypto.randomUUID(), controller: new AbortController()};
  auditActive = task;
  await chrome.storage.session.set({auditJob: {id: task.id, status: "queued", total: items.length, completed: 0,
    message: `Preparando ${items.length} produto${items.length === 1 ? "" : "s"}…`, updatedAt: Date.now()}});
  void runAudit(task, items);
  return {started: true, total: items.length};
}

function saveDraft(message) {
  // Serializa edições rápidas: uma gravação antiga nunca termina sobre a nova.
  // Esta fila pertence ao worker e independe da duração do popup.
  const operation = draftQueue.then(async () => {
    const values = {draft: {title: String(message.title || "").slice(0, 1000), description: String(message.description || "").slice(0, 18000)}};
    try { values.config = settings(message.config); }
    catch { /* Um nome de modelo ainda incompleto não impede salvar o produto. */ }
    if (message.formOptions && typeof message.formOptions === "object") {
      values.formOptions = Object.fromEntries(["modelChoice", "customModel", "faqCount", "specCount"]
        .map(key => [key, String(message.formOptions[key] ?? "").slice(0, 100)]));
    }
    await chrome.storage.local.set(values);
    return {};
  });
  draftQueue = operation.catch(() => {});
  return operation;
}

function state(patch) {
  const operation = stateQueue.then(async () => {
    const old = (await chrome.storage.session.get("job")).job || {};
    const job = {...old, ...patch, updatedAt: Date.now()};
    await chrome.storage.session.set({job});
    return job;
  });
  stateQueue = operation.catch(() => {});
  return operation;
}

async function tabById(id, expectedURL) {
  let tab;
  try { tab = await chrome.tabs.get(id); } catch { throw new Error("A aba foi fechada. Abra a edição do A+ no Seller Central."); }
  if (!isSellerURL(tab.url)) throw new Error("Abra uma página de edição do A+ no Amazon Seller Central e clique na extensão.");
  if (expectedURL && tab.url !== expectedURL) throw new Error("A aba mudou de página. Gere novamente na edição correta.");
  return tab;
}

function diagnosticStep(trace, id, label, status, detail) {
  trace?.push({id, label, status, detail: String(detail || "").slice(0, 1200)});
}

async function connect(tabId, trace = null) {
  let tab = await tabById(tabId);
  let waitedForLoad = false;
  if (tab.status === "loading") {
    waitedForLoad = true;
    for (let attempt = 0; attempt < 20 && tab.status === "loading"; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      tab = await tabById(tabId);
    }
  }
  if (tab.status === "loading") {
    diagnosticStep(trace, "page_load", "Carregamento da aba", "error", "A Amazon não terminou de carregar em 5 segundos.");
    throw new Error("A edição do A+ ainda está carregando. Aguarde a página terminar e clique em preencher novamente.");
  }
  diagnosticStep(trace, "page_load", "Carregamento da aba", "ok", waitedForLoad ? "A aba terminou de carregar durante o diagnóstico." : "Documento principal carregado.");

  // Nas páginas abertas depois da instalação, o manifesto já carrega estes scripts.
  // A injeção abaixo recupera apenas abas que estavam abertas antes da atualização.
  try {
    const pong = await chrome.tabs.sendMessage(tabId, {channel: PAGE_CHANNEL, action: "ping"});
    if (pong?.ok && pong.data?.ready && pong.data.version === EXTENSION_VERSION) {
      const marker = await chrome.scripting.executeScript({target: {tabId}, world: "ISOLATED", func: () => location.href});
      diagnosticStep(trace, "connector", "Conector da extensão", "ok", `Conector ${pong.data.version} respondeu na aba.`);
      return {tabId, url: tab.url, documentId: marker[0]?.documentId};
    }
  } catch { /* A aba pode ser anterior à instalação ou à atualização. */ }

  try {
    const injected = await chrome.scripting.executeScript({target: {tabId}, world: "ISOLATED", files: ["content-engine.js", "content.js"]});
    const documentId = injected[0]?.documentId;
    if (!documentId) throw new Error("Documento não identificado.");
    const pong = await chrome.tabs.sendMessage(tabId, {channel: PAGE_CHANNEL, action: "ping"}, {documentId});
    if (!pong?.ok || !pong.data?.ready || pong.data.version !== EXTENSION_VERSION) {
      throw new Error("O conector injetado não confirmou a versão atual.");
    }
    diagnosticStep(trace, "connector_recovery", "Recuperação do conector", "ok", `Conector ${pong.data.version} carregado sem recarregar a página.`);
    return {tabId, url: tab.url, documentId};
  } catch (error) {
    const detail = String(error?.message || "");
    diagnosticStep(trace, "connector_recovery", "Recuperação do conector", "error", detail || "O Chrome recusou a injeção do conector.");
    if (/fetching the script|could not load|cannot access|missing host permission/i.test(detail)) {
      throw new Error("A aba da Amazon foi aberta antes desta versão da extensão. Recarregue a edição A+ uma vez, aguarde terminar e clique em preencher novamente.");
    }
    throw new Error("Não foi possível conectar à edição A+. Recarregue a aba do Seller Central, aguarde o carregamento e tente novamente.");
  }
}

async function page(target, action, data = {}) {
  await tabById(target.tabId, target.url);
  let response;
  try {
    response = await chrome.tabs.sendMessage(target.tabId, {channel: PAGE_CHANNEL, action, ...data}, {documentId: target.documentId});
  } catch { throw new Error("A edição foi recarregada ou está inacessível. Abra a extensão novamente."); }
  if (!response?.ok) throw new Error(response?.error || "A página não respondeu.");
  return response.data;
}

function finishFillDiagnostic(report) {
  const hasError = report.checks.some(check => check.status === "error");
  const hasWarning = report.checks.some(check => check.status === "warning");
  report.status = hasError ? "error" : hasWarning ? "warning" : "ok";
  const priority = ["seller_tabs", "editor_tab", "editor_url", "connector_failure", "connector_recovery", "page_diagnostic",
    "amazon_access", "module_render", "fields", "modules", "async_loading", "content", "approval", "project"];
  const preferred = status => priority.map(id => report.checks.find(check => check.id === id && check.status === status)).find(Boolean)
    || report.checks.find(check => check.status === status);
  const failed = preferred("error");
  const warning = preferred("warning");
  report.summary = hasError ? "O preenchimento está bloqueado." : hasWarning ? "A conexão funciona, mas há pontos para revisar." : "A aba está pronta para o preenchimento.";
  report.recommendation = failed?.detail || warning?.detail || "Volte ao Studio e use Preencher aba da Amazon aberta.";
  return report;
}

async function diagnoseProjectFill(message) {
  const project = createProject(message.project || {});
  const cfg = settings(project.config);
  const slots = project.slots?.length ? project.slots : makeSlots(cfg);
  const checks = [];
  const report = {
    version: EXTENSION_VERSION,
    generatedAt: new Date().toISOString(),
    status: "error",
    summary: "Diagnóstico incompleto.",
    recommendation: "Execute novamente.",
    checks,
    metrics: {sellerTabs: 0, editorTabs: 0, expectedFields: slots.length, foundFields: 0, candidates: 0, moduleCounts: {}},
    target: null,
    warnings: []
  };

  const filledTexts = slots.filter(slot => String(project.texts?.[slot.key] || "").trim()).length;
  diagnosticStep(checks, "project", "Projeto selecionado", project.id ? "ok" : "error",
    project.id ? `${project.asin || "Sem ASIN"} · ${filledTexts} de ${slots.length} textos com conteúdo.` : "Nenhum projeto foi selecionado no Studio.");
  diagnosticStep(checks, "approval", "Aprovação do projeto", project.approved && project.status === "approved" ? "ok" : "warning",
    project.approved && project.status === "approved" ? "Projeto aprovado para preenchimento." : "O diagnóstico pode continuar, mas é necessário aprovar o projeto antes de preencher.");
  diagnosticStep(checks, "content", "Textos disponíveis", filledTexts ? "ok" : "error",
    filledTexts ? `${filledTexts} campo(s) possuem texto salvo.` : "Gere ou informe os textos A+ antes do preenchimento.");

  const ids = [...new Set((Array.isArray(message.tabIds) ? message.tabIds : []).filter(Number.isSafeInteger))].slice(0, 30);
  const tabs = [];
  for (const id of ids) {
    try {
      const tab = await chrome.tabs.get(id);
      if (isSellerURL(tab.url)) tabs.push(tab);
    } catch { /* Aba fechada entre a consulta do painel e o diagnóstico. */ }
  }
  const editors = tabs.filter(tab => isAplusEditorURL(tab.url));
  report.metrics.sellerTabs = tabs.length;
  report.metrics.editorTabs = editors.length;
  diagnosticStep(checks, "seller_tabs", "Abas do Seller Central", tabs.length ? "ok" : "error",
    tabs.length ? `${tabs.length} aba(s) autorizada(s) encontrada(s) nesta janela.` : "Nenhuma aba do Seller Central foi encontrada nesta janela.");
  diagnosticStep(checks, "editor_tab", "Aba de edição A+ Premium", editors.length ? "ok" : "error",
    editors.length ? `${editors.length} editor(es) A+ Premium encontrado(s).` : "Há aba da Amazon, mas nenhuma está na página de edição A+ Premium. Abra o conteúdo do produto no editor A+ Premium e tente novamente.");
  if (!editors.length) return finishFillDiagnostic(report);
  if (editors.length > 1)
    diagnosticStep(checks, "multiple_editors", "Mais de um editor aberto", "warning", "O Studio usará o editor acessado mais recentemente. Para eliminar dúvida sobre o produto, deixe aberta somente a edição que deseja preencher.");

  editors.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const tab = editors[0];
  report.target = {tabId: tab.id, url: safeSellerURL(tab.url), status: tab.status || "desconhecido"};
  diagnosticStep(checks, "editor_url", "URL do editor", "ok", safeSellerURL(tab.url));

  const connectionTrace = [];
  let target;
  try {
    target = await connect(tab.id, connectionTrace);
    checks.push(...connectionTrace);
  } catch (error) {
    checks.push(...connectionTrace);
    if (!connectionTrace.some(check => check.status === "error"))
      diagnosticStep(checks, "connector_failure", "Conexão com a aba", "error", error.message);
    return finishFillDiagnostic(report);
  }

  let pageReport;
  try {
    pageReport = await page(target, "diagnose", {slots});
  } catch (error) {
    diagnosticStep(checks, "page_diagnostic", "Leitura do editor", "error", error.message);
    return finishFillDiagnostic(report);
  }
  report.metrics.expectedFields = pageReport.expectedFields;
  report.metrics.foundFields = pageReport.foundFields;
  report.metrics.candidates = pageReport.candidates;
  report.metrics.moduleCounts = pageReport.moduleCounts || {};
  report.warnings = Array.isArray(pageReport.warnings) ? pageReport.warnings.slice(0, 30) : [];

  diagnosticStep(checks, "page_version", "Versão na página", pageReport.version === report.version ? "ok" : "error",
    pageReport.version === report.version ? `Conector ${pageReport.version} confirmado.` : `A página respondeu com ${pageReport.version || "versão desconhecida"}; a extensão instalada é ${report.version}.`);
  diagnosticStep(checks, "amazon_access", "Login e verificação da Amazon", pageReport.loginRequired || pageReport.verificationRequired ? "error" : "ok",
    pageReport.loginRequired ? "A página está pedindo login. Entre na conta e execute o diagnóstico novamente." : pageReport.verificationRequired ? "A Amazon está pedindo verificação temporária ou captcha. Resolva-a na aba e execute novamente." : "Nenhum bloqueio de login, captcha ou código foi detectado.");
  diagnosticStep(checks, "module_render", "Renderização dos módulos", pageReport.renderErrors ? "error" : "ok",
    pageReport.renderErrors ? `A própria Amazon mostra ${pageReport.renderErrors} erro(s) de reprodução de módulo. Recarregue o editor e confirme que os módulos aparecem antes de preencher.` : "Nenhum erro de reprodução de módulo foi detectado.");

  const counts = pageReport.moduleCounts || {};
  const missing = [];
  if (counts.full !== 2) missing.push(`imagem completa: ${counts.full || 0}/2`);
  for (const [key, label] of [["four", "quatro imagens"], ["two", "duas imagens"], ["faq", "FAQ"], ["specs", "especificações"]])
    if (counts[key] !== 1) missing.push(`${label}: ${counts[key] || 0}/1`);
  diagnosticStep(checks, "modules", "Estrutura dos módulos", missing.length ? "warning" : "ok",
    missing.length ? `Estrutura esperada ainda não está completa (${missing.join("; ")}). Adicione ou expanda os módulos que pretende preencher.` : "Os seis módulos esperados foram encontrados.");
  diagnosticStep(checks, "fields", "Campos reconhecidos", pageReport.foundFields === pageReport.expectedFields ? "ok" : pageReport.foundFields ? "warning" : "error",
    pageReport.foundFields === pageReport.expectedFields ? `${pageReport.foundFields} de ${pageReport.expectedFields} campos reconhecidos.` :
      pageReport.foundFields ? `${pageReport.foundFields} de ${pageReport.expectedFields} campos reconhecidos. Expanda os módulos; se persistir, use Mapear campos.` : "Nenhum campo A+ foi reconhecido. Aguarde o editor terminar, expanda os módulos e confira se a Amazon os renderizou.");
  if (pageReport.blockedFrames)
    diagnosticStep(checks, "frames", "Conteúdo incorporado", "warning", `${pageReport.blockedFrames} iframe(s) de outra origem não puderam ser lidos.`);
  if (pageReport.loadingIndicators)
    diagnosticStep(checks, "async_loading", "Componentes carregando", "warning", `${pageReport.loadingIndicators} indicador(es) de carregamento ainda estavam ativos.`);
  for (const [index, warning] of report.warnings.entries())
    diagnosticStep(checks, `scan_warning_${index + 1}`, "Aviso do mapeamento", "warning", warning);
  return finishFillDiagnostic(report);
}

async function inspect(target, cfg) {
  let slots = makeSlots(cfg);
  let scan = await page(target, "scan", {slots});
  // Um editor recém-aberto pode montar o formulário de forma assíncrona.
  for (let i = 0; scan.candidates === 0 && i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    scan = await page(target, "scan", {slots});
  }
  const resolved = {...cfg};
  if (scan.counts.faq >= 1 && scan.counts.faq <= 6) resolved.faqCount = scan.counts.faq;
  if (scan.counts.specs >= 1 && scan.counts.specs <= 15) resolved.specCount = scan.counts.specs;
  resolved.includeSpecsHeading = !!scan.features?.specsHeading;
  // Primeiro descobre todas as linhas; depois aplica o menor limite entre o pedido e a página.
  scan = await page(target, "scan", {slots: makeSlots(resolved)});
  const limits = Object.fromEntries(scan.entries.filter(e => e.pageLimit > 0).map(e => [e.key, e.pageLimit]));
  slots = makeSlots(resolved, limits);
  scan = await page(target, "scan", {slots});
  return {slots, scan, config: resolved};
}

async function run(task, request) {
  // Keep-alive limitado a uma operação real; liberado assim que a tarefa termina.
  const keepAlive = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
  try {
    const target = await connect(request.tabId); task.target = target;
    const cfg = settings(request.config);
    const inspected = await inspect(target, cfg);
    if (inspected.scan.candidates === 0) throw new Error("Nenhum campo de texto acessível. Abra a edição do A+ e expanda os módulos antes de gerar.");
    if (task.controller.signal.aborted) throw new Error("Operação cancelada.");
    await state({status: "generating", message: "Gerando textos em português…", target, ...inspected});
    const generated = await routed(cfg.model,"texts",message=>state({message}).catch(()=>{}),(apiKey,model,onStage)=>generateTexts({apiKey,title:request.title.trim(),description:request.description.trim(),model,slots:inspected.slots,signal:task.controller.signal,onStage,onRateLimit:rateLimit=>state({rateLimit}).catch(()=>{})}));
    if (task.controller.signal.aborted) throw new Error("Operação cancelada.");
    await state({status: "filling", message: "Textos validados. Preenchendo os campos identificados…", generated});
    await tabById(target.tabId, target.url);
    const report = await page(target, "fill", {scanId: inspected.scan.scanId, slots: inspected.slots, texts: generated.texts});
    const incomplete = report.results.some(r => !["filled", "same"].includes(r.status));
    await state({status: incomplete ? "partial" : "done", report,
      message: `${report.filled} de ${report.total} campos conferidos. ${incomplete ? "Veja os campos pendentes abaixo." : "Revise os módulos antes de salvar na Amazon."}`});
  } catch (error) {
    await state({status: task.controller.signal.aborted ? "cancelled" : "error", message: error.message,
      diagnostic: task.controller.signal.aborted ? null : error.diagnostic || null});
  } finally {
    clearInterval(keepAlive);
    if (active === task) active = null;
  }
}

async function start(message) {
  if (active) throw new Error("Uma operação já está em andamento.");
  if (planningActive) throw new Error("Aguarde o planejamento terminar.");
  if (typeof message.title !== "string" || !message.title.trim() || message.title.length > 1000) throw new Error("Informe um título com até 1.000 caracteres.");
  if (typeof message.description !== "string" || !message.description.trim() || message.description.length > 18000) throw new Error("Informe uma descrição com até 18.000 caracteres.");
  const cfg = settings(message.config);
  const task = {id: crypto.randomUUID(), controller: new AbortController(), target: null};
  active = task;
  try {
    // Enfileira o rascunho antes das consultas assíncronas da aba/chave.
    // Edições recebidas depois de Iniciar continuam tendo prioridade.
    await saveDraft(message);
    await tabById(message.tabId);
    await chrome.storage.session.set({job: {id: task.id, status: "scanning", message: "Identificando módulos e campos na aba…", tabId: message.tabId, updatedAt: Date.now()}});
    // O trabalho pertence ao worker, não ao popup: fechar o popup não cancela a geração.
    void run(task, {...message, config: cfg});
    return {started: true};
  } catch (error) { active = null; throw error; }
}

async function exclusive(callback) {
  if (active) throw new Error("Aguarde a operação em andamento.");
  const task = {id: crypto.randomUUID(), controller: new AbortController()};
  active = task;
  try { return await callback(task); } finally { if (active === task) active = null; }
}

async function handle(message) {
  await ready;
  switch (message.action) {
    case "panelHello": return {version: EXTENSION_VERSION};
    case "status": {
      await draftQueue;
      const [temporary, persistent, synced] = await Promise.all([
        chrome.storage.session.get(["job", "auditJob", "planningJob", "projectJob"]),
        chrome.storage.local.get(["apiKey", "keyFingerprint", "apiKeys", "keyFingerprints", "config", "draft", "formOptions", "auditItems", "planResult", "qualityResult", "projects", "activeProjectId"]),
        chrome.storage.sync?.get ? chrome.storage.sync.get(["encryptedStudioKey","encryptedStudioKeys"]) : Promise.resolve({})
      ]);
      const saved = {...persistent, ...temporary};
      if (saved.job && activeStates.has(saved.job.status) && !active) {
        saved.job = await state({status: "error", message: "O Chrome interrompeu a operação. Confira os campos; os textos concluídos continuam disponíveis nesta sessão."});
      }
      if (saved.auditJob && auditActiveStates.has(saved.auditJob.status) && !auditActive) {
        saved.auditJob = await auditState({status: "error", message: "O Chrome interrompeu a verificação. Os resultados concluídos foram preservados."});
      }
      if (saved.planningJob && planningActiveStates.has(saved.planningJob.status) && !planningActive) {
        saved.planningJob = await planningState({status: "error", message: "O Chrome interrompeu o planejamento. Tente novamente."});
      }
      const cloud = isCloudKeyRecord(synced.encryptedStudioKey) ? synced.encryptedStudioKey : null;
      const apiKeys={...(saved.apiKeys||{})};if(saved.apiKey&&!apiKeys.gemini)apiKeys.gemini=saved.apiKey;
      const keyFingerprints={...(saved.keyFingerprints||{})};if(saved.keyFingerprint&&!keyFingerprints.gemini)keyFingerprints.gemini=saved.keyFingerprint;
      const keyStates=Object.fromEntries(["gemini","kira","groq","deepseek"].map(provider=>[provider,{saved:!!apiKeys[provider],fingerprint:keyFingerprints[provider]||apiKeys[provider]?.slice(-4)||null}]));
      const cloudRecords={...(synced.encryptedStudioKeys||{})};if(cloud&&!cloudRecords.gemini)cloudRecords.gemini=cloud;
      const cloudKeyStates=Object.fromEntries(["gemini","kira","groq","deepseek"].map(provider=>[provider,{saved:!!isCloudKeyRecord(cloudRecords[provider]),fingerprint:cloudRecords[provider]?.fingerprint||null}]));
      const anyKey=Object.values(keyStates).find(item=>item.saved);
      return {job: saved.job || null, keySaved: !!anyKey, keyFingerprint: anyKey?.fingerprint || null,
        cloudKeySaved: !!cloud, cloudKeyFingerprint: cloud?.fingerprint || null,
        keyStates,cloudKeyStates,
        keyMasked: anyKey ? `************${anyKey.fingerprint||""}` : "",
        config: saved.config || DEFAULTS, draft: saved.draft || {}, formOptions: saved.formOptions || null,
        auditJob: saved.auditJob || null, auditItems: saved.auditItems || [], planningJob: saved.planningJob || null,
        planResult: saved.planResult || null, qualityResult: saved.qualityResult || null,
        projects: saved.projects || [], activeProjectId: saved.activeProjectId || "", projectJob: saved.projectJob || null};
    }
    case "draft": return saveDraft(message);
    case "saveKey": {
      const apiKey = String(message.apiKey || "").trim();
      if (!apiKey || apiKey.length < 20 || apiKey.length > 1000 || /\s/.test(apiKey)) throw new Error("Cole uma API Key válida, sem espaços.");
      const provider=providerForModel(message.model||"gemini/gemini-3.5-flash");if(provider==="auto")throw new Error("Selecione um provedor para salvar a chave.");
      const old=await chrome.storage.local.get(["apiKeys","keyFingerprints"]),apiKeys={...(old.apiKeys||{}),[provider]:apiKey},keyFingerprints={...(old.keyFingerprints||{}),[provider]:apiKey.slice(-4)};
      const keyFingerprint = apiKey.slice(-4);
      await chrome.storage.local.set({apiKeys,keyFingerprints});
      return {saved: true, fingerprint: keyFingerprint};
    }
    case "forgetKey": {const provider=providerForModel(message.model||"gemini/gemini-3.5-flash"),old=await chrome.storage.local.get(["apiKeys","keyFingerprints"]),apiKeys={...(old.apiKeys||{})},keyFingerprints={...(old.keyFingerprints||{})};delete apiKeys[provider];delete keyFingerprints[provider];await chrome.storage.local.set({apiKeys,keyFingerprints});if(provider==="gemini")await chrome.storage.local.remove(["apiKey","keyFingerprint"]);return{};}
    case "cloudSaveKey": {const provider=providerForModel(message.model),keys=await providerKeys(message.model),record=await encryptApiKey(keys[provider],message.passphrase),old=await chrome.storage.sync.get("encryptedStudioKeys"),encryptedStudioKeys={...(old.encryptedStudioKeys||{}),[provider]:record};await chrome.storage.sync.set({encryptedStudioKeys});return{saved:true,fingerprint:record.fingerprint};}
    case "cloudUnlockKey": {const provider=providerForModel(message.model),synced=await chrome.storage.sync.get("encryptedStudioKeys"),apiKey=await decryptApiKey(synced.encryptedStudioKeys?.[provider],message.passphrase),old=await chrome.storage.local.get(["apiKeys","keyFingerprints"]),apiKeys={...(old.apiKeys||{}),[provider]:apiKey},keyFingerprints={...(old.keyFingerprints||{}),[provider]:apiKey.slice(-4)};await chrome.storage.local.set({apiKeys,keyFingerprints});return{saved:true,fingerprint:apiKey.slice(-4)};}
    case "cloudRemoveKey": {const provider=providerForModel(message.model),old=await chrome.storage.sync.get("encryptedStudioKeys"),encryptedStudioKeys={...(old.encryptedStudioKeys||{})};delete encryptedStudioKeys[provider];await chrome.storage.sync.set({encryptedStudioKeys});return{};}
    case "start": return start(message);
    case "cancel": {
      active?.controller.abort();
      if (active?.target) await page(active.target, "cancel").catch(() => {});
      return {};
    }
    case "scan": return exclusive(async () => {
      const target = await connect(message.tabId);
      return inspect(target, settings(message.config));
    });
    case "map": return exclusive(async () => {
      const saved = (await chrome.storage.session.get("job")).job;
      const target = await connect(message.tabId);
      const slots = saved?.slots || (await inspect(target, settings(message.config))).slots;
      return page(target, "map", {slots});
    });
    case "refill": return exclusive(async task => {
      const job = (await chrome.storage.session.get("job")).job;
      if (!job?.generated) throw new Error("Gere os textos primeiro.");
      if (message.tabId !== job.tabId) throw new Error("Volte à aba em que os textos foram gerados.");
      await tabById(message.tabId, job.target.url);
      const target = await connect(message.tabId); task.target = target;
      const scan = await page(target, "scan", {slots: job.slots});
      if (task.controller.signal.aborted) throw new Error("Operação cancelada.");
      await state({status: "filling", message: "Preenchendo novamente com os textos já gerados…", scan, target});
      try {
        const report = await page(target, "fill", {scanId: scan.scanId, slots: job.slots, texts: job.generated.texts});
        await state({status: report.filled === report.total ? "done" : "partial", report,
          message: `${report.filled} de ${report.total} campos conferidos. Revise o relatório.`});
        return report;
      } catch (error) { await state({status: "error", message: error.message}); throw error; }
    });
    case "undo": return exclusive(async task => {
      const target = await connect(message.tabId); task.target = target;
      const result = await page(target, "undo");
      await state({status: "undone", message: `${result.restored} campos restaurados; ${result.skipped} preservados ou indisponíveis.`, report: null});
      return result;
    });
    case "auditSaveList": return saveAuditList(message.text);
    case "auditCapture": {
      if (auditActive) throw new Error("Aguarde a verificação atual terminar.");
      return captureAuditItems(message.tabId);
    }
    case "auditStart": return startAudit(message);
    case "auditCancel": auditActive?.controller.abort(); return {};
    case "auditClear": {
      if (auditActive) throw new Error("Cancele a verificação antes de limpar.");
      await Promise.all([chrome.storage.local.remove("auditItems"), chrome.storage.session.remove("auditJob")]);
      return {};
    }
    case "planningStart": return startPlanning(message);
    case "planningCancel": planningActive?.controller.abort(); return {};
    case "qualityCheck": {
      const job = (await chrome.storage.session.get("job")).job;
      if (!job?.generated || !Array.isArray(job.slots)) throw new Error("Gere os textos A+ primeiro para calcular a nota de qualidade.");
      const saved = await chrome.storage.local.get("draft");
      const qualityResult = scoreAplus({slots: job.slots, texts: job.generated.texts,
        title: saved.draft?.title || "", description: saved.draft?.description || ""});
      await chrome.storage.local.set({qualityResult});
      return qualityResult;
    }
    case "planningClear": {
      if (planningActive) throw new Error("Cancele o planejamento antes de limpar.");
      await Promise.all([chrome.storage.local.remove(["planResult", "qualityResult"]), chrome.storage.session.remove("planningJob")]);
      return {};
    }
    case "projectList": {
      const result = await readProjects();
      const temporary = await chrome.storage.session.get("projectJob");
      return {...result, projectJob: temporary.projectJob || null};
    }
    case "projectSave": return upsertProject(message.project || {});
    case "projectSelect": {
      const saved = await readProjects();
      const id = String(message.id || "");
      if (id && !saved.projects.some(item => item.id === id)) throw new Error("Projeto não encontrado.");
      await chrome.storage.local.set({activeProjectId: id});
      return {...saved, activeProjectId: id};
    }
    case "projectDelete": {
      if (projectActive) throw new Error("Cancele a fila antes de excluir um projeto.");
      const saved = await readProjects();
      const projects = saved.projects.filter(item => item.id !== message.id);
      return writeProjects(projects, saved.activeProjectId === message.id ? projects[0]?.id || "" : saved.activeProjectId);
    }
    case "projectCapture": {
      const asin=normalizeAsin(message.asin);
      if (!asin) throw new Error("Informe um ASIN válido.");
      const tab=await chrome.tabs.get(message.tabId);
      if (!matchesProductURL(tab.url,asin)) throw new Error("Abra a página do ASIN informado antes de capturar.");
      const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:"ISOLATED",func:captureProductPage});
      const data=results[0]?.result;
      if (!data?.title || !matchesProductURL(data.url,asin)) throw new Error("A página mudou ou ainda não exibe o produto. Confira a aba e tente novamente.");
      const saved=await readProjects();
      const existing=saved.projects.find(item=>item.id===message.projectId);
      if (!existing) throw new Error("Selecione um projeto antes de capturar.");
      return upsertProject({...existing,asin,title:data.title,description:data.description,approved:false,status:"new"});
    }
    case "projectImport": {
      const task = {controller: new AbortController()};
      const data = await importProjectProduct(message.asin, task.controller.signal);
      const saved = await readProjects();
      const existing = saved.projects.find(item => item.id === message.projectId) || saved.projects.find(item => item.asin === data.asin);
      return upsertProject(createProject({...existing, asin: data.asin, title: data.title || existing?.title || "",
        description: data.description || existing?.description || "", status: existing?.status || "new"}));
    }
    case "projectQueueStart": return startProjectQueue(message.ids);
    case "projectQueueCancel": projectActive?.controller.abort(); return {};
    case "projectValidate": {
      const project = createProject(message.project || {});
      const checked = validateProject(project);
      const quality = scoreAplus({slots: project.slots?.length ? project.slots : makeSlots(project.config), texts: checked.texts,
        title: project.title, description: factualDescription(project)});
      return {...checked, quality};
    }
    case "projectApprove": {
      const project = createProject(message.project || {});
      const checked = validateProject(project);
      const quality = scoreAplus({slots: project.slots?.length ? project.slots : makeSlots(project.config), texts: checked.texts,
        title: project.title, description: factualDescription(project)});
      const blocking = checked.warnings.filter(item => !item.startsWith("Há apenas"));
      if (blocking.length) throw new Error(`Corrija antes de aprovar: ${blocking[0]}`);
      project.texts = checked.texts; project.notes = checked.notes; project.quality = quality;
      project.approved = true; project.status = "approved"; project.updatedAt = Date.now();
      return upsertProject(project);
    }
    case "projectPlan": {
      if (projectActive || active || planningActive) throw new Error("Aguarde a operação atual terminar.");
      const project = createProject(message.project || {});
      const task = {controller: new AbortController()}; projectActive = task;
      const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(()=>{}), 20000);
      let textsSaved = false;
      try {
        // Primeiro salva os textos. Se o planejamento visual falhar, eles permanecem disponíveis.
        if(!(project.approved&&Object.keys(project.texts||{}).length)){
          const drafted = await generateProjectDraft(project, task.controller.signal);Object.assign(project,drafted);await upsertProject(project);textsSaved=true;
        }
        if(!(project.approved&&project.plan?.image_briefs?.length===8))project.plan=await routed(settings(project.config).model,"planning",()=>{},(apiKey,model,onStage)=>generatePlan({apiKey,title:project.title,description:factualDescription(project),model,signal:task.controller.signal,onStage}));
        project.updatedAt = Date.now();
        return upsertProject(project);
      } catch (error) {
        if (textsSaved)
          throw new Error(`Textos A+ salvos. Falha ao criar os prompts de imagem: ${error.message}`);
        throw error;
      } finally { clearInterval(keepAlive); if (projectActive === task) projectActive = null; }
    }
    case "projectRegenerate": {
      if (projectActive || active || planningActive) throw new Error("Aguarde a operação atual terminar.");
      const project = createProject(message.project || {}), key = String(message.key || "");
      const slots = project.slots?.length ? project.slots : makeSlots(project.config);
      const slot = slots.find(item => item.key === key);
      if (!slot) throw new Error("Campo não encontrado.");
      const companionKey = slot.role === "question" ? key.replace("_question", "_answer") : slot.role === "answer" ? key.replace("_answer", "_question") :
        slot.role === "name" ? key.replace("_name", "_value") : slot.role === "value" ? key.replace("_value", "_name") : "";
      const selectedSlots = slots.filter(item => item.key === key || item.key === companionKey);
      const task = {controller: new AbortController()}; projectActive = task;
      try {
        const generated = await routed(settings(project.config).model,"texts",()=>{},(apiKey,model,onStage)=>generateTexts({apiKey,title:project.title,description:factualDescription(project),model,slots:selectedSlots,signal:task.controller.signal,onStage}));
        project.texts = {...project.texts, ...generated.texts};
        const checked = validateProject(project); project.texts = checked.texts; project.notes = [...project.notes, ...generated.notes].slice(-30);
        project.quality = scoreAplus({slots, texts: project.texts, title: project.title, description: factualDescription(project)});
        project.approved = false; project.status = "review"; project.updatedAt = Date.now();
        return upsertProject(project);
      } finally { if (projectActive === task) projectActive = null; }
    }
    case "projectFixRepetitions": {
      if (projectActive || active || planningActive) throw new Error("Aguarde a operação atual terminar.");
      const project = createProject(message.project || {});
      const slots = project.slots?.length ? project.slots : makeSlots(project.config);
      const description = factualDescription(project);
      const before = scoreAplus({slots, texts: project.texts, title: project.title, description});
      const targetKeys = (before.repetitionTargets || []).filter(key => slots.some(slot => slot.key === key));
      if (!targetKeys.length) {
        const checked = validateProject(project);
        project.texts = checked.texts; project.notes = checked.notes; project.validationWarnings = checked.warnings;
        project.quality = before; project.updatedAt = Date.now();
        const saved = await upsertProject(project);
        return {...saved, corrected: 0, before: 0, remaining: 0, score: before.score};
      }
      const selectedSlots = slots.filter(slot => targetKeys.includes(slot.key));
      const task = {controller: new AbortController()}; projectActive = task;
      try {
        const generated = await routed(settings(project.config).model, "texts", () => {}, (apiKey, model, onStage) => generateTexts({
          apiKey, title: project.title, description, model, slots: selectedSlots, signal: task.controller.signal, onStage,
          revisionPrompt: repetitionRevisionPrompt(project, slots, targetKeys, before)
        }));
        project.texts = {...project.texts, ...generated.texts};
        project.notes = [...project.notes, ...generated.notes].slice(-30);
        const checked = validateProject(project);
        project.texts = checked.texts; project.notes = checked.notes; project.validationWarnings = checked.warnings;
        project.quality = scoreAplus({slots, texts: project.texts, title: project.title, description});
        project.approved = false; project.status = "review"; project.updatedAt = Date.now();
        const saved = await upsertProject(project);
        return {...saved, corrected: targetKeys.length, before: before.repetitions.length,
          remaining: project.quality.repetitions.length, score: project.quality.score};
      } finally { if (projectActive === task) projectActive = null; }
    }
    case "projectDiagnostic": return diagnoseProjectFill(message);
    case "projectFill": return exclusive(async task => {
      const project = createProject(message.project || {});
      if (!project.approved || project.status !== "approved") throw new Error("Aprove o projeto antes de preencher a Amazon.");
      const tab = await tabById(message.tabId);
      if (!isAplusEditorURL(tab.url)) throw new Error("A aba selecionada não é o editor A+ Premium. Execute o diagnóstico para localizar a página correta.");
      const target = await connect(message.tabId); task.target = target;
      const inspected = await inspect(target, settings(project.config));
      const scan = await page(target, "scan", {slots: inspected.slots});
      const texts = Object.fromEntries(inspected.slots.map(slot => [slot.key, String(project.texts[slot.key] || "")]));
      const report = await page(target, "fill", {scanId: scan.scanId, slots: inspected.slots, texts});
      project.status = "filled"; project.updatedAt = Date.now(); project.approved = true;
      await upsertProject(project);
      return report;
    });
    default: throw new Error("Ação não reconhecida.");
  }
}

chrome.runtime.onConnect?.addListener(port => {
  if (port.name !== "aplus-panel-v1" || !isPanelSender(port.sender, chrome.runtime)) {
    port.disconnect(); return;
  }
  let connected = true;
  port.onDisconnect.addListener(() => { connected = false; });
  port.onMessage.addListener(message => {
    if (message?.channel !== "aplus-extension" || !Number.isSafeInteger(message.requestId)) return;
    const reply = result => {
      if (!connected) return;
      try { port.postMessage({requestId: message.requestId, ...result}); } catch { connected = false; }
    };
    handle(message).then(data => reply({ok:true, data}), error => reply({ok:false, error:error.message}));
  });
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.channel === "aplus-native-write") {
    // Apenas o content script da operação ativa pode solicitar esta função fixa.
    const target = active?.target;
    if (sender.id !== chrome.runtime.id || !sender.tab || !target || active.controller.signal.aborted ||
      sender.tab.id !== target.tabId || sender.documentId !== target.documentId ||
      sender.url !== target.url || message.href !== target.url || !isSellerURL(sender.url) ||
      !/^[a-f0-9-]{36}$/.test(message.marker) || typeof message.value !== "string" ||
      message.value.length > 20000 || typeof message.expectedBefore !== "string") {
      reply({ok: false, error: "Escrita fora da operação ou do documento ativo."}); return;
    }
    chrome.scripting.executeScript({target: {tabId: target.tabId, documentIds: [target.documentId]}, world: "MAIN",
      func: writeAmazonField, args: [message.marker, message.value, message.expectedBefore, target.url]})
      .then(results => reply({ok: true, data: results[0]?.result || {written: false}}),
        () => reply({ok: false, error: "O componente da Amazon não aceitou a escrita."}));
    return true;
  }
  // O painel é uma página confiável da extensão aberta em uma aba e possui
  // sender.tab. Autorize pela identidade e URL exatas, não pela ausência de aba.
  // Content scripts mantêm a URL da página hospedeira e continuam bloqueados.
  const allowedPage = sender.url === chrome.runtime.getURL("popup.html") || sender.url === chrome.runtime.getURL("dashboard.html");
  if (sender.id !== chrome.runtime.id || !allowedPage || message?.channel !== "aplus-extension") return;
  handle(message).then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message}));
  return true;
});
