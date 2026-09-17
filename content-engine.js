// Executado no mundo ISOLATED da extensão. Não recebe a API Key.
// Prioriza os data-module-id/data-component-id informados pelo usuário.
// As heurísticas ficam como fallback para módulos sem esses identificadores.
(() => {
  const engineVersion = globalThis.chrome?.runtime?.getManifest?.().version || "1.5.15";
  if (globalThis.APlusEngine?.version === engineVersion) return;
  const KAT = 'kat-input,kat-textarea';
  const FIELD = `${KAT},input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"],[role="textbox"]`;
  const EXCLUDED = /\b(asin|sku|search|pesquisar|pesquisa|buscar|alt text|alternative text|texto alternativo|palavras chave da imagem|image keywords|tags da imagem|nome do conteudo|content name|nome do projeto|project name|language|idioma|url|link)\b/;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const parent = el => el.parentElement || el.getRootNode()?.host || el.ownerDocument?.defaultView?.frameElement;
  const katHost = el => { for (let p = el; p; p = parent(p)) if (p.matches(KAT)) return p; return null; };
  const moduleHost = el => { for (let p = el; p; p = parent(p)) if (p.hasAttribute("data-module-id")) return p; return null; };

  function documentOrder(a, b) {
    if (a === b) return 0;
    // Sobe pelos hosts para ordenar campos que estão em Shadow DOM ou iframe.
    const chain = node => { const path = []; for (let p = node; p; p = parent(p)) path.unshift(p); return path; };
    const left = chain(a), right = chain(b); let i = 0;
    while (i < left.length && i < right.length && left[i] === right[i]) i++;
    if (i === left.length) return -1;
    if (i === right.length) return 1;
    const position = left[i].compareDocumentPosition(right[i]);
    if (!(position & Node.DOCUMENT_POSITION_DISCONNECTED)) return position & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
    const ra = left[i].getBoundingClientRect(), rb = right[i].getBoundingClientRect();
    return ra.top - rb.top || ra.left - rb.left;
  }

  function roots() {
    const result = [], seen = new Set(); let blockedFrames = 0;
    function visit(root) {
      if (!root || seen.has(root)) return;
      seen.add(root); result.push(root);
      for (const el of root.querySelectorAll("*")) {
        if (el.id === "aplus-helper-panel") continue;
        if (el.shadowRoot) visit(el.shadowRoot);
        if (el.tagName === "IFRAME") {
          try { if (el.contentDocument) visit(el.contentDocument); else blockedFrames++; }
          catch { blockedFrames++; }
        }
      }
    }
    visit(document);
    return {roots: result, blockedFrames};
  }

  function visible(el) {
    if (!el?.isConnected || el.disabled || el.readOnly || el.getAttribute("aria-disabled") === "true" || el.getAttribute("aria-readonly") === "true") return false;
    if (el.matches('input') && !["text", "", "search"].includes(el.type)) return false;
    if (el.matches('input[type="search"]')) return false;
    if (el.matches(KAT) && (el.hasAttribute("disabled") && el.getAttribute("disabled") !== "false" ||
      el.hasAttribute("readonly") && el.getAttribute("readonly") !== "false")) return false;
    if (!(el.matches(`${KAT},input,textarea`) || el.isContentEditable ||
      (el.tagName === "BODY" && el.ownerDocument.designMode.toLowerCase() === "on"))) return false;
    if (!el.getClientRects().length) return false;
    for (let p = el; p; p = parent(p)) {
      if (p.hidden || p.getAttribute("aria-hidden") === "true" || p.inert || p.id === "aplus-helper-panel") return false;
      const style = p.ownerDocument.defaultView.getComputedStyle(p);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function textWithoutFields(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(`${FIELD},script,style`).forEach(node => node.remove());
    return clean(clone.textContent).slice(0, 300);
  }

  function descriptor(el) {
    const root = el.getRootNode();
    const labelled = (el.getAttribute("aria-labelledby") || "").split(/\s+/)
      .map(id => root.getElementById?.(id)?.textContent || "").join(" ");
    const labels = Array.from(el.labels || []).map(textWithoutFields).join(" ");
    const wrapping = el.closest("label");
    const previous = el.previousElementSibling;
    const previousLabel = previous && /^(LABEL|SPAN|P|DIV)$/.test(previous.tagName) && previous.textContent.length < 180
      && !previous.querySelector(FIELD) ? previous.textContent : "";
    const human = clean([el.getAttribute("aria-label"), labelled, labels,
      wrapping ? textWithoutFields(wrapping) : "", el.getAttribute("placeholder"), previousLabel].filter(Boolean).join(" "));
    const identifiers = [el.id, el.getAttribute("name"), el.getAttribute("data-testid"), el.getAttribute("data-field"), el.getAttribute("data-component-id")].filter(Boolean).join(" ");
    const label = human || identifiers || (el.matches("textarea") ? "Área de texto sem rótulo" : "Campo sem rótulo");
    const semantic = norm(`${human} ${identifiers}`);
    let limit = null;
    for (const attr of ["maxlength", "max-length", "data-maxlength", "data-max-length", "aria-valuemax"]) {
      const raw = el.getAttribute(attr);
      if (raw !== null && /^\d+$/.test(raw)) { limit = Number(raw); break; }
    }
    if (limit === null && el.matches(KAT)) {
      const inner = el.shadowRoot?.querySelector("input[maxlength],textarea[maxlength]");
      if (inner && inner.maxLength >= 0) limit = inner.maxLength;
    }
    if (limit === null) {
      const local = el.parentElement;
      const hint = local && local.querySelectorAll(FIELD).length <= 1 ? textWithoutFields(local) : human;
      const match = norm(hint).match(/(?:maximo|maximum|max|limite)(?: de| of)?\s*:?\s*(\d{1,4})\s*(?:caracter|character)/)
        || norm(hint).match(/\b\d+\s*\/\s*(\d{1,4})\s*(?:caracter|character)/);
      if (match) limit = Number(match[1]);
    }
    return {el, label: label.slice(0, 220), semantic, limit, excluded: EXCLUDED.test(semantic)};
  }

  function moduleType(text) {
    const t = norm(text);
    if (/\b(faq|q\s*&\s*a|perguntas e respostas|perguntas frequentes|questions and answers|question and answer)\b/.test(t)) return "faq";
    if (/\b(especificacoes tecnicas|especificacao tecnica|technical specifications|technical specification|technical details|specification table)\b/.test(t)) return "specs";
    if (/\b(quatro imagens|4 imagens|four images|four image|4 images)\b/.test(t)) return "four";
    if (/\b(duas imagens|2 imagens|two images|two image|dual images|dual image|2 images)\b/.test(t)) return "two";
    if (/\b(imagem completa|full image|full width image|fullimage)\b/.test(t)) return "full";
    return null;
  }

  function amazonType(id) {
    const t = norm(id);
    if (/full\s*background\s*image|full\s*width\s*image|full\s*image/.test(t)) return "full";
    if (/four\s*column\s*images|4\s*column\s*images|four\s*images|4\s*images/.test(t)) return "four";
    if (/two\s*column\s*images|2\s*column\s*images|two\s*images|2\s*images/.test(t)) return "two";
    if (/tech\s*specs|technical\s*spec/.test(t)) return "specs";
    if (/\bfaq\b|faqs|questions\s*answers/.test(t)) return "faq";
    return null;
  }

  function discoverAmazon(access) {
    const modules = [...new Set(access.roots.flatMap(root => Array.from(root.querySelectorAll("[data-module-id]"))))]
      .filter(el => amazonType(el.getAttribute("data-module-id"))).sort(documentOrder);
    const mapping = new Map(), counts = {}, warnings = [], features = {}, moduleCounts = {full: 0, four: 0, two: 0, faq: 0, specs: 0};
    const byType = type => modules.filter(el => amazonType(el.getAttribute("data-module-id")) === type);
    for (const module of modules) moduleCounts[amazonType(module.getAttribute("data-module-id"))]++;
    const allFull = byType("full");
    // Nunca filtra campos ocultos ANTES de determinar o índice: isso deslocaria os blocos.
    const query = (scope, selector, module) => Array.from(scope.querySelectorAll(selector)).filter(el => moduleHost(el) === module);
    const add = (key, el) => { if (visible(el)) mapping.set(key, {...descriptor(el), source: "amazon"}); };
    for (const module of modules) {
      const type = amazonType(module.getAttribute("data-module-id"));
      if (type !== "full" && byType(type).length !== 1) { warnings.push(`Mais de um módulo ${type} identificado. Use Mapear campos.`); continue; }
      if (type === "full") {
        if (allFull.length !== 2) { warnings.push("Para distinguir os banners, mantenha os dois módulos fullbackground-image na edição."); continue; }
        // O número no id é irrelevante. O primeiro no DOM é o banner do topo.
        const prefix = allFull.indexOf(module) === 0 ? "hero" : "closing";
        const headings = query(module, 'kat-input[data-component-id="main-heading-input"]', module);
        const bodies = query(module, '[data-component-id="footer"] .public-DraftEditor-content[contenteditable="true"]', module);
        if (headings.length === 1) add(`${prefix}_headline`, headings[0]);
        else warnings.push(`Banner ${prefix}: headline ausente ou repetida.`);
        if (bodies.length === 1) add(`${prefix}_body`, bodies[0]);
        else warnings.push(`Banner ${prefix}: corpo Draft.js ausente ou repetido.`);
        continue;
      }
      if (type === "specs") {
        const heading = query(module, 'kat-input[data-component-id="tech-specs-heading-input"]', module);
        features.specsHeading = heading.length > 0;
        if (heading.length === 1) add("specs_heading", heading[0]);
        else if (heading.length > 1) warnings.push("Título do módulo de especificações repetido. Use Mapear campos.");
      }
      const definitions = {
        four: {scope: "four-column", left: 'kat-input[data-component-id="heading-input"]', right: '[data-component-id="description"] .public-DraftEditor-content[contenteditable="true"]', roles: ["headline", "body"], expected: 4},
        two: {scope: "two-column", left: 'kat-input[data-component-id="heading-input"]', right: '[data-component-id="description"] .public-DraftEditor-content[contenteditable="true"]', roles: ["headline", "body"], expected: 2},
        faq: {scope: "faqs", left: 'kat-textarea[data-component-id="question-textarea"]', right: 'kat-textarea[data-component-id="answer-textarea"]', roles: ["question", "answer"]},
        specs: {scope: "tech-specs", left: 'kat-input[data-component-id="spec-key-input"]', right: 'kat-input[data-component-id="spec-value-input"]', roles: ["name", "value"]}
      };
      const definition = definitions[type];
      const containers = query(module, `[data-component-id="${definition.scope}"]`, module);
      if (containers.length !== 1) { warnings.push(`Módulo ${type}: container interno ausente ou repetido.`); continue; }
      const left = query(containers[0], definition.left, module), right = query(containers[0], definition.right, module);
      const expected = definition.expected ?? left.length;
      if (!expected || left.length !== expected || right.length !== expected) {
        warnings.push(`Módulo ${type}: campos incompletos. Nenhum índice foi deslocado; abra ou complete as linhas.`); continue;
      }
      if (type === "faq" || type === "specs") counts[type] = expected;
      for (let i = 0; i < expected; i++) {
        add(`${type}_${i + 1}_${definition.roles[0]}`, left[i]);
        add(`${type}_${i + 1}_${definition.roles[1]}`, right[i]);
      }
    }
    return {mapping, counts, warnings, features, moduleCounts, types: new Set(modules.map(el => amazonType(el.getAttribute("data-module-id"))))};
  }

  function moduleFor(el) {
    for (let p = parent(el), depth = 0; p && depth < 22; p = parent(p), depth++) {
      if (p === document.body || p.tagName === "HTML") break;
      const titles = [p.getAttribute("data-module-type"), p.getAttribute("data-module-name"), p.getAttribute("aria-label")];
      for (const heading of p.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,[role="heading"],[class*="module-title"],[class*="moduleTitle"],[data-testid*="module-title"]')) {
        titles.push(heading.textContent);
      }
      // Fallback para cabeçalhos de módulo implementados com div/span.
      if (titles.every(t => !moduleType(t))) {
        for (const child of Array.from(p.children).slice(0, 5)) {
          if (!child.matches(FIELD) && !child.querySelector(FIELD) && child.textContent.length < 180) titles.push(child.textContent);
        }
      }
      const types = [...new Set(titles.map(moduleType).filter(Boolean))];
      if (types.length === 1) return {el: p, type: types[0]};
      if (types.length > 1) break; // Nunca promove o formulário inteiro a um único módulo.
    }
    return null;
  }

  function fieldRole(d, type) {
    const t = d.semantic;
    if (type === "faq") {
      if (/\b(resposta|answer)\b/.test(t)) return "answer";
      if (/\b(pergunta|question)\b/.test(t)) return "question";
      if (d.limit === 120) return "question";
      if (d.limit === 250) return "answer";
      return null;
    }
    if (type === "specs") {
      if (/\b(definicao|definition|valor|value|descricao|description)\b/.test(t)) return "value";
      if (/\b(nome|name|rotulo|label|especificacao|specification)\b/.test(t)) return "name";
      if (d.limit === 30) return "name";
      if (d.limit === 500) return "value";
      return null;
    }
    if (/\b(corpo|body|descricao|description|texto do corpo|body text)\b/.test(t)) return "body";
    if (/\b(headline|titulo|title|cabecalho|heading)\b/.test(t)) return "headline";
    const headline = {full: 80, four: 30, two: 50}[type];
    const body = type === "four" ? 150 : 300;
    if (d.limit === headline) return "headline";
    if (d.limit === body) return "body";
    return null;
  }

  function discover() {
    const access = roots();
    const amazon = discoverAmazon(access);
    const elements = access.roots.flatMap(root => Array.from(root.querySelectorAll(FIELD)));
    for (const root of access.roots) {
      if (root.designMode?.toLowerCase() === "on" && root.body) elements.push(root.body);
    }
    const descriptors = [...new Set(elements)].filter(visible)
      // O host kat representa o campo. Não conta novamente seu input interno no Shadow DOM.
      .filter(el => !katHost(el) || katHost(el) === el)
      // Um editor contenteditable pode conter outros elementos com role=textbox.
      .filter(el => !elements.some(other => other !== el && other.contains(el) && other.isContentEditable))
      .sort(documentOrder).slice(0, 500).map(descriptor);
    const groups = [];
    for (const d of descriptors.filter(d => !d.excluded)) {
      if (amazonType(moduleHost(d.el)?.getAttribute("data-module-id"))) continue;
      const mod = moduleFor(d.el);
      if (!mod) continue;
      if (amazon.types.has(mod.type)) continue; // Uma estrutura conhecida ambígua não cai na heurística.
      let group = groups.find(g => g.el === mod.el);
      if (!group) { group = {...mod, fields: []}; groups.push(group); }
      group.fields.push({...d, role: fieldRole(d, mod.type)});
    }
    // Ordena módulos pela posição do host, incluindo iframe e Shadow DOM.
    groups.sort((a, b) => documentOrder(a.el, b.el));
    const mapping = amazon.mapping, warnings = amazon.warnings;
    const full = groups.filter(g => g.type === "full");
    const counts = amazon.counts, moduleCounts = {...amazon.moduleCounts};
    for (const g of groups) {
      const sameType = groups.filter(x => x.type === g.type);
      if (g.type !== "full" && sameType.length !== 1) { warnings.push(`Há mais de um módulo do tipo ${g.type}. Use Mapear campos.`); continue; }
      let prefix = g.type;
      if (g.type === "full") {
        if (full.length !== 2) { warnings.push("Para distinguir os banners automaticamente, deixe os dois módulos de imagem completa abertos."); continue; }
        prefix = full.indexOf(g) === 0 ? "hero" : "closing";
      }
      const roles = g.type === "faq" ? ["question", "answer"] : g.type === "specs" ? ["name", "value"] : ["headline", "body"];
      const left = g.fields.filter(d => d.role === roles[0]);
      const right = g.fields.filter(d => d.role === roles[1]);
      const expected = {full: 1, four: 4, two: 2}[g.type] || left.length;
      if (!expected || left.length !== expected || right.length !== expected || g.fields.some(d => !d.role)) {
        warnings.push(`Módulo ${prefix}: quantidade ou rótulos ambíguos. Abra todos os campos ou use Mapear campos.`); continue;
      }
      moduleCounts[g.type] = Math.max(moduleCounts[g.type] || 0, g.type === "full" ? full.length : sameType.length);
      if (g.type === "faq" || g.type === "specs") counts[g.type] = expected;
      for (let i = 0; i < expected; i++) {
        const base = g.type === "full" ? prefix : `${prefix}_${i + 1}`;
        mapping.set(`${base}_${roles[0]}`, left[i]); mapping.set(`${base}_${roles[1]}`, right[i]);
      }
    }
    if (access.blockedFrames) warnings.push("Há iframe de outra origem. Seu conteúdo não pode ser inspecionado por esta extensão.");
    return {mapping, descriptors, counts, features: amazon.features, moduleCounts, warnings: [...new Set(warnings)]};
  }

  function read(el) {
    if (el.matches(KAT)) {
      const inner = el.shadowRoot?.querySelector("input,textarea") || el.querySelector?.("input,textarea");
      return String(inner?.value ?? el.value ?? el.getAttribute("value") ?? "");
    }
    return el.matches("input,textarea") ? el.value : el.innerText ?? el.textContent ?? "";
  }

  async function writeAmazon(el, value, writeToken) {
    // O setter customizado pertence ao MAIN world. O worker executa somente a função
    // de escrita empacotada, no documento de origem, sem chave nem acesso à API.
    const marker = crypto.randomUUID(), attribute = "data-aplus-field-token";
    const oldMarker = el.getAttribute(attribute);
    const expectedBefore = read(el);
    el.setAttribute(attribute, marker);
    try {
      const reply = await chrome.runtime.sendMessage({channel: "aplus-native-write", marker, value, expectedBefore,
        href: location.href, writeToken});
      if (!reply?.ok) return {written: false, method: "main-world", reason: reply?.error || "ponte de escrita recusada",
        code: reply?.code || "BRIDGE_REJECTED", diagnostic: reply?.diagnostic || null};
      return reply.data || {written: false, method: "main-world", reason: "resultado de escrita ausente",
        code: "BRIDGE_RESULT_MISSING"};
    } finally {
      if (el.getAttribute(attribute) === marker) {
        if (oldMarker === null) el.removeAttribute(attribute); else el.setAttribute(attribute, oldMarker);
      }
    }
  }

  async function write(el, value, writeToken = "") {
    if (!visible(el)) return false;
    if (el.matches(`${KAT},.public-DraftEditor-content[contenteditable="true"]`)) return writeAmazon(el, value, writeToken);
    const view = el.ownerDocument.defaultView;
    el.focus({preventScroll: true});
    const before = new view.InputEvent("beforeinput", {bubbles: true, composed: true, cancelable: true, inputType: "insertText", data: value});
    if (!el.dispatchEvent(before)) return false;
    if (el.matches("input,textarea")) {
      // O setter nativo + input/change aciona os controladores de React/Vue/Angular.
      const proto = el.matches("textarea") ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    } else {
      const selection = el.ownerDocument.getSelection();
      const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
      selection.removeAllRanges(); selection.addRange(range);
      // insertText preserva o caminho de edição dos editores rich text quando suportado.
      const ok = el.ownerDocument.execCommand("insertText", false, value);
      if (!ok) el.textContent = value; // Texto puro, nunca HTML vindo do modelo.
    }
    el.dispatchEvent(new view.InputEvent("input", {bubbles: true, composed: true, inputType: "insertText", data: value}));
    el.dispatchEvent(new view.Event("change", {bubbles: true, composed: true}));
    el.blur();
    await wait(90);
    return el.isConnected && clean(read(el)) === clean(value);
  }

  globalThis.APlusEngine = {version: engineVersion, discover, discoverAmazon, descriptor, visible, read, write, clean, roots, wait, katHost};
})();
