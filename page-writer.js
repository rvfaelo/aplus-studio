// Função autocontida: chrome.scripting a serializa com Function.toString() e
// executa no MAIN world. Toda a lógica precisa estar DENTRO desta função —
// helpers definidos fora não são serializados e viram ReferenceError no MAIN.
// Nunca passa pela página a chave OpenAI, o prompt ou uma instrução dinâmica.
export async function writeAmazonField(marker, value, expectedBefore, expectedHref) {
  if (!/^[a-f0-9-]{36}$/.test(marker) || typeof value !== "string" || value.length > 20000 ||
    typeof expectedBefore !== "string" || location.href !== expectedHref) return {written: false, method: "guard", reason: "marcador, texto ou página inválidos"};
  const matches = [], visited = new Set();
  function search(root) {
    if (!root || visited.has(root)) return;
    visited.add(root);
    matches.push(...root.querySelectorAll(`[data-aplus-field-token="${marker}"]`));
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) search(element.shadowRoot);
      if (element.tagName === "IFRAME") {
        try { search(element.contentDocument); } catch { /* Iframes de outra origem são ignorados. */ }
      }
    }
  }
  search(document);
  if (matches.length !== 1) return {written: false, method: "guard", reason: `marcador encontrado ${matches.length} vez(es)`};
  const el = matches[0], doc = el.ownerDocument, view = doc.defaultView;
  const kat = el.matches("kat-input,kat-textarea");
  const draft = el.matches('.public-DraftEditor-content[contenteditable="true"]');
  const normalize = text => String(text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
  const katControl = kat ? el.shadowRoot?.querySelector?.("input,textarea") || el.querySelector?.("input,textarea") || null : null;
  const current = () => kat ? String(katControl ? katControl.value ?? "" : el.value ?? el.getAttribute("value") ?? "")
    : el.innerText ?? el.textContent ?? "";
  const beforeMatches = current() === expectedBefore;
  if ((!kat && !draft) || !el.isConnected || el.disabled || el.readOnly || !el.getClientRects().length ||
    !beforeMatches) return {written: false, method: "guard", reason: "campo mudou, foi removido ou não é editável"};
  for (let p = el; p; p = p.parentElement || p.getRootNode?.()?.host || p.ownerDocument?.defaultView?.frameElement) {
    const style = p.ownerDocument.defaultView.getComputedStyle(p);
    if (p.hidden || p.inert || p.getAttribute("aria-hidden") === "true" ||
      p.getAttribute("aria-disabled") === "true" || p.getAttribute("aria-readonly") === "true" ||
      style.display === "none" || style.visibility === "hidden") return {written: false, method: "guard", reason: "campo oculto ou desabilitado"};
  }
  for (const attr of ["maxlength", "max-length", "data-maxlength", "data-max-length"]) {
    const raw = el.getAttribute(attr);
    if (raw !== null && /^\d+$/.test(raw) && value.length > Number(raw)) return {written: false, method: "guard", reason: `limite de ${raw} caracteres`};
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fire = type => el.dispatchEvent(new view.Event(type, {bubbles: true, composed: true}));
  el.focus({preventScroll: true});

  if (kat) {
    const confirmed = () => normalize(current()) === normalize(value);
    el.value = value;
    el.setAttribute("value", value);
    fire("input"); fire("change");
    await sleep(180);
    if (location.href === expectedHref && el.isConnected && confirmed()) {
      el.blur(); return {written: true, method: "kat-host", reason: ""};
    }

    // Algumas versões do KAT mantêm o valor real em um input dentro do
    // Shadow DOM. Disparar o evento nesse controle alcança o listener do React.
    if (katControl) {
      try {
        katControl.focus?.({preventScroll: true});
        const controlView = katControl.ownerDocument?.defaultView || view;
        const proto = katControl.matches?.("textarea") ? controlView.HTMLTextAreaElement?.prototype : controlView.HTMLInputElement?.prototype;
        const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(katControl, value); else katControl.value = value;
        katControl.dispatchEvent(new controlView.InputEvent("input", {bubbles: true, composed: true, inputType: "insertText", data: value}));
        katControl.dispatchEvent(new controlView.Event("change", {bubbles: true, composed: true}));
        el.value = value; el.setAttribute("value", value); fire("input"); fire("change");
        await sleep(260);
        if (location.href === expectedHref && el.isConnected && confirmed()) {
          katControl.blur?.(); el.blur(); return {written: true, method: "kat-shadow-input", reason: ""};
        }
      } catch { /* Continua para o handler React. */ }
    }

    // Última via para KAT controlado: chama somente handlers de mudança já
    // expostos pelo próprio nó, sem procurar ou executar código da página.
    try {
      let handled = false;
      for (const node of [katControl, el].filter(Boolean)) {
        const propsKey = Object.keys(node).find(key => key.startsWith("__reactProps$"));
        const props = propsKey ? node[propsKey] : null;
        const handler = typeof props?.onChange === "function" ? props.onChange : typeof props?.onInput === "function" ? props.onInput : null;
        if (!handler) continue;
        handler({type: "change", target: katControl || el, currentTarget: katControl || el, bubbles: true});
        handled = true;
      }
      if (handled) {
        await sleep(260);
        if (location.href === expectedHref && el.isConnected && confirmed()) {
          el.blur(); return {written: true, method: "kat-react-handler", reason: ""};
        }
      }
    } catch { /* A confirmação abaixo retorna a falha sem quebrar os demais campos. */ }
    el.blur();
    return {written: false, method: "kat", reason: "o componente KAT reverteu o valor após host, Shadow DOM e evento React"};
  }

  // --- Helpers de Draft.js: precisam ser closures para serem serializados ---

  const placeholderVisible = () => {
    const root = el.closest(".DraftEditor-root") || el.parentElement;
    if (!root) return false;
    const placeholder = root.querySelector(".public-DraftEditorPlaceholder-root");
    if (!placeholder) return false;
    const style = view.getComputedStyle(placeholder);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    return placeholder.getClientRects().length > 0;
  };

  const confirmDraft = () => {
    const text = String(el.innerText ?? el.textContent ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ").trim();
    return text === value.replace(/\s+/g, " ").trim() && !placeholderVisible();
  };

  const confirmWithRetries = async waits => {
    for (const wait of waits) {
      await sleep(wait);
      if (confirmDraft()) return true;
    }
    return false;
  };

  const setSelectionAll = () => {
    const selection = doc.getSelection();
    if (!selection) return false;
    const range = doc.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };

  // O diagnóstico confirmou na build da Amazon: __reactProps$ no nó não tem
  // editorState, mas o fiber (i=3) tem. Handler é onChange, e o construtor do
  // estado expõe createWithContent + moveFocusToEnd.
  const findDraftHandler = () => {
    const keys = Object.keys(el);
    for (const key of keys) {
      if (!key.startsWith("__reactProps$")) continue;
      const props = el[key];
      if (props?.editorState && typeof props.editorState.getCurrentContent === "function"
        && typeof props.onChange === "function") return {state: props.editorState, handler: props.onChange};
    }
    const fiberKey = keys.find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    for (let i = 0; fiber && i < 300; i++, fiber = fiber.return) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (!props?.editorState || typeof props.editorState.getCurrentContent !== "function") continue;
      const handler = typeof props.onChange === "function" ? props.onChange
        : typeof props.onEditorStateChange === "function" ? props.onEditorStateChange : null;
      if (!handler) continue;
      return {state: props.editorState, handler};
    }
    return null;
  };

  const syncDraftState = () => {
    try {
      const found = findDraftHandler();
      if (!found) return false;
      const {state, handler} = found;
      const EditorState = state.constructor;
      const ContentState = state.getCurrentContent().constructor;
      if (typeof ContentState.createFromText !== "function") return false;
      if (typeof EditorState.createWithContent !== "function") return false;
      const content = ContentState.createFromText(value);
      let next = EditorState.createWithContent(content);
      if (typeof EditorState.moveFocusToEnd === "function") next = EditorState.moveFocusToEnd(next);
      handler(next);
      return true;
    } catch { return false; }
  };

  const pasteBeforeInput = () => {
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", value);
      dt.setData("text", value);
      if (!setSelectionAll()) return false;
      el.dispatchEvent(new view.InputEvent("beforeinput", {
        bubbles: true, cancelable: true, composed: true,
        inputType: "insertFromPaste", dataTransfer: dt
      }));
      return true;
    } catch { return false; }
  };

  const pasteClipboardEvent = () => {
    try {
      let dt;
      try { dt = new DataTransfer(); } catch { return false; }
      dt.setData("text/plain", value);
      let event;
      try {
        event = new view.ClipboardEvent("paste", {
          bubbles: true, cancelable: true, composed: true, clipboardData: dt
        });
      } catch {
        event = new view.Event("paste", {bubbles: true, cancelable: true, composed: true});
        try { Object.defineProperty(event, "clipboardData", {value: dt}); } catch { return false; }
      }
      el.dispatchEvent(event);
      return true;
    } catch { return false; }
  };

  const writeDraftDom = async () => {
    if (!setSelectionAll()) return false;
    const before = String(el.innerText ?? el.textContent ?? "");
    const deleted = doc.execCommand("delete", false);
    if (!deleted && before.replace(/\s+/g, "").trim() !== "") return false;
    if (value && !doc.execCommand("insertText", false, value)) {
      if (before) {
        setSelectionAll();
        doc.execCommand("insertText", false, before);
      }
      fire("input");
      return false;
    }
    fire("input");
    fire("change");
    return true;
  };

  // --- Estratégias, em ordem de confiabilidade ---

  // 1. Sync direto do editorState pelo fiber (confirmado no diagnóstico).
  if (syncDraftState()) {
    if (await confirmWithRetries([700, 500, 500])) {
      el.blur();
      return {written: location.href === expectedHref, method: "draft-react-state", reason: ""};
    }
    // A 1 aplicou mas o React não refletiu. NÃO cai para execCommand (destruiria
    // o estado). Tenta paste como segunda via.
  }

  // 2. beforeinput insertFromPaste com DataTransfer.
  if (pasteBeforeInput()) {
    if (await confirmWithRetries([700, 500])) {
      el.blur();
      return {written: location.href === expectedHref, method: "draft-beforeinput", reason: ""};
    }
  }

  // 3. Evento paste com ClipboardEvent.
  if (pasteClipboardEvent()) {
    if (await confirmWithRetries([700, 500])) {
      el.blur();
      return {written: location.href === expectedHref, method: "draft-paste", reason: ""};
    }
  }

  // 4. execCommand, apenas se as rotas do React não aplicaram.
  if (await writeDraftDom()) {
    if (await confirmWithRetries([700, 500])) {
      el.blur();
      return {written: location.href === expectedHref, method: "draft-exec-command", reason: ""};
    }
  }

  el.blur();
  return {written: false, method: "draft", reason: "o Draft.js não confirmou o texto após todas as estratégias"};
}
