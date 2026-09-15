import {makeSlots, isAplusEditorURL, SELLER_TAB_PATTERNS} from "./shared.js";
import {buildFullImagePrompt} from "./planning.js";
import {createProject, evidenceFor, parseQueue, PROJECT_STATUS} from "./projects.js";
import {connectPanel} from "./panel-connection.js";
import {providerForModel} from "./providers.js";

const $ = id => document.getElementById(id);
const send = connectPanel(chrome.runtime);
const sellerTabsInWindow = () => chrome.tabs.query({currentWindow: true, url: SELLER_TAB_PATTERNS});
const recentFirst = tabs => [...tabs].sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
const sellerTabId = async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.id && isAplusEditorURL(tab.url)) return tab.id;
  const sellerTabs = await sellerTabsInWindow();
  const target = recentFirst(sellerTabs.filter(item => item.id && isAplusEditorURL(item.url)))[0];
  if (!target?.id) throw new Error("Nenhuma aba do editor A+ Premium foi encontrada nesta janela. Use Diagnosticar conexão para ver exatamente o que falta.");
  await chrome.tabs.update(target.id, {active: true});
  return target.id;
};

let projects = [], activeId = "", projectJob = null, pollTimer, toastTimer;
let currentTab = "product", saving = false, dirty = false;
let keySaved = false;
let keyStates={};
const providerModel=()=>({gemini:"gemini/gemini-3.5-flash",kira:"kira/qwen3.8-flash",groq:"openai/gpt-oss-20b",deepseek:"deepseek/deepseek-flash"})[$("keyProvider").value];
let productTabId = null, operationBusy = false, lastAmazonDiagnostic = null;
const current = () => projects.find(item => item.id === activeId) || null;

function toast(message, error = false) {
  clearTimeout(toastTimer); $("toast").textContent = message; $("toast").className = `toast${error ? " error" : ""}`; $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4500);
}

function diagnosticText(report) {
  if (!report) return "";
  const lines = ["DIAGNÓSTICO DE PREENCHIMENTO A+", `Versão: ${report.version}`, `Data UTC: ${report.generatedAt}`,
    `Resultado: ${report.summary}`, `Recomendação: ${report.recommendation}`, ""];
  if (report.target) lines.push(`Aba: ${report.target.url}`, `Estado da aba: ${report.target.status}`, "");
  lines.push("MÉTRICAS", `Abas Seller Central: ${report.metrics?.sellerTabs ?? 0}`,
    `Editores A+ Premium: ${report.metrics?.editorTabs ?? 0}`,
    `Campos reconhecidos: ${report.metrics?.foundFields ?? 0}/${report.metrics?.expectedFields ?? 0}`,
    `Campos de texto visíveis: ${report.metrics?.candidates ?? 0}`,
    `Módulos: ${JSON.stringify(report.metrics?.moduleCounts || {})}`, "", "VERIFICAÇÕES");
  for (const check of report.checks || []) lines.push(`[${check.status.toUpperCase()}] ${check.label}: ${check.detail}`);
  return lines.join("\n");
}

function renderAmazonDiagnostic(report, running = false) {
  const box = $("amazonDiagnostic"); box.hidden = false;
  $("diagnosticChecks").replaceChildren();
  $("diagnosticSummary").textContent = running ? "Executando diagnóstico…" : report?.summary || "Não foi possível concluir.";
  $("diagnosticRecommendation").textContent = running ? "Aguarde enquanto a extensão testa a aba sem alterar a Amazon." : report?.recommendation || "Tente novamente.";
  box.className = `diagnostic-report ${running ? "running" : report?.status || "error"}`;
  $("copyAmazonDiagnostic").disabled = running || !report;
  if (running || !report) return;
  for (const check of report.checks || []) {
    const row = document.createElement("div"); row.className = `diagnostic-check ${check.status}`;
    const mark = document.createElement("span"); mark.className = "diagnostic-mark";
    mark.textContent = check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "×";
    const content = document.createElement("div"), label = document.createElement("strong"), detail = document.createElement("p");
    label.textContent = check.label; detail.textContent = check.detail; content.append(label, detail); row.append(mark, content);
    $("diagnosticChecks").append(row);
  }
}

function factRow(item = {}) {
  const row = document.createElement("div"); row.className = "fact-row";
  const field = document.createElement("input"); field.type = "text"; field.placeholder = "Campo"; field.value = item.field || "";
  const value = document.createElement("input"); value.type = "text"; value.placeholder = "Valor confirmado"; value.value = item.value || "";
  const source = document.createElement("input"); source.type = "text"; source.placeholder = "Origem"; source.value = item.source || "Informado manualmente";
  const label = document.createElement("label"), confirmed = document.createElement("input"); confirmed.type = "checkbox"; confirmed.checked = item.confirmed !== false;
  label.append(confirmed, document.createTextNode("Confirmado"));
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "fact-remove"; remove.textContent = "×"; remove.title = "Remover fato";
  remove.onclick = () => { row.remove(); markChanged(); };
  for (const input of [field, value, source, confirmed]) input.addEventListener("input", markChanged);
  row.append(field, value, source, label, remove); return row;
}

function collectProject() {
  const old = current(); if (!old) return null;
  const facts = [...$("facts").querySelectorAll(".fact-row")].map(row => {
    const inputs = row.querySelectorAll("input");
    return {field: inputs[0].value, value: inputs[1].value, source: inputs[2].value, confirmed: inputs[3].checked};
  }).filter(item => item.field || item.value);
  const texts = {...old.texts};
  for (const area of $("textEditor").querySelectorAll("textarea[data-key]")) texts[area.dataset.key] = area.value;
  return createProject({...old, asin: $("asin").value, title: $("title").value, description: $("description").value, facts, texts,
    config: {model: $("model").value, faqCount: Number($("faqCount").value), specCount: Number($("specCount").value)}});
}

function markChanged() {
  const project = current(); if (!project) return;
  dirty = true; project.approved = false; project.validationWarnings = []; project.quality = null;
  if (["approved", "filled"].includes(project.status)) project.status = "review";
  renderHeader(project);
}

async function save(showMessage = true) {
  if (saving || !current()) return current();
  saving = true;
  try {
    const project = collectProject(); project.updatedAt = Date.now();
    const result = await send("projectSave", {project});
    projects = result.projects; activeId = result.activeProjectId; dirty = false; renderAll();
    if (showMessage) toast("Projeto salvo.");
    return current();
  } finally { saving = false; }
}

function renderHeader(project) {
  $("projectStatus").textContent = PROJECT_STATUS[project.status] || "Novo";
  $("projectName").textContent = project.title || project.asin || "Projeto sem título";
  $("projectMeta").textContent = [project.asin, `Atualizado ${new Date(project.updatedAt).toLocaleString("pt-BR")}`].filter(Boolean).join(" · ");
}

function renderProjects() {
  $("projectCount").textContent = projects.length;
  const query = $("projectSearch").value.trim().toLowerCase(), list = $("projectList"); list.replaceChildren();
  const visible = projects.filter(item => !query || `${item.asin} ${item.title}`.toLowerCase().includes(query));
  for (const project of visible) {
    const row = document.createElement("div"); row.className = `project-item${project.id === activeId ? " active" : ""}`;
    const select = document.createElement("input"); select.type = "checkbox"; select.className = "queue-check"; select.dataset.id = project.id;
    const open = document.createElement("button"); open.type = "button"; open.className = "project-open";
    const name = document.createElement("strong"); name.textContent = project.title || "Produto sem título";
    const asin = document.createElement("small"); asin.textContent = project.asin || "Sem ASIN";
    const status = document.createElement("span"); status.className = "status-dot-label"; status.textContent = PROJECT_STATUS[project.status] || project.status;
    open.append(name, asin, status); open.onclick = async () => { await save(false); activeId = project.id; await send("projectSelect", {id: activeId}); renderAll(); };
    row.append(select, open); list.append(row);
  }
}

function renderFacts(project) {
  $("facts").replaceChildren(...(project.facts?.length ? project.facts.map(factRow) : [factRow()]));
}

function textGroupName(module) {
  return {hero:"Banner principal",four:"Quatro imagens com texto",two:"Duas imagens com texto",faq:"Perguntas e respostas",closing:"Banner final",specs:"Especificações técnicas"}[module] || module;
}

function renderTexts(project) {
  const slots = project.slots?.length ? project.slots : makeSlots(project.config), editor = $("textEditor"); editor.replaceChildren();
  for (const module of [...new Set(slots.map(slot => slot.module))]) {
    const group = document.createElement("section"); group.className = "module-group";
    const heading = document.createElement("h4"); heading.textContent = textGroupName(module); group.append(heading);
    for (const slot of slots.filter(item => item.module === module)) {
      const row = document.createElement("div"); row.className = "text-row";
      const head = document.createElement("div"); head.className = "text-row-head";
      const label = document.createElement("strong"); label.textContent = slot.label;
      const actions = document.createElement("div"); actions.className = "text-row-actions";
      const evidence = document.createElement("span"), ev = evidenceFor(project.texts?.[slot.key], project);
      evidence.className = `evidence${ev.level === "review" ? " review" : ""}`; evidence.textContent = ev.label;
      const counter = document.createElement("span"); counter.className = "counter";
      const regenerate = document.createElement("button"); regenerate.type = "button"; regenerate.textContent = "Regenerar";
      regenerate.onclick = () => regenerateField(slot.key);
      const area = document.createElement("textarea"); area.dataset.key = slot.key; area.maxLength = Math.max(slot.limit * 2, slot.limit + 100);
      area.value = project.texts?.[slot.key] || ""; area.placeholder = project.texts && Object.keys(project.texts).length ? "Sem informação comprovada" : "Gere o rascunho para preencher";
      const updateCounter = () => { counter.textContent = `${area.value.length}/${slot.limit}`; counter.classList.toggle("over", area.value.length > slot.limit); };
      area.addEventListener("input", () => { dirty = true; project.texts[slot.key] = area.value; project.approved = false; project.status = "review"; project.validationWarnings = []; project.quality = null; updateCounter();
        const next = evidenceFor(area.value, project); evidence.textContent = next.label; evidence.className = `evidence${next.level === "review" ? " review" : ""}`; renderHeader(project); });
      updateCounter(); actions.append(evidence, counter, regenerate); head.append(label, actions); row.append(head, area); group.append(row);
    }
    editor.append(group);
  }
}

function renderImages(project) {
  const box = $("imageBriefs"); box.replaceChildren();
  if (!project.plan?.imageBriefs?.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Crie o planejamento na etapa Produto para receber os oito briefings."; box.append(p); return; }
  project.plan.imageBriefs.forEach((brief, index) => {
    const row = document.createElement("div"); row.className = "brief-row";
    const h = document.createElement("h4"); h.textContent = `${index + 1}. ${brief.module} · ${brief.size}`;
    const details = document.createElement("p"); details.textContent = `Objetivo: ${brief.goal} | Cena: ${brief.scene} | Composição: ${brief.composition}`;
    const prompt = document.createElement("p"); prompt.className = "brief-prompt"; prompt.textContent = brief.prompt;
    const copy = document.createElement("button"); copy.textContent = "Copiar prompt"; copy.onclick = () => navigator.clipboard.writeText(brief.prompt).then(() => toast("Prompt copiado."));
    row.append(h, details, prompt, copy); box.append(row);
  });
}

function renderValidation(project) {
  const quality = project.quality; $("score").textContent = quality?.score ?? "—";
  $("scoreSummary").textContent = quality ? (quality.score >= 90 ? "Excelente. Faça a revisão final." : quality.score >= 75 ? "Bom, com pontos para revisar." : "Há ajustes importantes antes de aprovar.") : "Valide o projeto para calcular a nota.";
  const summary = $("validationSummary"); summary.replaceChildren();
  const slots = project.slots?.length ? project.slots : makeSlots(project.config);
  const filled = slots.filter(slot => project.texts?.[slot.key]).length;
  summary.innerHTML = `<p><strong>${filled}</strong> de ${slots.length} campos preenchidos</p><p><strong>${project.approved ? "Sim" : "Não"}</strong> · aprovação individual</p>`;
  const issues = $("validationIssues"); issues.replaceChildren();
  const all = [...(project.validationWarnings || []), ...(quality?.issues || [])];
  if (!all.length) { const p = document.createElement("p"); p.className = "issue ok"; p.textContent = "Nenhum problema automático encontrado."; issues.append(p); }
  else for (const message of [...new Set(all)]) { const p = document.createElement("p"); p.className = "issue"; p.textContent = message; issues.append(p); }
  const repetitionTargets = quality?.repetitionTargets || [];
  const legacyRepetitionReport = quality && !Array.isArray(quality.repetitionTargets) &&
    (quality.issues || []).some(message => /repeti[cç][aã]o|textos muito semelhantes/i.test(message));
  $("fixRepetitions").hidden = repetitionTargets.length === 0 && !legacyRepetitionReport;
  $("fixRepetitions").disabled = operationBusy;
  $("fixRepetitionsHint").hidden = repetitionTargets.length === 0 && !legacyRepetitionReport;
  $("fixRepetitionsHint").textContent = legacyRepetitionReport
    ? "Este relatório foi criado pelo cálculo anterior. O botão primeiro refaz a análise e só usa a API se ainda houver repetição real."
    : repetitionTargets.length
    ? `A correção usa a API selecionada e reescreve somente ${repetitionTargets.length} campo${repetitionTargets.length === 1 ? "" : "s"} repetido${repetitionTargets.length === 1 ? "" : "s"}. Os demais textos permanecem iguais.`
    : "";
  const map = $("coverageMap"); map.replaceChildren();
  for (const module of [...new Set(slots.map(slot => slot.module))]) {
    const moduleSlots = slots.filter(slot => slot.module === module), present = moduleSlots.filter(slot => project.texts?.[slot.key]).length;
    const row = document.createElement("div"); row.className = "coverage-row";
    row.innerHTML = `<strong>${textGroupName(module)}</strong><span>${present ? "Conteúdo presente" : "Sem conteúdo"}</span><span>${present}/${moduleSlots.length}</span>`; map.append(row);
  }
  $("approvalState").innerHTML = project.approved
    ? "<strong>Conteúdo aprovado</strong><p>Pronto para preencher a aba ativa do Seller Central.</p>"
    : "<strong>Aguardando aprovação</strong><p>Valide e aprove este produto antes do preenchimento.</p>";
  $("fillAmazon").disabled = !project.approved;
}

function renderEditor() {
  const project = current(); $("emptyState").hidden = !!project; $("editor").hidden = !project; if (!project) return;
  renderHeader(project); $("asin").value = project.asin || ""; $("title").value = project.title || ""; $("description").value = project.description || "";
  const oldModel = project.config?.model;
  $("model").value = oldModel === "gemini/gemini-2.5-flash" ? "gemini/gemini-3.5-flash" : oldModel === "gemini/gemini-2.5-flash-lite" ? "gemini/gemini-3.5-flash-lite" : oldModel || "auto/economico"; $("faqCount").value = project.config?.faqCount || 5; $("specCount").value = project.config?.specCount || 6;
  renderFacts(project); renderTexts(project); renderImages(project); renderValidation(project); switchTab(currentTab);
}

function renderJob() {
  const running = ["queued", "generating"].includes(projectJob?.status);
  $("jobStatus").textContent = projectJob?.message || "Pronto"; $("queueCancel").hidden = !running; $("queueSelected").disabled = running;
}
function renderAll() { renderProjects(); renderEditor(); renderJob(); }

function switchTab(tab) {
  currentTab = tab;
  for (const button of document.querySelectorAll(".tabs button")) button.classList.toggle("active", button.dataset.tab === tab);
  for (const panel of document.querySelectorAll(".tab-panel")) panel.hidden = panel.id !== `tab-${tab}`;
}

async function refresh() {
  if (operationBusy) { clearTimeout(pollTimer); pollTimer=setTimeout(refresh,1000); return; }
  try {
    const localDraft = dirty ? collectProject() : null;
    const result = await send("projectList"); projects = result.projects || []; activeId = result.activeProjectId || projects[0]?.id || ""; projectJob = result.projectJob;
    if (localDraft) { const index = projects.findIndex(item => item.id === localDraft.id); if (index >= 0) projects[index] = localDraft; renderProjects(); renderJob(); }
    else renderAll();
  } catch (error) { toast(error.message, true); }
  clearTimeout(pollTimer); pollTimer = setTimeout(refresh, ["queued", "generating"].includes(projectJob?.status) ? 700 : 2500);
}

async function refreshKeyState() {
  const status = await send("status");keyStates=status.keyStates||{};const current=keyStates[$("keyProvider").value]||{};keySaved=!!current.saved;
  $("apiState").textContent = keySaved ? `Chave configurada${current.fingerprint ? `, final ${current.fingerprint}` : ""}.` : "Nenhuma chave configurada para este provedor.";
  $("removeKey").disabled = !keySaved;
  $("savedKeyBox").hidden = !keySaved;
  $("newKeyBox").hidden = keySaved;
  $("savedKeyMask").value = keySaved ? `••••••••••••${current.fingerprint||""}` : "";
  $("saveKey").hidden = keySaved;
}

async function newProject() {
  if (current()) await save(false);
  const project = createProject({});
  const result = await send("projectSave", {project}); projects = result.projects; activeId = result.activeProjectId; currentTab = "product"; renderAll();
}

async function generate(ids) {
  await save(false); const result = await send("projectQueueStart", {ids}); toast(`${result.total} projeto(s) colocado(s) na fila.`); await refresh();
}

async function regenerateField(key) {
  try { const project = await save(false); toast("Regenerando somente este campo…");
    const result = await send("projectRegenerate", {project, key}); projects = result.projects; activeId = result.activeProjectId; renderAll(); toast("Campo regenerado. Revise o resultado.");
  } catch (error) { toast(error.message, true); }
}

$("newProject").onclick = $("emptyNew").onclick = () => newProject().catch(error => toast(error.message, true));
$("apiSettings").onclick = () => { const provider=providerForModel($("model").value);if(provider!=="auto")$("keyProvider").value=provider;refreshKeyState().catch(error => toast(error.message, true)); $("apiDialog").showModal(); };
$("saveKey").onclick = async () => { try { await send("saveKey", {apiKey: $("apiKey").value,model:providerModel()}); $("apiKey").value = ""; await refreshKeyState(); toast("API Key salva."); } catch (error) { toast(error.message, true); } };
$("removeKey").onclick = async () => { try { await send("forgetKey",{model:providerModel()}); $("apiKey").value=""; await refreshKeyState(); toast("API Key removida."); } catch (error) { toast(error.message, true); } };
$("keyProvider").onchange=()=>refreshKeyState().catch(error=>toast(error.message,true));
$("replaceSavedKey").onclick = () => { $("newKeyBox").hidden=false; $("saveKey").hidden=false; $("apiKey").focus(); };
$("saveProject").onclick = () => save(true).catch(error => toast(error.message, true));
$("addFact").onclick = () => $("facts").append(factRow());
$("projectSearch").addEventListener("input", renderProjects);
for (const id of ["asin", "title", "description", "model", "faqCount", "specCount"]) $(id).addEventListener("input", markChanged);
for (const button of document.querySelectorAll(".tabs button")) button.onclick = () => switchTab(button.dataset.tab);

$("batchAdd").onclick = async () => {
  const rows = parseQueue($("batchInput").value); if (!rows.length) return toast("Informe ao menos um ASIN ou título válido.", true);
  try { for (const row of rows) await send("projectSave", {project: createProject(row)}); $("batchInput").value = ""; await refresh(); toast(`${rows.length} projeto(s) criado(s).`); }
  catch (error) { toast(error.message, true); }
};
$("queueSelected").onclick = () => {
  const ids = [...document.querySelectorAll(".queue-check:checked")].map(input => input.dataset.id);
  if (!ids.length && current()) ids.push(current().id);
  generate(ids).catch(error => toast(error.message, true));
};
$("queueCancel").onclick = () => send("projectQueueCancel").then(() => toast("Cancelamento solicitado.")).catch(error => toast(error.message, true));
$("generateDraft").onclick = () => current() ? generate([current().id]).catch(error => toast(error.message, true)) : null;

$("importAsin").onclick = async () => {
  try { const asin = $("asin").value.trim(); toast("Carregando informações públicas do produto…");
    const result = await send("projectImport", {asin, projectId: activeId}); projects = result.projects; activeId = result.activeProjectId; dirty = false; renderAll(); toast("Produto carregado. Confirme os dados antes de gerar.");
  } catch (error) { toast(error.message, true); }
};
$("openProduct").onclick = async () => {
  try {
    const project=await save(false);
    if (!project?.asin) throw new Error("Informe um ASIN válido antes de abrir o produto.");
    const tab=await chrome.tabs.create({url:`https://www.amazon.com.br/dp/${project.asin}`});
    productTabId=tab.id; $("captureProduct").disabled=false;
    toast("Aguarde o produto carregar, conclua eventual verificação e volte para capturar.");
  } catch(error) { toast(error.message,true); }
};
$("captureProduct").onclick = async () => {
  try {
    const project=await save(false);
    const result=await send("projectCapture",{projectId:project.id,asin:project.asin,tabId:productTabId});
    projects=result.projects; activeId=result.activeProjectId; dirty=false; renderAll();
    toast("Dados da página capturados. Revise antes de gerar.");
  } catch(error) { toast(error.message,true); }
};
$("createPlan").onclick = async () => {
  if (operationBusy) return;
  operationBusy=true; $("editor").inert=true;
  try { const project = await save(false); toast("Gerando textos A+ e depois os prompts de imagem…");
    const result = await send("projectPlan", {project}); projects = result.projects; activeId = result.activeProjectId; renderAll(); switchTab("texts"); toast("Textos A+ e prompts concluídos.");
  } catch (error) { toast(error.message, true); }
  finally { operationBusy=false; $("editor").inert=false; await refresh(); }
};
$("copyAllPrompts").onclick = async () => {
  const project = current(), prompt = buildFullImagePrompt(project?.plan, project?.title); if (!prompt) return toast("Crie o planejamento primeiro.", true);
  try { await navigator.clipboard.writeText(prompt); toast("Prompt completo das 8 imagens copiado."); } catch { toast("Não foi possível copiar.", true); }
};
$("validateProject").onclick = async () => {
  try { const project = await save(false), result = await send("projectValidate", {project});
    project.texts = result.texts; project.notes = result.notes; project.quality = result.quality; project.validationWarnings = result.warnings;
    const saved = await send("projectSave", {project}); projects = saved.projects; activeId = saved.activeProjectId; renderAll(); toast(`Validação concluída: ${result.quality.score}/100.`);
  } catch (error) { toast(error.message, true); }
};
$("fixRepetitions").onclick = async () => {
  if (operationBusy) return;
  operationBusy = true; $("editor").inert = true;
  const button = $("fixRepetitions"), originalLabel = button.textContent; button.textContent = "Corrigindo…"; button.disabled = true;
  try {
    const project = await save(false); toast("Reescrevendo somente os campos realmente repetidos…");
    const result = await send("projectFixRepetitions", {project});
    projects = result.projects; activeId = result.activeProjectId; dirty = false; renderAll(); switchTab("validation");
    toast(result.corrected === 0
      ? "Relatório atualizado. Nenhuma repetição real foi encontrada."
      : result.remaining
      ? `${result.corrected} campo(s) reescrito(s). Ainda restam ${result.remaining} repetição(ões) para revisar.`
      : `${result.corrected} campo(s) reescrito(s). Nenhuma repetição real permaneceu.`);
  } catch (error) { toast(error.message, true); }
  finally { operationBusy = false; $("editor").inert = false; button.textContent = originalLabel; await refresh(); }
};
$("approveProject").onclick = async () => {
  try { const project = await save(false), result = await send("projectApprove", {project}); projects = result.projects; activeId = result.activeProjectId; renderAll(); toast("Conteúdo aprovado para preenchimento."); }
  catch (error) { toast(error.message, true); switchTab("validation"); }
};
$("fillAmazon").onclick = async () => {
  try { const project = await save(false); const report = await send("projectFill", {project, tabId: await sellerTabId()}); await refresh(); toast(`${report.filled} de ${report.total} campos conferidos. Revise antes de salvar na Amazon.`); }
  catch (error) { toast(error.message, true); }
};
$("diagnoseAmazon").onclick = async () => {
  if (operationBusy) return;
  operationBusy = true; $("diagnoseAmazon").disabled = true; renderAmazonDiagnostic(null, true);
  try {
    const project = await save(false);
    const tabs = await sellerTabsInWindow();
    lastAmazonDiagnostic = await send("projectDiagnostic", {project, tabIds: tabs.map(tab => tab.id).filter(Number.isSafeInteger)});
    renderAmazonDiagnostic(lastAmazonDiagnostic);
    toast(lastAmazonDiagnostic.summary, lastAmazonDiagnostic.status === "error");
  } catch (error) {
    lastAmazonDiagnostic = {version: chrome.runtime.getManifest().version, generatedAt: new Date().toISOString(), status: "error",
      summary: "O diagnóstico não pôde ser concluído.", recommendation: error.message, checks: [], metrics: {}};
    renderAmazonDiagnostic(lastAmazonDiagnostic); toast(error.message, true);
  } finally { operationBusy = false; $("diagnoseAmazon").disabled = false; }
};
$("copyAmazonDiagnostic").onclick = async () => {
  const text = diagnosticText(lastAmazonDiagnostic); if (!text) return;
  try { await navigator.clipboard.writeText(text); toast("Diagnóstico copiado."); }
  catch { toast("Não foi possível copiar o diagnóstico.", true); }
};
$("deleteProject").onclick = async () => {
  if (!confirm("Excluir este projeto? Esta ação não altera nada na Amazon.")) return;
  try { const result = await send("projectDelete", {id: activeId}); projects = result.projects; activeId = result.activeProjectId; renderAll(); toast("Projeto excluído."); }
  catch (error) { toast(error.message, true); }
};
$("exportTexts").onclick = () => {
  const project = collectProject(); if (!project) return; const slots = project.slots?.length ? project.slots : makeSlots(project.config);
  const lines = [`A+ STUDIO 1.5.3 · ${project.title}`, project.asin, "", ...slots.flatMap(slot => [slot.label, project.texts[slot.key] || "", ""]), "OBSERVAÇÕES", ...project.notes];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {type:"text/plain;charset=utf-8"}), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${project.asin || "produto"}-textos-aplus.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

async function initializePanel() {
  const label = document.querySelector(".topbar h1");
  label.textContent = "A+ Studio · painel 1.5.3";
  try {
    const hello = await send("panelHello");
    if (hello.version !== "1.5.3") throw new Error(`Painel 1.5.3 conectado à extensão ${hello.version}. Substitua os arquivos na pasta instalada e recarregue a extensão.`);
    label.textContent = `A+ Studio · ${hello.version} conectado`;
    await refresh();
  } catch (error) {
    $("jobStatus").textContent = error.message;
    toast(error.message, true);
  }
}
initializePanel();
