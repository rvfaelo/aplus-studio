import {makeSlots, normalizeAndValidate} from "./shared.js";
import {normalizeListingWorkspace} from "./listing-intelligence.js";

export const PROJECT_STATUS = Object.freeze({
  new: "Novo", queued: "Na fila", generating: "Gerando", review: "Em revisão",
  approved: "Aprovado", filled: "Preenchido", error: "Com erro"
});

const clean = (value, max = 18000) => String(value ?? "").normalize("NFC")
  .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

export function normalizeAsin(value = "") {
  const asin = clean(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^B[0-9A-Z]{9}$/.test(asin) ? asin : "";
}

export function createProject(input = {}, now = Date.now()) {
  const id = clean(input.id, 80) || globalThis.crypto?.randomUUID?.() || `project-${now}`;
  const facts = Array.isArray(input.facts) ? input.facts.slice(0, 30).map(item => ({
    field: clean(item?.field, 80), value: clean(item?.value, 1000), source: clean(item?.source, 120) || "Informado manualmente",
    confirmed: item?.confirmed !== false
  })).filter(item => item.field || item.value) : [];
  return {
    id, asin: normalizeAsin(input.asin), title: clean(input.title, 1000), description: clean(input.description),
    facts, config: {model: clean(input.config?.model, 100) || "openai/gpt-oss-20b",
      faqCount: Number(input.config?.faqCount) || 5, specCount: Number(input.config?.specCount) || 6,
      strategyMode: clean(input.config?.strategyMode, 40) || "auto",
      templateMode: clean(input.config?.templateMode, 40) || "auto",
      customStrategy: clean(input.config?.customStrategy, 800)},
    slots: Array.isArray(input.slots) ? input.slots : [], texts: input.texts && typeof input.texts === "object" ? input.texts : {},
    notes: Array.isArray(input.notes) ? input.notes.slice(0, 30).map(item => clean(item, 700)) : [],
    validationWarnings: Array.isArray(input.validationWarnings) ? input.validationWarnings.slice(0, 50).map(item => clean(item, 1000)) : [],
    plan: input.plan || null, quality: input.quality || null, fillReport: input.fillReport || null,
    listing: normalizeListingWorkspace(input.listing), approved: Boolean(input.approved),
    status: PROJECT_STATUS[input.status] ? input.status : "new", error: clean(input.error, 1000),
    createdAt: Number(input.createdAt) || now, updatedAt: Number(input.updatedAt) || now
  };
}

export function factualDescription(project) {
  const confirmed = (project.facts || []).filter(item => item.confirmed && item.field && item.value)
    .map(item => `${item.field}: ${item.value}`);
  return [clean(project.description), confirmed.length ? `INFORMAÇÕES CONFIRMADAS:\n${confirmed.join("\n")}` : ""]
    .filter(Boolean).join("\n\n");
}

export function validateProject(project) {
  const slots = project.slots?.length ? project.slots : makeSlots(project.config);
  const checked = normalizeAndValidate({texts: project.texts || {}, notes: project.notes || []}, slots,
    {title: project.title, description: factualDescription(project)});
  const warnings = [...checked.issues];
  const specNames = slots.filter(slot => slot.role === "name").map(slot => checked.texts[slot.key]).filter(Boolean);
  if (specNames.length < 4) warnings.push(`Há apenas ${specNames.length} especificação(ões) preenchida(s). A Amazon pode exigir no mínimo 4; use dados reais do título, descrição ou ficha factual.`);
  if (!project.title) warnings.push("O título do produto está vazio.");
  if (!factualDescription(project)) warnings.push("A ficha factual está vazia.");
  const overLimit = slots.filter(slot => String(checked.texts[slot.key] || "").length > slot.limit);
  if (overLimit.length) warnings.push(`${overLimit.length} campo(s) ultrapassam o limite de caracteres.`);
  return {texts: checked.texts, notes: checked.notes, warnings, valid: warnings.length === 0, specCount: specNames.length};
}

export function evidenceFor(text, project) {
  const value = clean(text, 20000).toLowerCase();
  if (!value) return {level: "empty", label: "Vazio"};
  const sources = [
    {label: "Título", value: project.title}, {label: "Descrição", value: project.description},
    ...(project.facts || []).filter(item => item.confirmed).map(item => ({label: item.source || item.field, value: `${item.field} ${item.value}`}))
  ];
  const tokens = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter(token => token.length >= 5 || /^\d/.test(token));
  const matched = sources.find(source => {
    const hay = clean(source.value, 20000).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return tokens.some(token => hay.includes(token));
  });
  return matched ? {level: "supported", label: `Base: ${matched.label}`} : {level: "review", label: "Revisar origem"};
}

export function parseQueue(text) {
  return String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 50).map(line => {
    const [asin = "", title = "", description = ""] = line.split(";").map(item => item.trim());
    return {asin: normalizeAsin(asin), title: clean(title, 1000), description: clean(description)};
  }).filter(item => item.asin || item.title);
}
