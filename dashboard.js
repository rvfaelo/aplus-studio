import {makeSlots, isAplusEditorURL, SELLER_TAB_PATTERNS} from "./shared.js";
import {buildFullImagePrompt} from "./planning.js";
import {createProject, evidenceFor, parseQueue, PROJECT_STATUS} from "./projects.js";
import {connectPanel} from "./panel-connection.js";
import {providerForModel} from "./providers.js";
import {buildSalesStrategy} from "./strategy.js";
import {countReviewEntries, listingOptimizationText, normalizeListingWorkspace,
  reviewAnalysisText, reviewRiskContext} from "./listing-intelligence.js";

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
let currentTab = "product", currentWorkspace = "aplus", currentIntelligenceTool = "reviews", saving = false, dirty = false;
let keySaved = false;
let keyStates={};
let testedKeyCandidate="";
const providerModel=()=>({openai:"openai-api/gpt-5.6-luna",gemini:"gemini/gemini-3.5-flash",kira:"kira/qwen3.8-flash",groq:"openai/gpt-oss-20b",xkiro:"xkiro/auto-quality"})[$("keyProvider").value];
const dashboardKeyCandidate=()=>`${$("keyProvider").value}:${$("apiKey").value.trim()}`;
function resetDashboardKeyTest(message="Teste obrigatório antes de salvar. O teste não gera conteúdo."){
  testedKeyCandidate="";$("keyTestStatus").textContent=message;$("saveKey").disabled=true;$("testKey").disabled=!$("apiKey").value.trim();
}
let productTabId = null, reviewTabId = null, reviewTabAsin = "", operationBusy = false, lastAmazonDiagnostic = null, previewStrategy = null;
let moduleRecording = false, moduleRecordingTabId = null, lastModuleRecording = null, amazonModulesReady = false;
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
  if (report.bridgeProbe?.diagnostic) lines.push("", "DADOS TÉCNICOS SEGUROS",
    JSON.stringify(report.bridgeProbe.diagnostic, null, 2));
  lines.push("", "Privacidade: chaves de API, tokens de autorização e textos completos não são incluídos.");
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

function fillReportText(report) {
  if (!report) return "";
  const technical = report.technical || {};
  const lines = ["RELATÓRIO TÉCNICO DE PREENCHIMENTO A+", `Versão do conector: ${technical.connectorVersion || "não informada"}`,
    `ID da tentativa: ${technical.attemptId || "não informado"}`, `Início UTC: ${technical.startedAt || "não informado"}`,
    `Duração: ${Number.isFinite(technical.durationMs) ? `${technical.durationMs} ms` : "não informada"}`,
    `Página: ${technical.page || report.href || "não informada"}`, "", `Confirmados: ${report.filled || 0}/${report.total || 0}`,
    `Falhas: ${report.failed || 0}`, `Vazios: ${report.empty || 0}`, `Campos recriados: ${report.recreated || 0}`,
    `Novas tentativas: ${report.retried || 0}`, `Códigos: ${JSON.stringify(technical.codes || {})}`,
    `Métodos de escrita: ${JSON.stringify(technical.writerMethods || {})}`, "", "CAMPOS"];
  for (const row of report.results || []) lines.push(
    `[${String(row.status || "pending").toUpperCase()}][${row.code || "SEM_CODIGO"}][${row.method || "sem-método"}] ${row.label}: ${row.detail || row.reason || "Sem detalhe"}`);
  lines.push("", "DADOS TÉCNICOS SEGUROS", JSON.stringify(technical, null, 2), "",
    "Privacidade: chaves de API, tokens de autorização e textos completos não são incluídos.");
  return lines.join("\n");
}

function moduleRecordingText(report) {
  if (!report) return "";
  return ["RELATÓRIO DE MAPEAMENTO DOS MÓDULOS A+", `Versão: ${report.recorderVersion || "não informada"}`,
    `ID: ${report.recordingId || "não informado"}`, `Início UTC: ${report.startedAt || "não informado"}`,
    `Fim UTC: ${report.finishedAt || "não informado"}`, `Duração: ${report.durationMs || 0} ms`,
    `Ações úteis: ${report.events?.length || 0}`, `Cliques ignorados: ${report.ignoredEvents || 0}`,
    "Ordem esperada: Imagem completa > Quatro imagens > Duas imagens > FAQ > Imagem completa > Especificações", "",
    "DADOS TÉCNICOS SEGUROS", JSON.stringify(report, null, 2)].join("\n");
}

function renderModuleRecorder(state = {}) {
  moduleRecording = Boolean(state.recording);
  moduleRecordingTabId = Number.isSafeInteger(state.tabId) ? state.tabId : moduleRecordingTabId;
  if (state.lastReport) lastModuleRecording = state.lastReport;
  const box = $("moduleRecorder");
  box.hidden = !moduleRecording && !lastModuleRecording && !state.interrupted;
  $("recordModules").disabled = moduleRecording || operationBusy;
  $("recordModules").textContent = moduleRecording ? "Registro em andamento…" : "Registrar montagem (suporte)";
  $("finishModuleRecording").disabled = !moduleRecording;
  $("copyModuleRecording").disabled = !lastModuleRecording;
  if (moduleRecording) {
    $("moduleRecorderSummary").textContent = "Registro em andamento na aba da Amazon";
    $("moduleRecorderDetail").textContent = `${state.events || 0} clique(s) registrado(s). Adicione os seis módulos manualmente, volte ao Studio e clique em Finalizar registro.`;
    box.className = "diagnostic-report running";
  } else if (state.interrupted) {
    $("moduleRecorderSummary").textContent = "O registro foi interrompido";
    $("moduleRecorderDetail").textContent = state.error || "A página foi recarregada ou fechada antes da finalização.";
    box.className = "diagnostic-report error";
  } else if (lastModuleRecording) {
    const counts = lastModuleRecording.finalState?.moduleCounts || {};
    $("moduleRecorderSummary").textContent = "Registro finalizado e pronto para copiar";
    $("moduleRecorderDetail").textContent = `${lastModuleRecording.events?.length || 0} ação(ões) útil(eis); ${lastModuleRecording.ignoredEvents || 0} clique(s) ignorado(s). Estrutura final: imagem completa ${counts.full || 0}, quatro imagens ${counts.four || 0}, duas imagens ${counts.two || 0}, FAQ ${counts.faq || 0}, especificações ${counts.specs || 0}.`;
    box.className = "diagnostic-report ok";
  }
}

function technicalCause(code = "") {
  if (code === "BRIDGE_LEASE_MISSING") return "a autorização temporária desapareceu da sessão do Chrome";
  if (code === "BRIDGE_TOKEN_MISMATCH") return "a página respondeu com uma autorização de outra tentativa";
  if (code === "BRIDGE_LEASE_EXPIRED") return "a autorização expirou antes de chegar aos campos";
  if (code === "BRIDGE_TAB_MISMATCH") return "a escrita foi direcionada a outra aba";
  if (code === "BRIDGE_DOCUMENT_MISSING") return "o Chrome não identificou o documento ativo";
  if (code === "BRIDGE_MAIN_TIMEOUT") return "o componente da Amazon não respondeu dentro do limite";
  if (code === "BRIDGE_MAIN_EXECUTION_ERROR") return "o Chrome não conseguiu executar o escritor no documento da Amazon";
  if (code === "FIELD_REVERTED_AFTER_WRITE") return "a Amazon aceitou e depois reverteu o conteúdo";
  if (code.startsWith("WRITER_KAT")) return "o componente KAT da Amazon recusou todas as estratégias de escrita";
  if (code.startsWith("WRITER_DRAFT")) return "o editor Draft.js recusou todas as estratégias de escrita";
  if (code === "FIELD_NOT_MAPPED") return "o campo deixou de corresponder ao mapa analisado";
  if (code === "FIELD_WRITE_TIMEOUT") return "a resposta de um campo excedeu o limite de tempo";
  return "consulte o primeiro campo com este código no relatório técnico";
}

function renderFillResult(report) {
  const box = $("fillResult"); box.hidden = !report; $("fillResultRows").replaceChildren();
  if (!report) return;
  const failed = (report.results || []).filter(row => !["filled", "same", "empty"].includes(row.status));
  $("fillResultSummary").textContent = `${report.filled || 0} de ${report.total || 0} campos confirmados`;
  const dominant = failed.reduce((counts, row) => {
    const code = row.code || "SEM_CODIGO"; counts[code] = (counts[code] || 0) + 1; return counts;
  }, {});
  const [dominantCode, dominantCount] = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0] || [];
  $("fillResultDetail").textContent = failed.length
    ? `${failed.length} falha(s). Causa dominante [${dominantCode} · ${dominantCount} campo(s)]: ${technicalCause(dominantCode)}. ID: ${report.technical?.attemptId || "não informado"}.`
    : `Preenchimento confirmado. ${(report.empty || 0)} campo(s) ficaram vazios por não terem texto salvo.`;
  box.className = `fill-result ${failed.length ? "error" : "ok"}`;
  const visible = failed.length ? failed : (report.results || []).filter(row => row.status === "empty");
  for (const item of visible) {
    const row = document.createElement("div"), strong = document.createElement("strong"), p = document.createElement("p");
    row.className = `fill-result-row ${item.status || "pending"}`;
    strong.textContent = `${item.label || item.key} · ${item.code || "SEM_CODIGO"}`;
    p.textContent = `${item.detail || item.reason || "Sem detalhe."}${item.method ? ` Método: ${item.method}.` : ""}`;
    row.append(strong, p); $("fillResultRows").append(row);
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

function collectListingWorkspace(project) {
  const old = project?.listing || {};
  return normalizeListingWorkspace({...old, model: $("listingModel").value || old.model,
    activeTool: currentIntelligenceTool,
    draft: {...old.draft,
      reviews: $("reviewInput").value,
      competitorReviews: $("competitorReviewInput").value,
      returnNotes: $("returnNotes").value,
      title: $("listingTitle").value,
      bullets: $("listingBullets").value,
      description: $("listingDescription").value,
      facts: $("listingFacts").value,
      keywords: $("listingKeywords").value,
      goal: $("listingGoal").value,
      useReviewAnalysis: $("useReviewInOptimizer").checked
    }});
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
    listing: collectListingWorkspace(old),
    config: {model: $("model").value, faqCount: Number($("faqCount").value), specCount: Number($("specCount").value),
      strategyMode: $("strategyMode").value, templateMode: $("templateMode").value, customStrategy: $("customStrategy").value,
      planningFocus: document.querySelector('input[name="planningFocus"]:checked')?.value || "commercial",
      returnRiskNotes: $("returnRiskNotes").value}});
}

function renderPlanningFocus(project = current()) {
  const focus = document.querySelector('input[name="planningFocus"]:checked')?.value || project?.config?.planningFocus || "commercial";
  const antiReturn = focus === "returns";
  $("returnFocusPanel").hidden = !antiReturn;
  const hasAnalysis = Boolean(project?.listing?.reviewAnalysis);
  $("importReviewRisks").disabled = !hasAnalysis;
  $("returnRiskSource").textContent = hasAnalysis
    ? "Há uma análise de avaliações disponível neste produto. Você pode importar o resumo e editá-lo."
    : "Nenhuma análise de avaliações está salva. Você pode preencher o campo manualmente.";
}

function markChanged() {
  const project = current(); if (!project) return;
  dirty = true; project.approved = false; project.validationWarnings = []; project.quality = null;
  project.fillReport = null;
  if (["approved", "filled"].includes(project.status)) project.status = "review";
  $("customStrategyWrap").hidden = $("strategyMode").value !== "custom";
  renderPlanningFocus(project);
  renderStrategy(collectProject());
  renderHeader(project);
}

function markIntelligenceChanged() {
  if (!current()) return;
  dirty = true;
  updateReviewSampleCount();
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

function renderStrategy(project) {
  previewStrategy = buildSalesStrategy(project || {});
  const strategy = previewStrategy, diagnosis = project?.plan?.diagnosis || {};
  const summary = $("strategySummary"); summary.replaceChildren();
  summary.closest(".strategy-card")?.classList.toggle("anti-return", strategy.planningFocus === "returns");
  for (const text of [strategy.categoryLabel, strategy.focusLabel, strategy.modeLabel]) {
    const tag = document.createElement("span"); tag.textContent = text; summary.append(tag);
    if (strategy.planningFocus === "returns" && text === strategy.focusLabel) tag.classList.add("anti-return");
  }
  const insights = [
    ["Quem compra", diagnosis.audience || strategy.buyer],
    ["Dor principal", diagnosis.main_problem || strategy.pain],
    ["Desejo", diagnosis.emotional_desire || strategy.desire],
    ["Objeções", diagnosis.main_objection || strategy.objections],
    ...(strategy.planningFocus === "returns" ? [["Risco central", strategy.riskContext || "Informe o problema de expectativa ou importe a análise de avaliações."]] : [])
  ];
  $("strategyInsights").replaceChildren(...insights.map(([label, value]) => {
    const row = document.createElement("div"), strong = document.createElement("strong"), p = document.createElement("p");
    strong.textContent = label; p.textContent = value; row.append(strong, p); return row;
  }));
  $("categoryChecklist").replaceChildren(...strategy.checklist.map(item => {
    const row = document.createElement("div"); row.className = `checklist-row ${item.found ? "found" : "missing"}`;
    const mark = document.createElement("span"); mark.textContent = item.found ? "✓" : "!";
    const content = document.createElement("div"), strong = document.createElement("strong"), p = document.createElement("p");
    strong.textContent = `${item.field} · ${item.found ? "encontrado" : "falta informar"}`; p.textContent = item.reason;
    content.append(strong, p); row.append(mark, content); return row;
  }));
  $("strategyAngles").replaceChildren(...strategy.angles.map(item => {
    const row = document.createElement("div"); row.className = "strategy-angle-row";
    const strong = document.createElement("strong"), span = document.createElement("span");
    strong.textContent = item.module; span.textContent = `${item.angle}: ${item.categoryFocus}. ${item.objective}`;
    row.append(strong, span); return row;
  }));
  $("addMissingFacts").disabled = strategy.missingFields.length === 0;
  $("addMissingFacts").textContent = strategy.missingFields.length ? `Adicionar ${strategy.missingFields.length} campo(s) ausente(s)` : "Checklist completo";
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
      const legacyFixedText = slot.key === "specs_heading"
        ? ["Especificações técnicas", "Ficha técnica", "Dados", "Info"].find(value => value.length <= slot.limit) || "" : "";
      const initialText = project.texts?.[slot.key] || slot.fixedText || legacyFixedText;
      const evidence = document.createElement("span"), ev = evidenceFor(initialText, project);
      evidence.className = `evidence${ev.level === "review" ? " review" : ""}`; evidence.textContent = ev.label;
      const counter = document.createElement("span"); counter.className = "counter";
      const copy = document.createElement("button"); copy.type = "button"; copy.className = "copy-text-button";
      copy.textContent = "⧉"; copy.title = "Copiar este texto"; copy.setAttribute("aria-label", `Copiar ${slot.label}`);
      const regenerate = document.createElement("button"); regenerate.type = "button"; regenerate.textContent = "Regenerar";
      regenerate.onclick = () => regenerateField(slot.key);
      const area = document.createElement("textarea"); area.dataset.key = slot.key; area.maxLength = Math.max(slot.limit * 2, slot.limit + 100);
      area.value = initialText; area.placeholder = project.texts && Object.keys(project.texts).length ? "Sem informação comprovada" : "Gere o rascunho para preencher";
      copy.onclick = async () => {
        if (!area.value.trim()) { toast("Este campo está vazio.", true); return; }
        try { await navigator.clipboard.writeText(area.value); toast("Texto copiado."); }
        catch { toast("Não foi possível copiar este texto.", true); }
      };
      const updateCounter = () => { counter.textContent = `${area.value.length}/${slot.limit}`; counter.classList.toggle("over", area.value.length > slot.limit); };
      area.addEventListener("input", () => { dirty = true; project.texts[slot.key] = area.value; project.approved = false; project.status = "review"; project.validationWarnings = []; project.quality = null; updateCounter();
        const next = evidenceFor(area.value, project); evidence.textContent = next.label; evidence.className = `evidence${next.level === "review" ? " review" : ""}`; renderHeader(project); });
      updateCounter(); actions.append(evidence, counter, copy, regenerate); head.append(label, actions); row.append(head, area); group.append(row);
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
    const angle = project.plan?.salesStrategy?.angles?.find(item => item.module === brief.module);
    const details = document.createElement("p"); details.textContent = `${angle ? `Ângulo: ${angle.angle} · ${angle.categoryFocus} | ` : ""}Objetivo: ${brief.goal} | Cena: ${brief.scene} | Composição: ${brief.composition}`;
    const prompt = document.createElement("p"); prompt.className = "brief-prompt"; prompt.textContent = brief.prompt;
    const copy = document.createElement("button"); copy.textContent = "Copiar prompt"; copy.onclick = () => navigator.clipboard.writeText(brief.prompt).then(() => toast("Prompt copiado."));
    row.append(h, details);
    if (project.config?.planningFocus === "returns") {
      const clarity = document.createElement("p"); clarity.className = "brief-clarity";
      clarity.textContent = [`Dúvida: ${brief.question_answered || "não informada"}`, `Risco reduzido: ${brief.return_risk_reduced || "não informado"}`,
        `Mostrar: ${brief.must_show || "não informado"}`, `Não sugerir: ${brief.must_not_suggest || "não informado"}`,
        brief.overlay_text ? `Texto opcional posterior: ${brief.overlay_text}` : ""].filter(Boolean).join(" | ");
      row.append(clarity);
    }
    row.append(prompt, copy); box.append(row);
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
    : "<strong>Aguardando aprovação</strong><p>Você já pode preparar os módulos; valide e aprove este produto antes de preencher os textos.</p>";
  $("fillAmazon").disabled = operationBusy;
}

const makeElement = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
};

const severityLabel = value => ({critical:"Crítico", high:"Alto", medium:"Médio", low:"Baixo"}[value] || "Revisar");
const confidenceLabel = value => ({high:"Alta", medium:"Média", low:"Baixa"}[value] || "Baixa");

function resultSection(title, rows = []) {
  const section = makeElement("section", "result-section"), heading = makeElement("h4", "", title);
  section.append(heading, ...rows);
  return section;
}

function textResultRows(items, emptyText = "Nenhum item informado.") {
  const values = (items || []).filter(Boolean);
  if (!values.length) return [makeElement("div", "result-row", emptyText)];
  return values.map(item => {
    const row = makeElement("div", "result-row"), p = makeElement("p", "", item);
    row.append(p); return row;
  });
}

function renderReviewAnalysis(result) {
  const box = $("reviewResult"); box.replaceChildren();
  $("copyReviewAnalysis").disabled = !result;
  if (!result) {
    const empty = makeElement("div", "result-empty");
    empty.append(makeElement("strong", "", "Nenhuma análise gerada"),
      makeElement("p", "", "Cole avaliações ou observações de devolução e clique em Analisar avaliações."));
    box.append(empty); return;
  }
  const critical = (result.return_triggers || []).some(item => ["critical", "high"].includes(item.priority));
  const summary = makeElement("section", `result-summary${critical ? " critical" : ""}`);
  summary.append(makeElement("h4", "", result.summary?.headline || "Análise concluída"),
    makeElement("p", "", result.summary?.diagnosis || "Revise os temas identificados."));
  const tags = makeElement("div", "result-tags");
  for (const text of [`${result.summary?.sample_size || 0} entrada(s) analisada(s)`, `Confiança ${confidenceLabel(result.summary?.confidence)}`,
    `${(result.return_triggers || []).length} gatilho(s) de devolução`]) tags.append(makeElement("span", "result-tag", text));
  summary.append(tags); box.append(summary);

  const themeRows = (result.themes || []).map(item => {
    const row = makeElement("div", "result-row"), head = makeElement("div", "result-row-head");
    head.append(makeElement("strong", "", item.name), makeElement("span", `severity ${item.severity}`, severityLabel(item.severity)));
    const detail = [item.mentions ? `${item.mentions} menção(ões) confirmada(s).` : "Contagem não confirmada.", item.expectation_gap, item.return_risk].filter(Boolean).join(" ");
    row.append(head, makeElement("p", "", detail));
    for (const quote of item.evidence || []) row.append(makeElement("div", "evidence-quote", `“${quote}”`));
    return row;
  });
  box.append(resultSection("Temas encontrados", themeRows.length ? themeRows : textResultRows([], "Nenhum tema sustentado pela amostra.")));

  const triggerRows = (result.return_triggers || []).map(item => {
    const row = makeElement("div", "result-row"), head = makeElement("div", "result-row-head");
    head.append(makeElement("strong", "", item.trigger), makeElement("span", `severity ${item.priority}`, severityLabel(item.priority)));
    row.append(head, makeElement("p", "", [item.why, item.action ? `Ação: ${item.action}` : ""].filter(Boolean).join(" "))); return row;
  });
  box.append(resultSection("Gatilhos de devolução", triggerRows.length ? triggerRows : textResultRows([], "Nenhum gatilho confirmado.")));

  const gapRows = (result.expectation_gaps || []).map(item => {
    const row = makeElement("div", "result-row");
    row.append(makeElement("strong", "", `Cliente espera: ${item.customer_expects || "não identificado"}`),
      makeElement("p", "", `Realidade informada: ${item.product_reality || "precisa de confirmação"}`),
      makeElement("p", "", `Correção sugerida: ${item.listing_correction || "revisar o anúncio"}`)); return row;
  });
  if (gapRows.length) box.append(resultSection("Expectativa x realidade", gapRows));
  const competitiveRows = (result.competitive_insights || []).map(item => {
    const row = makeElement("div", "result-row");
    row.append(makeElement("strong", "", item.finding || "Comparação"), makeElement("p", "", item.evidence),
      makeElement("p", "", item.opportunity ? `Oportunidade: ${item.opportunity}` : "")); return row;
  });
  if (competitiveRows.length) box.append(resultSection("Comparação com concorrentes", competitiveRows));
  box.append(resultSection("Ações imediatas", textResultRows(result.actions?.immediate)));
  if (result.actions?.images_video?.length) box.append(resultSection("Imagens e vídeo necessários", textResultRows(result.actions.images_video)));
  if (result.positives?.length) box.append(resultSection("Pontos positivos para preservar", textResultRows(result.positives)));
  if (result.customer_language?.length) box.append(resultSection("Linguagem usada pelos clientes", textResultRows(result.customer_language)));
  if (result.warnings?.length) box.append(resultSection("Revisão humana obrigatória", textResultRows(result.warnings)));
}

function optimizedBlock(title, value, className = "") {
  const section = makeElement("section", "optimized-block");
  section.append(makeElement("h4", "", title), makeElement("div", `optimized-copy ${className}`.trim(), value || "Não gerado"));
  return section;
}

function renderListingOptimization(result) {
  const box = $("listingResult"); box.replaceChildren();
  $("copyListingOptimization").disabled = !result;
  if (!result) {
    const empty = makeElement("div", "result-empty");
    empty.append(makeElement("strong", "", "Nenhuma otimização gerada"),
      makeElement("p", "", "Informe o anúncio atual, os fatos confirmados e clique em Otimizar anúncio."));
    box.append(empty); return;
  }
  const output = result.optimized || {};
  box.append(optimizedBlock(`Título · ${(output.title || "").length}/200`, output.title));
  const bullets = makeElement("section", "optimized-block"); bullets.append(makeElement("h4", "", "5 bullets"));
  const bulletList = makeElement("div", "optimized-copy numbered");
  (output.bullets || []).forEach((item, index) => bulletList.append(makeElement("div", "", `${index + 1}. ${item}`)));
  bullets.append(bulletList); box.append(bullets);
  box.append(optimizedBlock(`Descrição · ${(output.description || "").length}/2.000`, output.description));
  const backend = optimizedBlock("Termos de busca", output.backend_search_terms);
  backend.querySelector(".optimized-copy").append(makeElement("span", "byte-counter", `${new TextEncoder().encode(output.backend_search_terms || "").length}/249 bytes`));
  box.append(backend);

  const misleadingRows = (result.misleading_terms || []).map(item => {
    const row = makeElement("div", "result-row");
    row.append(makeElement("strong", "", item.term), makeElement("p", "", `${item.risk}${item.replacement ? ` Sugestão: ${item.replacement}` : ""}`)); return row;
  });
  const diagnosisRows = (result.diagnosis || []).map(item => {
    const row = makeElement("div", "result-row");
    row.append(makeElement("strong", "", item.area || "Anúncio"), makeElement("p", "", item.issue),
      makeElement("p", "", [item.impact, item.change ? `Mudança: ${item.change}` : ""].filter(Boolean).join(" "))); return row;
  });
  if (diagnosisRows.length) box.append(resultSection("Problemas corrigidos", diagnosisRows));
  if (misleadingRows.length) box.append(resultSection("Termos que podem induzir compra errada", misleadingRows));
  const guidanceRows = (result.buyer_guidance || []).map(item => {
    const row = makeElement("div", "result-row");
    row.append(makeElement("strong", "", item.question), makeElement("p", "", item.answer), makeElement("p", "", `Onde colocar: ${item.placement}`)); return row;
  });
  if (guidanceRows.length) box.append(resultSection("Orientações ao comprador", guidanceRows));
  const imageRows = (result.image_messages || []).map(item => {
    const row = makeElement("div", "result-row"), head = makeElement("div", "result-row-head");
    head.append(makeElement("strong", "", item.headline), makeElement("span", `severity ${item.priority}`, severityLabel(item.priority)));
    row.append(head, makeElement("p", "", item.visual), makeElement("p", "", item.caption)); return row;
  });
  if (imageRows.length) box.append(resultSection("Mensagens para imagens", imageRows));
  if (result.compliance_review?.length) box.append(resultSection("Revisar antes de publicar", textResultRows(result.compliance_review)));
  if (result.keyword_notes?.length) box.append(resultSection("Cobertura de palavras-chave", textResultRows(result.keyword_notes)));
}

function updateReviewSampleCount() {
  const count = countReviewEntries($("reviewInput").value);
  $("reviewSampleCount").textContent = count ? `Aproximadamente ${count} entrada(s) identificada(s)` : "Nenhuma avaliação identificada";
}

function switchIntelligenceTool(tool) {
  currentIntelligenceTool = tool === "optimizer" ? "optimizer" : "reviews";
  for (const button of document.querySelectorAll("[data-intel-tool]")) button.classList.toggle("active", button.dataset.intelTool === currentIntelligenceTool);
  $("intel-reviews").hidden = currentIntelligenceTool !== "reviews";
  $("intel-optimizer").hidden = currentIntelligenceTool !== "optimizer";
}

function renderIntelligence(project) {
  const workspace = normalizeListingWorkspace(project.listing);
  $("listingProductName").textContent = project.title || project.asin || "Produto sem título";
  $("listingProductMeta").textContent = [project.asin, "Análise e anúncio independentes do A+"].filter(Boolean).join(" · ");
  $("listingModel").value = workspace.model || project.config?.model || "auto/economico";
  $("reviewInput").value = workspace.draft.reviews || "";
  $("competitorReviewInput").value = workspace.draft.competitorReviews || "";
  $("returnNotes").value = workspace.draft.returnNotes || "";
  $("listingGoal").value = workspace.draft.goal || "returns";
  $("listingTitle").value = workspace.draft.title || project.title || "";
  $("listingBullets").value = workspace.draft.bullets || "";
  $("listingDescription").value = workspace.draft.description || project.description || "";
  $("listingKeywords").value = workspace.draft.keywords || "";
  $("listingFacts").value = workspace.draft.facts || (project.facts || []).filter(item => item.confirmed && item.field && item.value).map(item => `${item.field}: ${item.value}`).join("\n");
  $("useReviewInOptimizer").checked = workspace.draft.useReviewAnalysis !== false;
  $("useReviewInOptimizer").disabled = !workspace.reviewAnalysis;
  $("captureReviews").disabled = !(reviewTabId && reviewTabAsin === project.asin);
  updateReviewSampleCount();
  switchIntelligenceTool(workspace.activeTool || currentIntelligenceTool);
  renderReviewAnalysis(workspace.reviewAnalysis);
  renderListingOptimization(workspace.listingOptimization);
}

function renderWorkspaceVisibility() {
  const hasProject = Boolean(current());
  $("emptyState").hidden = hasProject;
  $("editor").hidden = !hasProject || currentWorkspace !== "aplus";
  $("listingWorkspace").hidden = !hasProject || currentWorkspace !== "listing";
  for (const button of document.querySelectorAll("[data-workspace]")) button.classList.toggle("active", button.dataset.workspace === currentWorkspace);
}

function renderEditor() {
  const project = current(); renderWorkspaceVisibility(); if (!project) return;
  renderHeader(project); $("asin").value = project.asin || ""; $("title").value = project.title || ""; $("description").value = project.description || "";
  const oldModel = project.config?.model;
  $("model").value = oldModel === "gemini/gemini-2.5-flash" ? "gemini/gemini-3.5-flash" : oldModel === "gemini/gemini-2.5-flash-lite" ? "gemini/gemini-3.5-flash-lite" : oldModel === "deepseek/deepseek-flash" ? "xkiro/auto-quality" : oldModel || "auto/economico"; $("faqCount").value = project.config?.faqCount || 5; $("specCount").value = project.config?.specCount || 6;
  $("strategyMode").value = project.config?.strategyMode || "auto"; $("templateMode").value = project.config?.templateMode || "auto";
  $("customStrategy").value = project.config?.customStrategy || ""; $("customStrategyWrap").hidden = $("strategyMode").value !== "custom";
  const focus = project.config?.planningFocus === "returns" ? "returns" : "commercial";
  const focusInput = document.querySelector(`input[name="planningFocus"][value="${focus}"]`); if (focusInput) focusInput.checked = true;
  $("returnRiskNotes").value = project.config?.returnRiskNotes || ""; renderPlanningFocus(project);
  renderFacts(project); renderStrategy(project); renderTexts(project); renderImages(project); renderValidation(project); renderFillResult(project.fillReport);
  renderIntelligence(project); switchTab(currentTab); renderWorkspaceVisibility();
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
  resetDashboardKeyTest();
  const status = await send("status");keyStates=status.keyStates||{};const current=keyStates[$("keyProvider").value]||{};keySaved=!!current.saved;
  $("apiState").textContent = keySaved ? `Chave configurada${current.fingerprint ? `, final ${current.fingerprint}` : ""}.` : "Nenhuma chave configurada para este provedor.";
  $("removeKey").disabled = !keySaved;
  $("savedKeyBox").hidden = !keySaved;
  $("newKeyBox").hidden = keySaved;
  $("savedKeyMask").value = keySaved ? `••••••••••••${current.fingerprint||""}` : "";
  $("saveKey").hidden = keySaved;
  $("testKey").hidden = keySaved;
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
$("apiSettings").onclick = () => { const selectedModel=currentWorkspace==="listing"?$("listingModel").value:$("model").value;const provider=providerForModel(selectedModel);if(provider!=="auto")$("keyProvider").value=provider;refreshKeyState().catch(error => toast(error.message, true)); $("apiDialog").showModal(); };
$("testKey").onclick = async () => { try { const candidate=dashboardKeyCandidate();$("testKey").disabled=true;$("keyTestStatus").textContent="Testando autenticação e acesso ao modelo…";const result=await send("testKey",{apiKey:$("apiKey").value,model:providerModel()});testedKeyCandidate=candidate;$("saveKey").disabled=false;$("keyTestStatus").textContent=result.modelAvailable?`Chave válida. O modelo ${result.model} está disponível.`:`Chave válida, mas o modelo ${result.model} não apareceu na conta.`;toast("Chave testada. Agora você pode salvá-la.");} catch(error){resetDashboardKeyTest(error.message);toast(error.message,true);} finally{$("testKey").disabled=!$("apiKey").value.trim();} };
$("saveKey").onclick = async () => { try { if(testedKeyCandidate!==dashboardKeyCandidate())throw new Error("Teste esta chave antes de salvar.");await send("saveKey", {apiKey: $("apiKey").value,model:providerModel()}); $("apiKey").value = ""; testedKeyCandidate="";await refreshKeyState(); toast("API Key testada e salva."); } catch (error) { toast(error.message, true); } };
$("removeKey").onclick = async () => { try { await send("forgetKey",{model:providerModel()}); $("apiKey").value=""; await refreshKeyState(); toast("API Key removida."); } catch (error) { toast(error.message, true); } };
$("keyProvider").onchange=()=>refreshKeyState().catch(error=>toast(error.message,true));
$("replaceSavedKey").onclick = () => { $("newKeyBox").hidden=false; $("saveKey").hidden=false; $("testKey").hidden=false; resetDashboardKeyTest();$("apiKey").focus(); };
$("apiKey").addEventListener("input",()=>resetDashboardKeyTest());
$("saveProject").onclick = () => save(true).catch(error => toast(error.message, true));
$("addFact").onclick = () => $("facts").append(factRow());
$("projectSearch").addEventListener("input", renderProjects);
for (const id of ["asin", "title", "description", "model", "faqCount", "specCount", "strategyMode", "templateMode", "customStrategy", "returnRiskNotes"]) $(id).addEventListener("input", markChanged);
for (const input of document.querySelectorAll('input[name="planningFocus"]')) input.addEventListener("change", markChanged);
$("importReviewRisks").onclick = () => {
  const context = reviewRiskContext(current()?.listing?.reviewAnalysis);
  if (!context) return toast("Analise as avaliações deste produto antes de importar os riscos.", true);
  $("returnRiskNotes").value = context;
  markChanged();
  toast("Problemas de expectativa importados. Revise antes de gerar o A+.");
};
$("addMissingFacts").onclick = () => {
  const existing = new Set([...$("facts").querySelectorAll(".fact-row input:first-child")]
    .map(input => input.value.trim().toLocaleLowerCase("pt-BR")));
  const missing = (previewStrategy?.checklist || []).filter(item => !item.found && !existing.has(item.field.toLocaleLowerCase("pt-BR")));
  if (!missing.length) return toast("Os campos ausentes já estão na ficha factual. Preencha os valores que souber.");
  for (const item of missing) $("facts").append(factRow({field: item.field, value: "", source: "Informado manualmente", confirmed: true}));
  markChanged(); $("facts").querySelector(".fact-row input:placeholder-shown")?.focus();
  toast(`${missing.length} campo(s) adicionado(s) à ficha factual. Preencha apenas o que souber.`);
};
for (const button of document.querySelectorAll(".tabs button")) button.onclick = () => switchTab(button.dataset.tab);
for (const button of document.querySelectorAll("[data-workspace]")) button.onclick = () => {
  currentWorkspace = button.dataset.workspace === "listing" ? "listing" : "aplus";
  renderWorkspaceVisibility();
};
for (const button of document.querySelectorAll("[data-intel-tool]")) button.onclick = () => {
  switchIntelligenceTool(button.dataset.intelTool); markIntelligenceChanged();
};
for (const id of ["listingModel", "reviewInput", "competitorReviewInput", "returnNotes", "listingGoal", "listingTitle", "listingBullets", "listingDescription", "listingKeywords", "listingFacts", "useReviewInOptimizer"])
  $(id).addEventListener("input", markIntelligenceChanged);

async function runIntelligence(action, successMessage) {
  if (operationBusy) return;
  operationBusy = true; $("listingWorkspace").inert = true;
  const originalStatus = $("jobStatus").textContent;
  $("jobStatus").textContent = action === "listingAnalyze" ? "Analisando avaliações…" : "Otimizando anúncio…";
  try {
    const project = await save(false);
    const result = await send(action, {project});
    projects = result.projects; activeId = result.activeProjectId; dirty = false; renderAll();
    toast(successMessage);
  } catch (error) { toast(error.message, true); }
  finally { operationBusy = false; $("listingWorkspace").inert = false; $("jobStatus").textContent = originalStatus; await refresh(); }
}

$("analyzeReviews").onclick = () => runIntelligence("listingAnalyze", "Avaliações analisadas. O diagnóstico foi salvo neste produto.");
$("optimizeListing").onclick = () => runIntelligence("listingOptimize", "Anúncio otimizado. Revise as informações antes de publicar.");
$("openReviews").onclick = async () => {
  try {
    const project = await save(false);
    if (!project?.asin) throw new Error("Informe um ASIN válido no produto antes de abrir as avaliações.");
    const tab = await chrome.tabs.create({url:`https://www.amazon.com.br/product-reviews/${project.asin}/?sortBy=recent`});
    reviewTabId = tab.id; reviewTabAsin = project.asin; $("captureReviews").disabled = false;
    toast("Aguarde as avaliações carregarem. Se a Amazon pedir verificação, conclua-a antes de capturar.");
  } catch(error) { toast(error.message, true); }
};
$("captureReviews").onclick = async () => {
  try {
    const project = await save(false);
    const data = await send("listingCaptureReviews", {asin:project.asin, tabId:reviewTabId});
    const previous = $("reviewInput").value.split(/\n\s*\n/).map(item=>item.trim()).filter(Boolean);
    const merged = [...new Set([...previous, ...(data.reviews || [])])].join("\n\n").slice(0, 60000);
    $("reviewInput").value = merged; markIntelligenceChanged();
    toast(`${data.count} avaliação(ões) visível(is) capturada(s). Duplicadas foram ignoradas.`);
  } catch(error) { toast(error.message, true); }
};
$("clearReviewAnalysis").onclick = async () => {
  try { const project = await save(false), result = await send("listingClear", {project, target:"reviews"}); projects=result.projects;activeId=result.activeProjectId;dirty=false;renderAll();toast("Diagnóstico removido."); }
  catch(error){toast(error.message,true);}
};
$("clearListingOptimization").onclick = async () => {
  try { const project = await save(false), result = await send("listingClear", {project, target:"optimizer"}); projects=result.projects;activeId=result.activeProjectId;dirty=false;renderAll();toast("Otimização removida."); }
  catch(error){toast(error.message,true);}
};
$("copyReviewAnalysis").onclick = async () => {
  const text = reviewAnalysisText(current()?.listing?.reviewAnalysis); if (!text) return;
  try { await navigator.clipboard.writeText(text); toast("Relatório de avaliações copiado."); } catch { toast("Não foi possível copiar o relatório.", true); }
};
$("copyListingOptimization").onclick = async () => {
  const text = listingOptimizationText(current()?.listing?.listingOptimization); if (!text) return;
  try { await navigator.clipboard.writeText(text); toast("Anúncio completo copiado."); } catch { toast("Não foi possível copiar o anúncio.", true); }
};

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
$("recordModules").onclick = async () => {
  if (operationBusy || moduleRecording) return;
  operationBusy = true; $("recordModules").disabled = true;
  try {
    const project = await save(false), tabId = await sellerTabId();
    const result = await send("projectModuleRecordStart", {project, tabId});
    moduleRecordingTabId = tabId;
    renderModuleRecorder({...result, tabId, lastReport: lastModuleRecording});
    toast("Registro iniciado. Adicione os seis módulos manualmente na Amazon e depois volte ao Studio.");
  } catch (error) { toast(error.message, true); }
  finally { operationBusy = false; renderModuleRecorder({recording: moduleRecording, tabId: moduleRecordingTabId, lastReport: lastModuleRecording}); }
};
$("finishModuleRecording").onclick = async () => {
  if (operationBusy || !moduleRecording) return;
  operationBusy = true; $("finishModuleRecording").disabled = true;
  try {
    lastModuleRecording = await send("projectModuleRecordStop", {tabId: moduleRecordingTabId});
    moduleRecording = false;
    renderModuleRecorder({recording: false, lastReport: lastModuleRecording});
    toast("Registro finalizado. Copie o relatório de montagem e envie para análise.");
  } catch (error) { toast(error.message, true); }
  finally { operationBusy = false; $("finishModuleRecording").disabled = !moduleRecording; }
};
$("copyModuleRecording").onclick = async () => {
  const text = moduleRecordingText(lastModuleRecording); if (!text) return;
  try { await navigator.clipboard.writeText(text); toast("Relatório de montagem copiado."); }
  catch { toast("Não foi possível copiar o relatório de montagem.", true); }
};
$("fillAmazon").onclick = async () => {
  if (operationBusy) return;
  operationBusy = true;
  const button = $("fillAmazon"), originalLabel = button.textContent;
  button.disabled = true; button.textContent = "Verificando módulos…"; $("diagnoseAmazon").disabled = true;
  try {
    const project = await save(false), tabId = await sellerTabId();
    const preparation = await send("projectPrepareModules", {project, tabId});
    amazonModulesReady = Boolean(preparation.ready);
    if (!preparation.alreadyReady) {
      switchTab("publish");
      toast(`${preparation.addedModules} módulo(s) e ${preparation.addedRows} linha(s) adicionados. Revise a Amazon e clique novamente para preencher os textos.`);
      return;
    }
    button.textContent = "Preenchendo…";
    const report = await send("projectFill", {project, tabId});
    await refresh(); switchTab("publish");
    if (!report.filled) toast("Nenhum campo foi confirmado. Veja o relatório detalhado abaixo do diagnóstico.", true);
    else if (report.failed) toast(`${report.filled} de ${report.total} campos confirmados; ${report.failed} falha(s) detalhada(s) no relatório.`, true);
    else toast(`${report.filled} de ${report.total} campos confirmados. Revise antes de salvar na Amazon.`);
  }
  catch (error) { toast(error.message, true); }
  finally {
    operationBusy = false; button.disabled = false; button.textContent = amazonModulesReady ? "Preencher textos" : originalLabel; $("diagnoseAmazon").disabled = false;
  }
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
$("copyFillResult").onclick = async () => {
  const report = current()?.fillReport, text = fillReportText(report); if (!text) return;
  try { await navigator.clipboard.writeText(text); toast("Relatório de preenchimento copiado."); }
  catch { toast("Não foi possível copiar o relatório.", true); }
};
$("deleteProject").onclick = async () => {
  if (!confirm("Excluir este projeto? Esta ação não altera nada na Amazon.")) return;
  try { const result = await send("projectDelete", {id: activeId}); projects = result.projects; activeId = result.activeProjectId; renderAll(); toast("Projeto excluído."); }
  catch (error) { toast(error.message, true); }
};
$("exportTexts").onclick = () => {
  const project = collectProject(); if (!project) return; const slots = project.slots?.length ? project.slots : makeSlots(project.config);
  const lines = [`A+ STUDIO 1.5.15 · ${project.title}`, project.asin, "", ...slots.flatMap(slot => [slot.label, project.texts[slot.key] || "", ""]), "OBSERVAÇÕES", ...project.notes];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {type:"text/plain;charset=utf-8"}), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${project.asin || "produto"}-textos-aplus.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

async function initializePanel() {
  const label = document.querySelector(".topbar h1");
  $("listingModel").replaceChildren(...[...$("model").options].map(option => option.cloneNode(true)));
  label.textContent = "A+ Studio · painel 1.5.16";
  try {
    const hello = await send("panelHello");
    if (hello.version !== "1.5.16") throw new Error(`Painel 1.5.16 conectado à extensão ${hello.version}. Substitua os arquivos na pasta instalada e recarregue a extensão.`);
    label.textContent = `A+ Studio · ${hello.version} conectado`;
    await refresh();
    const recorderState = await send("projectModuleRecordStatus");
    renderModuleRecorder(recorderState);
  } catch (error) {
    $("jobStatus").textContent = error.message;
    toast(error.message, true);
  }
}
initializePanel();
