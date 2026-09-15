(() => {
  const contentVersion = globalThis.chrome?.runtime?.getManifest?.().version || "1.5.3";
  const pageChannel = `aplus-page-v${contentVersion}`;
  if (globalThis.__aplusPremiumInstalled === contentVersion) return;
  try { globalThis.__aplusPremiumCleanup?.(); } catch { /* Uma versão anterior pode não oferecer limpeza. */ }
  globalThis.__aplusPremiumInstalled = contentVersion;
  const E = globalThis.APlusEngine;
  const manual = new Map();
  let snapshot = null, undoStack = [], busy = false, cancelled = false;
  let closePanel = () => {};

  function scan(slots) {
    const discovered = E.discover();
    const mapping = discovered.mapping;
    for (const [key, desc] of manual) {
      if (E.visible(desc.el)) {
        // Uma associação manual substitui qualquer associação automática do mesmo campo.
        for (const [other, value] of mapping) if (value.el === desc.el) mapping.delete(other);
        mapping.set(key, E.descriptor(desc.el));
      } else manual.delete(key);
    }
    snapshot = {id: crypto.randomUUID(), href: location.href, targets: new Map()};
    const entries = slots.map(slot => {
      const d = mapping.get(slot.key);
      if (d) snapshot.targets.set(slot.key, {...d, before: E.read(d.el)});
      return {key: slot.key, label: slot.label, found: !!d, field: d?.label || "Não identificado",
        pageLimit: d?.limit ?? null, existing: d ? !!E.clean(E.read(d.el)) : false};
    });
    return {scanId: snapshot.id, href: snapshot.href, entries, counts: discovered.counts, features: discovered.features,
      candidates: discovered.descriptors.filter(d => !d.excluded).length, warnings: discovered.warnings};
  }

  function diagnose(slots) {
    const result = scan(slots);
    const access = E.roots();
    const moduleIds = [...new Set(access.roots.flatMap(root =>
      Array.from(root.querySelectorAll("[data-module-id]"), element => String(element.getAttribute("data-module-id") || ""))))]
      .filter(id => /(?:fullbackground-image|four-column-images|two-column-images|faq|tech-specs)/.test(id)).slice(0, 40);
    const moduleCounts = {full: 0, four: 0, two: 0, faq: 0, specs: 0};
    for (const id of moduleIds) {
      if (id.includes("fullbackground-image")) moduleCounts.full++;
      else if (id.includes("four-column-images")) moduleCounts.four++;
      else if (id.includes("two-column-images")) moduleCounts.two++;
      else if (id.includes("tech-specs")) moduleCounts.specs++;
      else if (id.includes("faq")) moduleCounts.faq++;
    }
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
      moduleCounts,
      counts: result.counts,
      warnings: result.warnings,
      blockedFrames: access.blockedFrames,
      loginRequired,
      verificationRequired,
      renderErrors,
      loadingIndicators
    };
  }

  async function fill({scanId, slots, texts}) {
    if (busy) throw new Error("Já existe um preenchimento em andamento nesta página.");
    if (!snapshot || snapshot.id !== scanId || snapshot.href !== location.href) throw new Error("A página mudou. Abra novamente o popup e analise os campos.");
    closePanel(); busy = true; cancelled = false;
    const plan = snapshot, results = [], changed = [];
    try {
      for (const slot of slots) {
        const target = plan.targets.get(slot.key), text = texts[slot.key];
        const row = {key: slot.key, label: slot.label, status: "pending", detail: ""};
        results.push(row);
        if (cancelled || location.href !== plan.href) { row.detail = "Operação cancelada ou página alterada."; continue; }
        if (!text) { row.status = "empty"; row.detail = "Sem fato suficiente para esta linha. Revise os dados de origem."; continue; }
        if (!target) { row.detail = "Campo não identificado. Use Mapear campos e depois Preencher novamente."; continue; }
        if (typeof text !== "string" || text.length > slot.limit || /[\u2014<>]/.test(text)) { row.detail = "Texto fora das regras. Gere novamente."; continue; }
        if (!E.visible(target.el)) { row.detail = "O campo foi fechado ou recriado pela página. Analise novamente."; continue; }
        if (E.read(target.el) !== target.before) { row.detail = "O campo foi alterado durante a geração. Sua edição foi preservada."; continue; }
        const current = E.descriptor(target.el);
        if (current.limit !== null && text.length > current.limit) { row.detail = `A página aceita apenas ${current.limit} caracteres. Gere novamente para adaptar o texto.`; continue; }
        if (E.clean(target.before) === E.clean(text)) { row.status = "same"; row.detail = "O texto já está no campo."; continue; }
        const record = {el: target.el, before: target.before, written: text, key: slot.key, label: slot.label, href: plan.href};
        changed.push(record);
        try {
          const ok = await E.write(target.el, text);
          row.status = ok ? "filled" : "failed";
          row.detail = ok ? "Texto conferido no campo." : "O editor não confirmou o texto. Confira este campo.";
        } catch { row.status = "failed"; row.detail = "O editor recusou a alteração. Confira este campo."; }
      }
      await E.wait(250);
      // Segunda leitura: detecta controladores que revertem o valor depois do input.
      for (const row of results.filter(r => r.status === "filled" || r.status === "same")) {
        const target = plan.targets.get(row.key);
        if (!target.el.isConnected || E.clean(E.read(target.el)) !== E.clean(texts[row.key])) {
          row.status = "failed"; row.detail = "O editor recriou ou reverteu o campo. Confira o conteúdo.";
        }
      }
      if (changed.length) undoStack.push(changed);
      undoStack = undoStack.slice(-3);
      return {results, filled: results.filter(r => r.status === "filled" || r.status === "same").length,
        total: slots.length, cancelled, href: plan.href};
    } finally { busy = false; }
  }

  async function undo() {
    if (busy) throw new Error("Aguarde o preenchimento terminar.");
    const records = undoStack.pop() || []; let restored = 0, skipped = 0;
    busy = true;
    try {
      for (const r of records) {
        // Não desfaz uma edição que o usuário fez depois do preenchimento.
        if (r.href !== location.href || !E.visible(r.el) || E.clean(E.read(r.el)) !== E.clean(r.written)) { skipped++; continue; }
        if (await E.write(r.el, r.before)) restored++; else skipped++;
      }
      return {restored, skipped};
    } finally { busy = false; }
  }

  function mapper(slots) {
    if (busy) throw new Error("Aguarde o preenchimento terminar.");
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
      ping: () => ({ready: true, href: location.href, version: contentVersion}),
      diagnose: () => { if (busy) throw new Error("Aguarde o preenchimento terminar."); return diagnose(message.slots); },
      scan: () => { if (busy) throw new Error("Aguarde o preenchimento terminar."); return scan(message.slots); },
      fill: () => fill(message), undo, map: () => mapper(message.slots),
      cancel: () => { cancelled = true; return {cancelled: true}; }
    };
    if (!actions[message.action]) return;
    Promise.resolve().then(actions[message.action]).then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message}));
    return true;
  };
  chrome.runtime.onMessage.addListener(onPageMessage);
  globalThis.__aplusPremiumCleanup = () => {
    closePanel();
    chrome.runtime.onMessage.removeListener?.(onPageMessage);
  };
})();
