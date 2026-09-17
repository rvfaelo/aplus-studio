(() => {
  const contentVersion = globalThis.chrome?.runtime?.getManifest?.().version || "1.5.15";
  const pageChannel = `aplus-page-v${contentVersion}`;
  if (globalThis.__aplusPremiumInstalled === contentVersion) return;
  try { globalThis.__aplusPremiumCleanup?.(); } catch { /* Uma versão anterior pode não oferecer limpeza. */ }
  globalThis.__aplusPremiumInstalled = contentVersion;
  const E = globalThis.APlusEngine;
  const M = globalThis.APlusModuleAutomation;
  const manual = new Map();
  const OPERATION_STALE_MS = 30000;
  const FIELD_WRITE_TIMEOUT_MS = 12000;
  let snapshot = null, undoStack = [], operation = null, moduleRecorder = null;
  let closePanel = () => {};

  const operationView = (current = operation) => current ? {
    id: current.id,
    type: current.type,
    startedAt: current.startedAt,
    heartbeatAt: current.heartbeatAt,
    current: current.current,
    total: current.total,
    label: current.label || "",
    elapsedMs: Math.max(0, Date.now() - current.startedAt),
    idleMs: Math.max(0, Date.now() - current.heartbeatAt),
    stale: Date.now() - current.heartbeatAt > OPERATION_STALE_MS
  } : null;

  function recoverStaleOperation() {
    if (!operation || Date.now() - operation.heartbeatAt <= OPERATION_STALE_MS) return null;
    const recovered = operationView();
    operation.cancelled = true;
    operation = null;
    return recovered;
  }

  function requireIdle() {
    recoverStaleOperation();
    if (moduleRecorder) throw new Error("Finalize o registro da montagem manual antes de preencher ou mapear campos.");
    if (!operation) return;
    const info = operationView();
    const progress = info.total ? ` (${info.current || 0}/${info.total})` : "";
    throw new Error(`Já existe um preenchimento em andamento${progress}. Aguarde alguns segundos ou use Cancelar.`);
  }

  function beginOperation(type, total = 0) {
    requireIdle();
    const token = {id: crypto.randomUUID(), type, total, current: 0, label: "", startedAt: Date.now(), heartbeatAt: Date.now(), cancelled: false};
    operation = token;
    return token;
  }

  function touchOperation(token, current, label = "") {
    if (operation !== token || token.cancelled) return false;
    token.current = current;
    token.label = label;
    token.heartbeatAt = Date.now();
    return true;
  }

  function finishOperation(token) {
    if (operation === token) operation = null;
  }

  async function withTimeout(promise, timeoutMs, message) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }

  function discoverMapped() {
    const discovered = E.discover();
    const mapping = discovered.mapping;
    for (const [key, desc] of manual) {
      if (E.visible(desc.el)) {
        // Uma associação manual substitui qualquer associação automática do mesmo campo.
        for (const [other, value] of mapping) if (value.el === desc.el) mapping.delete(other);
        mapping.set(key, E.descriptor(desc.el));
      } else manual.delete(key);
    }
    return discovered;
  }

  function scan(slots) {
    const discovered = discoverMapped();
    const mapping = discovered.mapping;
    snapshot = {id: crypto.randomUUID(), href: location.href, targets: new Map()};
    const entries = slots.map(slot => {
      const d = mapping.get(slot.key);
      if (d) snapshot.targets.set(slot.key, {...d, before: E.read(d.el)});
      return {key: slot.key, label: slot.label, found: !!d, field: d?.label || "Não identificado",
        pageLimit: d?.limit ?? null, existing: d ? !!E.clean(E.read(d.el)) : false};
    });
    return {scanId: snapshot.id, href: snapshot.href, entries, counts: discovered.counts, features: discovered.features,
      moduleCounts: discovered.moduleCounts || {},
      candidates: discovered.descriptors.filter(d => !d.excluded).length, warnings: discovered.warnings};
  }

  function classifyModuleElement(element) {
    const id = String(element.getAttribute("data-module-id") || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const text = String(element.getAttribute("data-module-type") || element.getAttribute("aria-label") || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const value = `${id} ${text}`;
    if (/full\s*background\s*image|fullbackground-image|full\s*width\s*image|full\s*image|imagem completa/.test(value)) return "full";
    if (/four\s*column\s*images|four-column-images|4\s*column\s*images|quatro imagens/.test(value)) return "four";
    if (/two\s*column\s*images|two-column-images|2\s*column\s*images|duas imagens/.test(value)) return "two";
    if (/tech\s*specs|tech-specs|technical\s*spec|especifica/.test(value)) return "specs";
    if (/\bfaq\b|faqs|perguntas/.test(value)) return "faq";
    return null;
  }

  function moduleSnapshot(result) {
    const access = E.roots();
    const moduleElements = [...new Set(access.roots.flatMap(root => Array.from(root.querySelectorAll("[data-module-id]"))))]
      .sort((left, right) => {
        if (left === right) return 0;
        const relation = left.compareDocumentPosition?.(right) || 0;
        return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : relation & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
      });
    const moduleIds = [], moduleTypes = [];
    const moduleCounts = {full: 0, four: 0, two: 0, faq: 0, specs: 0};
    for (const element of moduleElements) {
      const type = classifyModuleElement(element);
      if (!type) continue;
      moduleCounts[type]++;
      moduleTypes.push(type);
      moduleIds.push(String(element.getAttribute("data-module-id") || type));
    }
    for (const [key, value] of Object.entries(result.moduleCounts || {}))
      moduleCounts[key] = Math.max(moduleCounts[key] || 0, Number(value) || 0);
    const found = new Set(result.entries.filter(entry => entry.found).map(entry => entry.key));
    if (found.has("hero_headline") || found.has("hero_body")) moduleCounts.full = Math.max(moduleCounts.full, 1);
    if (found.has("closing_headline") || found.has("closing_body")) moduleCounts.full = Math.max(moduleCounts.full, 2);
    if ([1, 2, 3, 4].some(i => found.has(`four_${i}_headline`) || found.has(`four_${i}_body`))) moduleCounts.four = Math.max(moduleCounts.four, 1);
    if ([1, 2].some(i => found.has(`two_${i}_headline`) || found.has(`two_${i}_body`))) moduleCounts.two = Math.max(moduleCounts.two, 1);
    if ([...found].some(key => key.startsWith("faq_"))) moduleCounts.faq = Math.max(moduleCounts.faq, 1);
    if ([...found].some(key => key.startsWith("spec_") || key === "specs_heading")) moduleCounts.specs = Math.max(moduleCounts.specs, 1);
    return {access, moduleIds: moduleIds.slice(0, 40), moduleTypes: moduleTypes.slice(0, 40), moduleCounts};
  }

  function controlVisible(element) {
    if (!element?.isConnected || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
    if (style?.display === "none" || style?.visibility === "hidden" || style?.pointerEvents === "none") return false;
    const rect = element.getBoundingClientRect?.();
    return !!rect && rect.width > 0 && rect.height > 0;
  }

  function availableControls() {
    const selector = 'button,[role="button"],kat-button,a[href],input[type="button"],input[type="submit"]';
    const controls = [];
    for (const root of E.roots().roots) {
      for (const element of root.querySelectorAll?.(selector) || []) {
        if (!controlVisible(element) || element.disabled || element.getAttribute?.("aria-disabled") === "true") continue;
        const descriptor = controlDescriptor(element);
        const labels = [descriptor?.label, descriptor?.ariaLabel, descriptor?.title, element.value];
        const kind = labels.map(value => M?.kindForLabel(value)).find(Boolean);
        if (kind) controls.push({element, descriptor, kind});
      }
    }
    return [...new Map(controls.map(item => [item.element, item])).values()];
  }

  function findControl(kind) {
    const matches = availableControls().filter(item => item.kind === kind);
    return kind === "add_module" || kind === "add_question" || kind === "add_specification"
      ? matches.at(-1) || null : matches[0] || null;
  }

  async function waitForControl(kind, token, timeoutMs = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (operation !== token || token.cancelled) throw new Error("[MODULE_OPERATION_CANCELLED] A montagem foi cancelada.");
      const control = findControl(kind);
      if (control) return control;
      await E.wait(200);
    }
    throw new Error(`[MODULE_CONTROL_NOT_FOUND] O controle “${kind}” não apareceu na Amazon. Abra o seletor manualmente e confira se a página terminou de carregar.`);
  }

  function activateControl(control) {
    const element = control?.element;
    if (!element || !controlVisible(element)) throw new Error("[MODULE_CONTROL_DISAPPEARED] O controle da Amazon desapareceu antes do clique.");
    element.scrollIntoView?.({block: "center", inline: "center", behavior: "auto"});
    element.focus?.({preventScroll: true});
    element.click();
  }

  function moduleState(slots) {
    const discovered = discoverMapped();
    const entries = [...discovered.mapping.keys()].map(key => ({key, found: true}));
    const modules = moduleSnapshot({entries, moduleCounts: discovered.moduleCounts || {}});
    const pageText = String(document.body?.innerText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return {
      moduleTypes: modules.moduleTypes,
      moduleCounts: modules.moduleCounts,
      moduleIds: modules.moduleIds,
      faqRows: Number(discovered.counts?.faq || 0),
      specRows: Number(discovered.counts?.specs || 0),
      renderErrors: (pageText.match(/(?:erro ao reproduzir o modulo|error (?:while )?rendering (?:the )?module)/g) || []).length,
      fields: discovered.mapping.size,
      expectedFields: slots.length
    };
  }

  async function waitForState(slots, token, predicate, code, timeoutMs = 15000) {
    const startedAt = Date.now();
    let state = moduleState(slots);
    while (!predicate(state) && Date.now() - startedAt < timeoutMs) {
      if (operation !== token || token.cancelled) throw new Error("[MODULE_OPERATION_CANCELLED] A montagem foi cancelada.");
      if (state.renderErrors) throw new Error("[MODULE_RENDER_ERROR] A Amazon informou erro ao reproduzir um módulo. Recarregue o editor antes de tentar novamente.");
      await E.wait(250);
      state = moduleState(slots);
    }
    if (!predicate(state)) throw new Error(`[${code}] A Amazon não confirmou a alteração dentro do tempo esperado. Nenhum outro módulo foi adicionado.`);
    return state;
  }

  const requestedRows = (slots, prefix, fallback) => Math.max(fallback, ...slots.map(slot => {
    const match = String(slot.key || "").match(new RegExp(`^${prefix}_(\\d+)_`));
    return match ? Number(match[1]) : 0;
  }));

  async function ensureRows({slots, token, type, expected, controlKind, steps}) {
    const property = type === "faq" ? "faqRows" : "specRows";
    let state = moduleState(slots), safety = 0;
    if (state[property] === 0) {
      state = await waitForState(slots, token, item => item[property] > 0, "MODULE_ROWS_NOT_DISCOVERED");
    }
    while (state[property] < expected && safety++ < expected + 2) {
      touchOperation(token, token.current + 1, type === "faq" ? "Adicionar pergunta" : "Adicionar especificação");
      const before = state[property], control = await waitForControl(controlKind, token);
      activateControl(control);
      state = await waitForState(slots, token, item => item[property] > before, "MODULE_ROW_NOT_CONFIRMED");
      steps.push({action: controlKind, status: "confirmed", before, after: state[property]});
    }
    if (state[property] < expected) throw new Error(`[MODULE_ROWS_INCOMPLETE] A Amazon confirmou ${state[property]} de ${expected} linhas no módulo ${type}.`);
    return state;
  }

  async function prepareModules(slots) {
    const target = M?.TARGET_SEQUENCE || ["full", "four", "two", "faq", "full", "specs"];
    const faqRows = requestedRows(slots, "faq", 5), specRows = requestedRows(slots, "spec", 6);
    const token = beginOperation("modules", target.length + faqRows + specRows);
    const startedAt = Date.now(), steps = [];
    try {
      let state = moduleState(slots), startSequence = [...state.moduleTypes];
      if (state.renderErrors) throw new Error("[MODULE_RENDER_ERROR] A Amazon informou erro ao reproduzir um módulo. Recarregue o editor antes de tentar novamente.");
      const countedModules = Object.values(state.moduleCounts).reduce((sum, value) => sum + Number(value || 0), 0);
      if (countedModules > state.moduleTypes.length) {
        throw new Error("[MODULE_ORDER_NOT_CONFIRMED] A Amazon mostrou módulos existentes, mas não expôs a ordem deles com segurança. A extensão parou para não criar duplicatas. Recarregue a página e execute o diagnóstico.");
      }
      if (!M?.isTargetPrefix(state.moduleTypes, target)) {
        throw new Error(`[MODULE_STRUCTURE_NOT_PREFIX] A estrutura atual (${state.moduleTypes.join(" > ") || "não identificada"}) não corresponde ao início do padrão (${target.join(" > ")}). Para proteger seu conteúdo, a extensão não exclui nem reordena módulos.`);
      }
      let addedModules = 0, addedRows = 0;
      for (let index = state.moduleTypes.length; index < target.length; index++) {
        const type = target[index];
        touchOperation(token, index + 1, `Adicionar módulo ${type}`);
        const addControl = await waitForControl("add_module", token);
        activateControl(addControl);
        steps.push({action: "add_module", module: type, status: "clicked"});
        const option = await waitForControl(type, token);
        activateControl(option);
        const expectedSequence = target.slice(0, index + 1);
        state = await waitForState(slots, token, item => item.moduleTypes.length === expectedSequence.length &&
          item.moduleTypes.every((value, position) => value === expectedSequence[position]), "MODULE_INSERT_NOT_CONFIRMED");
        addedModules++;
        steps.push({action: "select_module", module: type, status: "confirmed", sequence: [...state.moduleTypes]});
        if (type === "faq") {
          const before = state.faqRows;
          state = await ensureRows({slots, token, type, expected: faqRows, controlKind: "add_question", steps});
          addedRows += Math.max(0, state.faqRows - before);
        }
        if (type === "specs") {
          const before = state.specRows;
          state = await ensureRows({slots, token, type, expected: specRows, controlKind: "add_specification", steps});
          addedRows += Math.max(0, state.specRows - before);
        }
      }
      if (state.moduleTypes.includes("faq") && state.faqRows < faqRows) {
        const before = state.faqRows;
        state = await ensureRows({slots, token, type: "faq", expected: faqRows, controlKind: "add_question", steps});
        addedRows += Math.max(0, state.faqRows - before);
      }
      if (state.moduleTypes.includes("specs") && state.specRows < specRows) {
        const before = state.specRows;
        state = await ensureRows({slots, token, type: "specs", expected: specRows, controlKind: "add_specification", steps});
        addedRows += Math.max(0, state.specRows - before);
      }
      return {ready: true, alreadyReady: addedModules === 0 && addedRows === 0, addedModules, addedRows,
        startSequence, finalSequence: state.moduleTypes, moduleCounts: state.moduleCounts, faqRows: state.faqRows,
        specRows: state.specRows, steps, durationMs: Date.now() - startedAt, version: contentVersion};
    } finally { finishOperation(token); }
  }

  async function diagnose(slots) {
    const recoveredOperation = recoverStaleOperation();
    let result = scan(slots), snapshotModules = moduleSnapshot(result);
    let best = {result, snapshotModules};
    const isComplete = item => item.result.entries.every(entry => entry.found) &&
      item.snapshotModules.moduleCounts.full === 2 && item.snapshotModules.moduleCounts.four >= 1 &&
      item.snapshotModules.moduleCounts.two >= 1 && item.snapshotModules.moduleCounts.faq >= 1 && item.snapshotModules.moduleCounts.specs >= 1;
    for (let attempt = 0; !isComplete(best) && attempt < 6; attempt++) {
      await E.wait(350);
      result = scan(slots);
      snapshotModules = moduleSnapshot(result);
      const score = r => r.result.entries.filter(entry => entry.found).length + Object.values(r.snapshotModules.moduleCounts).reduce((sum, value) => sum + Number(value || 0), 0);
      if (score({result, snapshotModules}) >= score(best)) best = {result, snapshotModules};
    }
    result = best.result;
    const {access, moduleIds, moduleTypes, moduleCounts} = best.snapshotModules;
    const pageText = String(document.body?.innerText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const loginRequired = !!document.querySelector('#ap_email,#ap_password,form[name="signIn"],input[name="email"]');
    const verificationRequired = !!document.querySelector('#captchacharacters,input[name="otpCode"],input[name="code"],input[autocomplete="one-time-code"]') ||
      /(?:insira os caracteres|enter the characters|verificacao temporaria|temporary verification|codigo de verificacao|verification code)/.test(pageText);
    const renderErrors = (pageText.match(/(?:erro ao reproduzir o modulo|error (?:while )?rendering (?:the )?module)/g) || []).length;
    const loadingIndicators = document.querySelectorAll('[aria-busy="true"],kat-spinner,kat-progress,kat-loading').length;
    return {
      version: contentVersion,
      href: location.href,
      readyState: document.readyState,
      foundFields: result.entries.filter(entry => entry.found).length,
      expectedFields: result.entries.length,
      candidates: result.candidates,
      moduleIds,
      moduleTypes,
      moduleCounts,
      counts: result.counts,
      warnings: result.warnings,
      blockedFrames: access.blockedFrames,
      loginRequired,
      verificationRequired,
      renderErrors,
      loadingIndicators,
      operation: operationView(),
      recoveredOperation
    };
  }

  function safeUiText(value, limit = 180) {
    return String(value || "").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email removido]")
      .replace(/\bB0[A-Z0-9]{8}\b/gi, "[ASIN]")
      .replace(/\b\d{7,}\b/g, "[número removido]").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function stableClasses(element) {
    return [...(element?.classList || [])].filter(value => value.length <= 48 && !/[a-f0-9]{12,}/i.test(value) && !/\d{4,}/.test(value)).slice(0, 8);
  }

  function controlDescriptor(element) {
    if (!element?.getAttribute) return null;
    const tag = String(element.localName || element.tagName || "").toLowerCase();
    const inputLabel = /^(?:button|submit|reset)$/i.test(String(element.type || "")) ? element.value : "";
    const label = safeUiText(element.getAttribute("aria-label") || element.getAttribute("title") ||
      element.innerText || element.textContent || inputLabel);
    const descriptor = {
      tag,
      role: safeUiText(element.getAttribute("role"), 60) || null,
      label: label || null,
      ariaLabel: safeUiText(element.getAttribute("aria-label")) || null,
      title: safeUiText(element.getAttribute("title")) || null,
      name: safeUiText(element.getAttribute("name"), 80) || null,
      type: safeUiText(element.getAttribute("type"), 40) || null,
      testId: safeUiText(element.getAttribute("data-testid") || element.getAttribute("data-test-id") ||
        element.getAttribute("data-automation-id"), 120) || null,
      action: safeUiText(element.getAttribute("data-action"), 80) || null,
      classes: stableClasses(element)
    };
    const path = [];
    for (let node = element.parentElement, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
      const item = {tag: String(node.localName || "").toLowerCase(), role: safeUiText(node.getAttribute?.("role"), 50) || null,
        ariaLabel: safeUiText(node.getAttribute?.("aria-label"), 100) || null,
        testId: safeUiText(node.getAttribute?.("data-testid") || node.getAttribute?.("data-test-id") || node.getAttribute?.("data-automation-id"), 100) || null,
        classes: stableClasses(node).slice(0, 4)};
      if (item.tag || item.role || item.ariaLabel || item.testId || item.classes.length) path.push(item);
    }
    descriptor.path = path;
    return descriptor;
  }

  function recorderState(slots, includeControls = false) {
    const discovered = discoverMapped();
    const entries = [...discovered.mapping.keys()].map(key => ({key, found: true}));
    const snapshotModules = moduleSnapshot({entries, moduleCounts: discovered.moduleCounts || {}});
    const pageText = String(document.body?.innerText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const state = {
      atMs: moduleRecorder ? Date.now() - moduleRecorder.startedAt : 0,
      moduleCounts: snapshotModules.moduleCounts,
      moduleIds: snapshotModules.moduleIds,
      moduleTypes: snapshotModules.moduleTypes,
      candidates: discovered.descriptors.filter(item => !item.excluded).length,
      loadingIndicators: document.querySelectorAll('[aria-busy="true"],kat-spinner,kat-progress,kat-loading').length,
      renderErrors: (pageText.match(/(?:erro ao reproduzir o modulo|error (?:while )?rendering (?:the )?module)/g) || []).length
    };
    if (!includeControls) return state;
    const interactiveSelector = 'button,[role="button"],kat-button,a[href],input[type="button"],input[type="submit"]';
    const controls = [];
    for (const root of snapshotModules.access.roots) {
      for (const element of root.querySelectorAll?.(interactiveSelector) || []) {
        if (!controlVisible(element)) continue;
        const descriptor = controlDescriptor(element);
        if (!descriptor?.label && !descriptor?.ariaLabel && !descriptor?.testId) continue;
        controls.push(descriptor);
        if (controls.length >= 100) break;
      }
      if (controls.length >= 100) break;
    }
    const unique = new Map();
    for (const control of controls) {
      const key = JSON.stringify([control.tag, control.role, control.label, control.ariaLabel, control.testId, control.action]);
      if (!unique.has(key)) unique.set(key, control);
    }
    state.visibleControls = [...unique.values()].slice(0, 80);
    state.dialogs = snapshotModules.access.roots.flatMap(root => Array.from(root.querySelectorAll?.('dialog,[role="dialog"],[aria-modal="true"],kat-modal') || []))
      .filter(controlVisible).map(controlDescriptor).filter(Boolean).slice(0, 12);
    return state;
  }

  function stopRecorderTimer(recorder) {
    clearInterval(recorder?.timer);
    for (const doc of recorder?.documents || []) doc.removeEventListener("click", recorder.click, true);
  }

  function moduleRecordStart(slots) {
    requireIdle();
    const recorder = {id: crypto.randomUUID(), version: contentVersion, startedAt: Date.now(), slots,
      events: [], transitions: [], documents: new Set(), lastSignature: "", timer: null, click: null};
    moduleRecorder = recorder;
    recorder.click = event => {
      const element = event.composedPath().find(node => node?.matches?.('button,[role="button"],kat-button,a[href],input[type="button"],input[type="submit"]'));
      if (!element || recorder.events.length >= 50) return;
      const composedPath = event.composedPath().filter(node => node?.getAttribute && node !== document.body && node !== document.documentElement)
        .filter(node => String(node.localName || "").includes("-") || node.getAttribute("role") || node.getAttribute("data-testid") || node.getAttribute("data-test-id"))
        .slice(0, 10).map(node => {
          const value = controlDescriptor(node); if (!value) return null;
          return {tag: value.tag, role: value.role, label: value.label, ariaLabel: value.ariaLabel,
            testId: value.testId, action: value.action, classes: value.classes};
        }).filter(Boolean);
      const entry = {sequence: recorder.events.length + 1, atMs: Date.now() - recorder.startedAt,
        control: controlDescriptor(element), composedPath, before: recorderState(slots, false), observations: []};
      recorder.events.push(entry);
      for (const [delay, includeControls] of [[300, true], [1200, true], [2600, false]]) setTimeout(() => {
        if (moduleRecorder === recorder) entry.observations.push({delayMs: delay, ...recorderState(slots, includeControls)});
      }, delay);
    };
    const attachDocuments = () => {
      for (const root of E.roots().roots) {
        const doc = root.nodeType === Node.DOCUMENT_NODE ? root : root.ownerDocument;
        if (doc && !recorder.documents.has(doc)) { recorder.documents.add(doc); doc.addEventListener("click", recorder.click, true); }
      }
    };
    const sample = () => {
      attachDocuments();
      const state = recorderState(slots, false), signature = JSON.stringify(state.moduleCounts);
      if (signature !== recorder.lastSignature) {
        recorder.transitions.push(state); recorder.lastSignature = signature;
      }
    };
    attachDocuments();
    const startState = recorderState(slots, true);
    recorder.lastSignature = JSON.stringify(startState.moduleCounts);
    recorder.transitions.push(startState);
    recorder.timer = setInterval(sample, 700);
    return {recording: true, id: recorder.id, startedAt: new Date(recorder.startedAt).toISOString(), startState};
  }

  function moduleRecordStatus() {
    return moduleRecorder ? {recording: true, id: moduleRecorder.id,
      startedAt: new Date(moduleRecorder.startedAt).toISOString(), events: moduleRecorder.events.length,
      state: recorderState(moduleRecorder.slots, false)} : {recording: false};
  }

  function moduleRecordStop() {
    if (!moduleRecorder) throw new Error("Nenhum registro de montagem está ativo nesta página.");
    const recorder = moduleRecorder;
    stopRecorderTimer(recorder);
    const finishedAt = Date.now();
    const finalState = recorderState(recorder.slots, true);
    const filtered = M?.filterRecorderEvents(recorder.events) || {events: recorder.events, ignored: []};
    moduleRecorder = null;
    return {
      reportVersion: 1,
      recorderVersion: contentVersion,
      recordingId: recorder.id,
      startedAt: new Date(recorder.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - recorder.startedAt,
      page: `${location.origin}${location.pathname}`,
      expectedOrder: ["full", "four", "two", "faq", "full", "specs"],
      startState: recorder.transitions[0] || null,
      transitions: recorder.transitions.slice(0, 30),
      events: filtered.events,
      ignoredEvents: filtered.ignored.length,
      finalState,
      privacy: "Não contém cookies, senhas, API Keys nem valores de campos de texto. E-mails, ASINs e números longos são removidos dos rótulos."
    };
  }

  async function fill({scanId, slots, texts, writeToken, attemptId}) {
    if (!snapshot || snapshot.id !== scanId || snapshot.href !== location.href) throw new Error("A página mudou. Abra novamente o popup e analise os campos.");
    if (!/^[a-f0-9-]{36}$/.test(String(writeToken || ""))) throw new Error("A autorização de escrita não foi criada. Tente preencher novamente.");
    const startedAt = Date.now();
    const token = beginOperation("fill", slots.length);
    closePanel();
    const plan = snapshot, results = [], changed = [];
    let recreated = 0, retried = 0;
    const currentTarget = (key, previous = null) => {
      if (previous?.el?.isConnected && E.visible(previous.el)) return previous;
      const replacement = discoverMapped().mapping.get(key);
      if (!replacement || !E.visible(replacement.el)) return null;
      const before = E.read(replacement.el);
      if (previous && E.clean(before) !== E.clean(previous.before)) return null;
      if (previous && replacement.el !== previous.el) recreated++;
      const resolved = {...replacement, before};
      plan.targets.set(key, resolved);
      return resolved;
    };
    const outcome = value => typeof value === "object" && value !== null
      ? value : {written: Boolean(value), method: value ? "dom" : "unknown", reason: ""};
    try {
      for (const [index, slot] of slots.entries()) {
        touchOperation(token, index + 1, slot.label);
        let target = currentTarget(slot.key, plan.targets.get(slot.key)), text = texts[slot.key];
        const row = {key: slot.key, label: slot.label, status: "pending", detail: ""};
        results.push(row);
        if (token.cancelled || operation !== token || location.href !== plan.href) { row.code = "FIELD_OPERATION_CANCELLED"; row.detail = "Operação cancelada ou página alterada."; continue; }
        if (!text) { row.status = "empty"; row.code = "FIELD_EMPTY"; row.detail = "Sem fato suficiente para esta linha. Revise os dados de origem."; continue; }
        if (!target) { row.code = "FIELD_NOT_MAPPED"; row.detail = "Campo não identificado. Use Mapear campos e depois Preencher novamente."; continue; }
        if (typeof text !== "string" || text.length > slot.limit || /[\u2014<>]/.test(text)) { row.code = "FIELD_TEXT_INVALID"; row.detail = "Texto fora das regras. Gere novamente."; continue; }
        if (!E.visible(target.el)) { row.code = "FIELD_HIDDEN_OR_RECREATED"; row.detail = "O campo foi fechado ou recriado pela página. Analise novamente."; continue; }
        if (E.read(target.el) !== target.before) { row.code = "FIELD_CHANGED_BY_USER"; row.detail = "O campo foi alterado durante a geração. Sua edição foi preservada."; continue; }
        const current = E.descriptor(target.el);
        if (current.limit !== null && text.length > current.limit) { row.code = "FIELD_PAGE_LIMIT"; row.detail = `A página aceita apenas ${current.limit} caracteres. Gere novamente para adaptar o texto.`; continue; }
        if (E.clean(target.before) === E.clean(text)) { row.status = "same"; row.code = "FIELD_ALREADY_EQUAL"; row.detail = "O texto já está no campo."; continue; }
        try {
          let writeResult = outcome(await withTimeout(E.write(target.el, text, writeToken), FIELD_WRITE_TIMEOUT_MS,
            "A Amazon não respondeu a este campo em 12 segundos."));
          touchOperation(token, index + 1, slot.label);
          if (!writeResult.written) {
            await E.wait(180);
            const replacement = currentTarget(slot.key, target);
            if (replacement && replacement.el !== target.el) {
              retried++; target = replacement;
              writeResult = outcome(await withTimeout(E.write(target.el, text, writeToken), FIELD_WRITE_TIMEOUT_MS,
                "A Amazon não respondeu à segunda tentativa em 12 segundos."));
              touchOperation(token, index + 1, slot.label);
            }
          }
          row.status = writeResult.written ? "filled" : "failed";
          row.method = writeResult.method || "unknown";
          row.reason = writeResult.reason || "";
          row.code = writeResult.code || (writeResult.written ? "WRITE_CONFIRMED" : "WRITE_NOT_CONFIRMED");
          if (!writeResult.written && writeResult.diagnostic) row.diagnostic = writeResult.diagnostic;
          row.detail = writeResult.written ? `Texto conferido no campo${row.method !== "unknown" ? ` via ${row.method}` : ""}.`
            : `O editor não confirmou o texto${row.reason ? `: ${row.reason}` : ". Confira este campo."}`;
          if (writeResult.written) changed.push({el: target.el, before: target.before, written: text,
            key: slot.key, label: slot.label, href: plan.href});
        } catch (error) {
          row.status = "failed"; row.reason = String(error?.message || "erro de escrita").slice(0, 300);
          row.code = /12 segundos|não respondeu/i.test(row.reason) ? "FIELD_WRITE_TIMEOUT" : "FIELD_WRITE_EXCEPTION";
          row.detail = `O editor recusou a alteração: ${row.reason}`;
        }
      }
      await E.wait(450);
      // Segunda leitura: detecta controladores que revertem o valor depois do input.
      const finalMapping = discoverMapped().mapping;
      for (const row of results.filter(r => r.status === "filled" || r.status === "same")) {
        const target = finalMapping.get(row.key) || plan.targets.get(row.key);
        if (!target?.el?.isConnected || E.clean(E.read(target.el)) !== E.clean(texts[row.key])) {
          row.status = "failed"; row.code = "FIELD_REVERTED_AFTER_WRITE";
          row.detail = "O editor recriou ou reverteu o campo após aceitar a escrita. Confira o conteúdo.";
        }
      }
      if (changed.length) undoStack.push(changed);
      undoStack = undoStack.slice(-3);
      const finishedAt = Date.now();
      const countBy = key => Object.fromEntries(Object.entries(results.reduce((counts, row) => {
        const value = String(row[key] || "unknown"); counts[value] = (counts[value] || 0) + 1; return counts;
      }, {})).sort(([a], [b]) => a.localeCompare(b)));
      const firstFailure = results.find(row => !["filled", "same", "empty"].includes(row.status));
      return {results, filled: results.filter(r => r.status === "filled" || r.status === "same").length,
        failed: results.filter(r => r.status === "failed" || r.status === "pending").length,
        empty: results.filter(r => r.status === "empty").length,
        recreated, retried, total: slots.length, cancelled: token.cancelled, href: plan.href,
        technical: {
          reportVersion: 2,
          attemptId: /^[a-f0-9-]{36}$/.test(String(attemptId || "")) ? attemptId : null,
          connectorVersion: contentVersion,
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(finishedAt).toISOString(),
          durationMs: finishedAt - startedAt,
          page: `${location.origin}${location.pathname}`,
          documentReadyState: document.readyState,
          codes: countBy("code"),
          writerMethods: countBy("method"),
          firstFailure: firstFailure ? {key: firstFailure.key, label: firstFailure.label,
            code: firstFailure.code || "UNKNOWN", method: firstFailure.method || "unknown",
            reason: firstFailure.reason || firstFailure.detail || ""} : null,
          firstBridgeDiagnostic: results.find(row => row.diagnostic)?.diagnostic || null
        }};
    } finally { finishOperation(token); }
  }

  async function probeWrite({writeToken, attemptId}) {
    if (!/^[a-f0-9-]{36}$/.test(String(writeToken || ""))) return {ok: false,
      code: "BRIDGE_INVALID_TOKEN_FORMAT", error: "A autorização temporária não chegou ao conector da página."};
    try {
      const response = await chrome.runtime.sendMessage({channel: "aplus-native-write-probe",
        href: location.href, writeToken, attemptId});
      if (!response?.ok) return {ok: false, code: response?.code || "BRIDGE_PROBE_REJECTED",
        error: response?.error || "A ponte de escrita recusou o teste.", diagnostic: response?.diagnostic || null};
      return response.data || {ok: false, code: "BRIDGE_PROBE_RESULT_MISSING", error: "O teste não retornou dados."};
    } catch (error) {
      return {ok: false, code: "BRIDGE_PROBE_RUNTIME_ERROR", error: String(error?.message || error)};
    }
  }

  async function undo(writeToken) {
    if (!/^[a-f0-9-]{36}$/.test(String(writeToken || ""))) throw new Error("A autorização para desfazer não foi criada. Tente novamente.");
    const records = undoStack.pop() || []; let restored = 0, skipped = 0;
    const token = beginOperation("undo", records.length);
    try {
      for (const [index, r] of records.entries()) {
        touchOperation(token, index + 1, r.label);
        // Não desfaz uma edição que o usuário fez depois do preenchimento.
        if (r.href !== location.href || !E.visible(r.el) || E.clean(E.read(r.el)) !== E.clean(r.written)) { skipped++; continue; }
        if (await withTimeout(E.write(r.el, r.before, writeToken), FIELD_WRITE_TIMEOUT_MS,
          "A Amazon não respondeu ao desfazer este campo em 12 segundos.")) restored++; else skipped++;
      }
      return {restored, skipped};
    } finally { finishOperation(token); }
  }

  function mapper(slots) {
    requireIdle();
    closePanel();
    const host = document.createElement("div"); host.id = "aplus-helper-panel";
    host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:360px;max-width:95vw";
    const shadow = host.attachShadow({mode: "open"});
    const style = document.createElement("style");
    style.textContent = `:host{font:14px Arial,sans-serif;color:#172638}*{box-sizing:border-box}.card{padding:18px;background:#fff;border:2px solid #157a63;border-radius:14px;box-shadow:0 8px 35px #0004}h2{font-size:18px;margin:0 0 8px}p{line-height:1.45}select,button{font:inherit;width:100%;padding:10px;border:1px solid #b9c7cb;border-radius:7px;margin-top:8px;background:#fff;color:#172638}button{cursor:pointer}button.primary{background:#157a63;color:#fff;border:0}.status{font-size:13px;min-height:40px}.row{display:flex;gap:8px}.row button{flex:1}`;
    shadow.append(style);
    const card = document.createElement("section"); card.className = "card";
    const h = document.createElement("h2"); h.textContent = "Associar campos A+";
    const p = document.createElement("p"); p.textContent = "Clique no campo correspondente da Amazon. Depois de associar, o próximo texto é selecionado automaticamente. A associação vale nesta página.";
    const select = document.createElement("select"); select.setAttribute("aria-label", "Texto a associar");
    const refresh = () => {
      const current = select.value; select.replaceChildren();
      for (const s of slots) { const option = document.createElement("option"); option.value = s.key; option.textContent = `${manual.has(s.key) ? "✓ " : ""}${s.label}`; select.append(option); }
      if (current) select.value = current;
    }; refresh();
    const status = document.createElement("p"); status.className = "status"; status.setAttribute("role", "status");
    const choose = document.createElement("button"); choose.className = "primary"; choose.textContent = "Pausar seleção";
    const row = document.createElement("div"); row.className = "row";
    const reset = document.createElement("button"); reset.textContent = "Limpar associações";
    const close = document.createElement("button"); close.textContent = "Concluir";
    row.append(reset, close); card.append(h, p, select, choose, status, row); shadow.append(card); document.documentElement.append(host);
    let picking = true, outlined = null, priorOutline = "";
    status.textContent = `Clique na Amazon para associar: ${slots[0]?.label || "campo"}.`;
    const docs = E.roots().roots.filter(r => r.nodeType === Node.DOCUMENT_NODE);
    const clearOutline = () => { if (outlined) outlined.style.outline = priorOutline; outlined = null; };
    const getField = event => {
      const candidate = event.composedPath().find(n => n?.matches?.('kat-input,kat-textarea,input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]'));
      return candidate ? E.katHost(candidate) || candidate : null;
    };
    const move = event => {
      if (!picking || event.composedPath().includes(host)) return;
      clearOutline(); const el = getField(event);
      if (el && E.visible(el)) { outlined = el; priorOutline = el.style.outline; el.style.outline = "3px solid #159b7c"; }
    };
    const click = event => {
      if (!picking || event.composedPath().includes(host)) return;
      const el = getField(event);
      if (!el || !E.visible(el)) return;
      event.preventDefault(); event.stopImmediatePropagation(); clearOutline();
      const d = E.descriptor(el);
      if (d.excluded) { status.textContent = "Este campo é um identificador ou metadado de imagem. Escolha um campo de texto do módulo."; return; }
      for (const [key, mapped] of manual) if (mapped.el === el) manual.delete(key);
      const selectedKey = select.value;
      const selectedLabel = slots.find(s => s.key === selectedKey)?.label || selectedKey;
      const start = select.selectedIndex;
      manual.set(selectedKey, d);
      refresh();
      let next = -1;
      for (let offset = 1; offset <= slots.length; offset++) {
        const candidate = (start + offset) % slots.length;
        if (!manual.has(slots[candidate].key)) { next = candidate; break; }
      }
      if (next < 0) {
        picking = false; choose.textContent = "Mapeamento concluído"; choose.disabled = true;
        status.textContent = `Associado: ${selectedLabel}. Todos os textos foram mapeados.`;
      } else {
        select.selectedIndex = next; picking = true; choose.textContent = "Pausar seleção";
        status.textContent = `Associado: ${selectedLabel}. Agora clique para associar: ${slots[next].label}.`;
      }
    };
    choose.onclick = () => {
      picking = !picking; clearOutline(); choose.textContent = picking ? "Pausar seleção" : "Continuar seleção";
      status.textContent = picking ? `Clique na Amazon para associar: ${slots[select.selectedIndex]?.label || "campo"}.` : "Seleção pausada. Clique em Continuar seleção quando quiser retomar.";
    };
    select.onchange = () => {
      picking = true; choose.disabled = false; choose.textContent = "Pausar seleção";
      status.textContent = `Clique na Amazon para associar: ${slots[select.selectedIndex]?.label || "campo"}.`;
    };
    reset.onclick = () => { manual.clear(); refresh(); select.selectedIndex = 0; picking = true; choose.disabled = false; choose.textContent = "Pausar seleção"; status.textContent = `Associações removidas. Clique para associar: ${slots[0]?.label || "campo"}.`; };
    const keydown = event => { if (event.key === "Escape") { picking = false; clearOutline(); choose.textContent = "Continuar seleção"; status.textContent = "Seleção pausada. Clique em Continuar seleção quando quiser retomar."; } };
    for (const doc of docs) { doc.addEventListener("mousemove", move, true); doc.addEventListener("click", click, true); doc.addEventListener("keydown", keydown, true); }
    closePanel = () => { clearOutline(); for (const doc of docs) { doc.removeEventListener("mousemove", move, true); doc.removeEventListener("click", click, true); doc.removeEventListener("keydown", keydown, true); } host.remove(); closePanel = () => {}; };
    close.onclick = closePanel;
    return {opened: true};
  }

  const onPageMessage = (message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.channel !== pageChannel) return;
    const actions = {
      ping: () => ({ready: true, href: location.href, version: contentVersion, operation: operationView()}),
      diagnose: () => diagnose(message.slots),
      scan: () => { requireIdle(); return scan(message.slots); },
      fill: () => fill(message), undo: () => undo(message.writeToken), map: () => mapper(message.slots),
      probeWrite: () => probeWrite(message),
      moduleRecordStart: () => moduleRecordStart(message.slots || []),
      moduleRecordStatus: () => moduleRecordStatus(),
      moduleRecordStop: () => moduleRecordStop(),
      prepareModules: () => prepareModules(message.slots || []),
      cancel: () => {
        if (operation) operation.cancelled = true;
        const cancelledOperation = operationView();
        operation = null;
        return {cancelled: true, operation: cancelledOperation};
      }
    };
    if (!actions[message.action]) return;
    Promise.resolve().then(actions[message.action]).then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message}));
    return true;
  };
  chrome.runtime.onMessage.addListener(onPageMessage);
  globalThis.__aplusPremiumCleanup = () => {
    if (operation) operation.cancelled = true;
    operation = null;
    if (moduleRecorder) stopRecorderTimer(moduleRecorder);
    moduleRecorder = null;
    closePanel();
    chrome.runtime.onMessage.removeListener?.(onPageMessage);
  };
})();
