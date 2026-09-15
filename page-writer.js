// Função autocontida: chrome.scripting a serializa com Function.toString() e
// executa no MAIN world. Toda a lógica precisa estar DENTRO desta função —
// helpers definidos fora não são serializados e viram ReferenceError no MAIN.
// Nunca passa pela página a chave OpenAI, o prompt ou uma instrução dinâmica.
export async function writeAmazonField(marker, value, expectedBefore, expectedHref) {
  if (!/^[a-f0-9-]{36}$/.test(marker) || typeof value !== "string" || value.length > 20000 ||
    typeof expectedBefore !== "string" || location.href !== expectedHref) return {written: false};
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
  if (matches.length !== 1) return {written: false};
  const el = matches[0], doc = el.ownerDocument, view = doc.defaultView;
  const kat = el.matches("kat-input,kat-textarea");
  const draft = el.matches('.public-DraftEditor-content[contenteditable="true"]');
  const normalize = text => String(text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
  const current = () => kat ? String(el.value ?? el.getAttribute("value") ?? "") : el.innerText ?? el.textContent ?? "";
  if ((!kat && !draft) || !el.isConnected || el.disabled || el.readOnly || !el.getClientRects().length ||
    current() !== expectedBefore) return {written: false};
  for (let p = el; p; p = p.parentElement || p.getRootNode()?.host || p.ownerDocument?.defaultView?.frameElement) {
    const style = p.ownerDocument.defaultView.getComputedStyle(p);
    if (p.hidden || p.inert || p.getAttribute("aria-hidden") === "true" ||
      p.getAttribute("aria-disabled") === "true" || p.getAttribute("aria-readonly") === "true" ||
      style.display === "none" || style.visibility === "hidden") return {written: false};
  }
  for (const attr of ["maxlength", "max-length", "data-maxlength", "data-max-length"]) {
    const raw = el.getAttribute(attr);
    if (raw !== null && /^\d+$/.test(raw) && value.length > Number(raw)) return {written: false};
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fire = type => el.dispatchEvent(new view.Event(type, {bubbles: true, composed: true}));
  el.focus({preventScroll: true});

  if (kat) {
    el.value = value;
    el.setAttribute("value", value);
    fire("input"); fire("change"); el.blur();
    await sleep(120);
    return {written: location.href === expectedHref && el.isConnected && normalize(current()) === normalize(value)
      && el.getAttribute("value") === value};
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
      if (!setSelectionAll()) return false;
      const dt = new DataTransfer();
      dt.setData("text/plain", value);
      dt.setData("text", value);
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
      return {written: location.href === expectedHref};
    }
    // A 1 aplicou mas o React não refletiu. NÃO cai para execCommand (destruiria
    // o estado). Tenta paste como segunda via.
  }

  // 2. beforeinput insertFromPaste com DataTransfer.
  if (pasteBeforeInput()) {
    if (await confirmWithRetries([700, 500])) {
      el.blur();
      return {written: location.href === expectedHref};
    }
  }

  // 3. Evento paste com ClipboardEvent.
  if (pasteClipboardEvent()) {
    if (await confirmWithRetries([700, 500])) {
      el.blur();
      return {written: location.href === expectedHref};
    }
  }

  // 4. execCommand, apenas se as rotas do React não aplicaram.
  if (await writeDraftDom()) {
    if (await confirmWithRetries([700, 500])) {
      el.blur();
      return {written: location.href === expectedHref};
    }
  }

  el.blur();
  return {written: false};
}