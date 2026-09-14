// Auditoria de A+ publicado. Este arquivo não usa IA nem envia dados do produto
// a terceiros: consulta somente páginas públicas da Amazon Brasil.

const ASIN_PATTERN = /\bB[0-9A-Z]{9}\b/gi;

export function normalizeAsins(value, limit = 250) {
  const matches = String(value || "").toUpperCase().match(ASIN_PATTERN) || [];
  return [...new Set(matches)].slice(0, limit);
}

export function classifySellerStatus(value) {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/rejeitad|reprovad|rejected|declined/.test(text)) return "rejected";
  if (/em analise|aguardando aprovacao|sob revisao|in review|submitted|pending/.test(text)) return "pending";
  if (/rascunho|draft/.test(text)) return "draft";
  if (/publicad|aprovad|published|approved|\blive\b/.test(text)) return "published";
  return "unknown";
}

export function inspectProductHTML(html, httpStatus = 200) {
  const source = String(html || "");
  const compact = source.toLowerCase();
  if (httpStatus === 404 || /page-not-found|pagina nao encontrada|página não encontrada/.test(compact)) {
    return {status: "unavailable", detail: "Página do produto não encontrada."};
  }
  if (httpStatus === 429 || /validatecaptcha|captchacharacters|digite os caracteres que voce ve|enter the characters you see/.test(compact)) {
    return {status: "blocked", detail: "A Amazon pediu uma verificação temporária. Tente novamente mais tarde."};
  }
  if (httpStatus < 200 || httpStatus >= 400) {
    return {status: "error", detail: `A Amazon respondeu com HTTP ${httpStatus}.`};
  }

  const containerMatch = /id=["']aplus_feature_div["']|data-feature-name=["']aplus["']/.exec(compact);
  const aplusArea = containerMatch ? compact.slice(containerMatch.index, containerMatch.index + 500000) : "";
  const premium = /(?:class|data-cel-widget)=["'][^"']*(?:premium[-_ ]aplus|aplus[-_ ]premium|premium-aplus-module|aplus-premium-module)/.test(aplusArea);
  const standardModule = /(?:class|data-cel-widget)=["'][^"']*(?:aplus-module|aplus-v2|apm-(?:brand-story|fixed-width|center|top|left|right))/.test(aplusArea);
  if (premium) return {status: "published_premium", detail: "A+ Premium encontrado na página pública."};
  if (standardModule) {
    return {status: "published_standard", detail: "Conteúdo A+ encontrado na página pública."};
  }
  return {status: "not_published", detail: "Nenhum A+ publicado foi encontrado na página pública."};
}

// Executada no contexto isolado da aba pelo chrome.scripting. Por isso, precisa
// ser autocontida e não pode depender das funções acima.
export function scanSellerCatalogPage() {
  const asinPattern = /\bB[0-9A-Z]{9}\b/gi;
  const ignored = /^(editar|excluir|detalhes|estoque|preco|preço|status|asin|sku|imagem|ações|actions)$/i;
  const result = new Map();
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const statusOf = value => {
    const text = clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/rejeitad|reprovad|rejected|declined/.test(text)) return "rejected";
    if (/em analise|aguardando aprovacao|sob revisao|in review|submitted|pending/.test(text)) return "pending";
    if (/rascunho|draft/.test(text)) return "draft";
    if (/publicad|aprovad|published|approved|\blive\b/.test(text)) return "published";
    return "unknown";
  };
  const titleOf = container => {
    if (!container) return "";
    const selectors = ["[data-testid*='title' i]", "[class*='title' i]", "h1", "h2", "h3", "h4", "a"];
    for (const selector of selectors) {
      for (const node of container.querySelectorAll(selector)) {
        const text = clean(node.innerText || node.textContent);
        if (text.length >= 4 && text.length <= 300 && !ignored.test(text) && !/^B[0-9A-Z]{9}$/i.test(text)) return text;
      }
    }
    return "";
  };
  const add = (asin, node) => {
    asin = String(asin || "").toUpperCase();
    if (!/^B[0-9A-Z]{9}$/.test(asin)) return;
    const container = node?.closest?.("tr,[role='row'],[data-testid*='row' i],[class*='row' i],article,li") || node?.parentElement;
    const context = clean(container?.innerText || container?.textContent || "").slice(0, 4000);
    const previous = result.get(asin) || {asin, title: "", sellerStatus: "unknown"};
    const title = titleOf(container) || previous.title;
    const sellerStatus = statusOf(context);
    result.set(asin, {asin, title, sellerStatus: sellerStatus === "unknown" ? previous.sellerStatus : sellerStatus});
  };

  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") || "";
    for (const asin of href.match(asinPattern) || []) add(asin, anchor);
  }
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && result.size < 1000) {
    const text = node.nodeValue || "";
    if (!text.includes("B") && !text.includes("b")) continue;
    for (const asin of text.match(asinPattern) || []) add(asin, node.parentElement);
  }
  return {url: location.href, products: [...result.values()].slice(0, 1000)};
}

export function auditLabel(item) {
  const labels = {
    published_premium: "A+ Premium publicado",
    published_standard: "A+ publicado",
    not_published: "Sem A+ publicado",
    unavailable: "Produto indisponível",
    blocked: "Verificação bloqueada",
    error: "Não foi possível verificar",
    checking: "Verificando…",
    queued: "Na fila"
  };
  if (labels[item?.status]) return labels[item.status];
  const sellerLabels = {rejected: "A+ rejeitado", pending: "A+ em análise", draft: "A+ em rascunho", published: "A+ informado como publicado"};
  return sellerLabels[item?.sellerStatus] || "Ainda não verificado";
}
