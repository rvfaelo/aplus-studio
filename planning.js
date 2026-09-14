import {generateStructured} from "./openai.js";

const clean = (value, max = 1200) => String(value ?? "").normalize("NFC")
  .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

export function planningInstructions() {
  return `Você é um planejador de Amazon A+ Premium em português do Brasil.
Responda SOMENTE com JSON válido. Não use Markdown.

Use exclusivamente os fatos do título e da descrição. Nunca invente medidas, material, capacidade, compatibilidade, certificação, itens inclusos, garantia, desempenho, público ou resultado. Público, problema e contexto de uso que não estejam explícitos devem ser marcados como inferência cautelosa.

Formato obrigatório:
{
  "diagnosis": {"category":"", "audience":"", "audience_is_inference":true, "main_problem":"", "central_benefit":"", "summary":""},
  "missing_information":[{"field":"", "reason":""}],
  "feature_benefits":[{"feature":"", "benefit":"", "evidence":""}],
  "image_briefs":[{"module":"", "size":"", "goal":"", "scene":"", "composition":"", "prompt":""}],
  "notes":[""]
}

Regras:
- Liste de 3 a 8 informações realmente ausentes que fariam diferença no A+. Não diga que algo falta quando aparece na descrição.
- Crie de 2 a 8 relações característica-benefício. evidence deve ser um trecho curto ou paráfrase estritamente sustentada pelos dados recebidos.
- Se houver menos de 2 características comprovadas, use apenas as disponíveis e explique em notes.
- Crie exatamente 8 briefings de imagens, nesta ordem e com estes nomes/tamanhos:
  1. Banner principal — 1464 × 600
  2. Quatro imagens · Imagem 1 — 300 × 225
  3. Quatro imagens · Imagem 2 — 300 × 225
  4. Quatro imagens · Imagem 3 — 300 × 225
  5. Quatro imagens · Imagem 4 — 300 × 225
  6. Duas imagens · Imagem 1 — 650 × 350
  7. Duas imagens · Imagem 2 — 650 × 350
  8. Banner final — 1464 × 600
- Cada briefing deve usar uma cena, fundo e ângulo diferentes, sem colagem, grid ou mosaico.
- Os banners devem manter produto e elementos essenciais na área central segura de aproximadamente 600 × 450.
- Os prompts devem pedir produto idêntico à referência, fotografia comercial realista, sem texto, logo, marca d'água, números ou medidas na imagem.
- Não sugira depoimentos, avaliações, concorrentes, descontos, urgência, garantia ou alegações sem prova.
- O plano é separado dos textos que serão preenchidos na Amazon.`;
}

export function normalizePlan(raw) {
  const issues = [], diagnosis = raw?.diagnosis || {};
  const requiredDiagnosis = ["category", "audience", "main_problem", "central_benefit", "summary"];
  for (const key of requiredDiagnosis) if (typeof diagnosis[key] !== "string") issues.push(`diagnosis.${key} ausente.`);
  const pairs = (value, keys, max) => Array.isArray(value) ? value.slice(0, max).map((item, index) => {
    const result = {};
    for (const key of keys) {
      if (typeof item?.[key] !== "string") issues.push(`${key} ausente na linha ${index + 1}.`);
      result[key] = clean(item?.[key]);
    }
    return result;
  }) : (issues.push("Uma lista obrigatória está ausente."), []);
  const missingInformation = pairs(raw?.missing_information, ["field", "reason"], 8);
  const featureBenefits = pairs(raw?.feature_benefits, ["feature", "benefit", "evidence"], 8);
  const imageBriefs = pairs(raw?.image_briefs, ["module", "size", "goal", "scene", "composition", "prompt"], 8);
  if (missingInformation.length < 3) issues.push("Liste pelo menos 3 informações ausentes relevantes.");
  if (!featureBenefits.length) issues.push("Inclua ao menos uma relação entre característica e benefício.");
  if (imageBriefs.length !== 8) issues.push("São necessários exatamente 8 briefings de imagem.");
  const expectedSizes = ["1464 × 600", "300 × 225", "300 × 225", "300 × 225", "300 × 225", "650 × 350", "650 × 350", "1464 × 600"];
  imageBriefs.forEach((brief, index) => {
    if (brief.size.replace(/x/g, "×").replace(/\s/g, "") !== expectedSizes[index]?.replace(/\s/g, "")) issues.push(`Tamanho incorreto no briefing ${index + 1}.`);
  });
  const value = {diagnosis: Object.fromEntries(requiredDiagnosis.map(key => [key, clean(diagnosis[key])])),
    audienceIsInference: Boolean(diagnosis.audience_is_inference), missingInformation, featureBenefits, imageBriefs,
    notes: Array.isArray(raw?.notes) ? raw.notes.slice(0, 12).map(note => clean(note, 700)) : []};
  return {value, issues};
}

export async function generatePlan(options) {
  return generateStructured({...options, instructions: planningInstructions(), validate: normalizePlan});
}

export function buildFullImagePrompt(plan, title = "") {
  const briefs = Array.isArray(plan?.imageBriefs) ? plan.imageBriefs : [];
  if (!briefs.length) return "";
  const product = clean(title, 1000) || clean(plan?.diagnosis?.category, 300) || "produto das imagens de referência";
  const lines = [
    `Crie exatamente ${briefs.length} imagens para o produto: ${product}.`,
    "",
    "REGRAS OBRIGATÓRIAS PARA TODAS AS IMAGENS:",
    "- Gere cada imagem separadamente, como uma imagem individual. Nunca use grid, colagem, mosaico ou montagem com várias cenas.",
    "- O produto deve permanecer idêntico às imagens de referência, sem mudar formato, cor, proporções, peças ou detalhes.",
    "- Use fotografia comercial realista de alta qualidade e mantenha uma cena, fundo e ângulo diferentes em cada imagem.",
    "- Não inclua texto, letras, números, medidas, setas, logos ou marcas d'água.",
    "- Nos banners 1464 × 600, mantenha o produto e os elementos essenciais dentro da área segura central aproximada de 600 × 450.",
    "- Produza as imagens na ordem abaixo e respeite exatamente o tamanho indicado para cada uma.",
    ""
  ];
  briefs.forEach((brief, index) => {
    lines.push(`${index + 1}. ${clean(brief.module, 300)} (${clean(brief.size, 80)})`);
    if (brief.goal) lines.push(`Objetivo: ${clean(brief.goal, 700)}`);
    if (brief.scene) lines.push(`Cena: ${clean(brief.scene, 1000)}`);
    if (brief.composition) lines.push(`Composição: ${clean(brief.composition, 1000)}`);
    lines.push(`Prompt: ${clean(brief.prompt, 3000)}`, "");
  });
  lines.push("Entregue as imagens separadamente, na sequência indicada, nunca reunidas em uma única imagem.");
  return lines.join("\n");
}

const words = value => new Set(clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(word => word.length > 3));
const similarity = (a, b) => {
  const left = words(a), right = words(b);
  if (!left.size || !right.size) return 0;
  const common = [...left].filter(word => right.has(word)).length;
  return common / Math.min(left.size, right.size);
};

export function scoreAplus({slots = [], texts = {}, title = "", description = ""}) {
  const issues = [], criteria = [];
  const entries = slots.map(slot => ({slot, text: clean(texts[slot.key], 20000)}));
  const present = entries.filter(entry => entry.text);
  const required = entries.filter(entry => !entry.slot.optional);
  const limitFailures = entries.filter(entry => entry.text.length > entry.slot.limit);
  const limitScore = limitFailures.length ? Math.max(0, 20 - limitFailures.length * 5) : 20;
  if (limitFailures.length) issues.push(`${limitFailures.length} texto(s) ultrapassam o limite de caracteres.`);
  criteria.push({name: "Limites de caracteres", score: limitScore, max: 20});

  const requiredFilled = required.filter(entry => entry.text).length;
  const completenessScore = required.length ? Math.round(20 * requiredFilled / required.length) : 0;
  if (requiredFilled < required.length) issues.push(`${required.length - requiredFilled} campo(s) obrigatório(s) estão vazios.`);
  criteria.push({name: "Campos obrigatórios", score: completenessScore, max: 20});

  const sourceNumbers = new Set(`${title} ${description}`.match(/\b\d+(?:[.,]\d+)?\b/g)?.map(value => value.replace(",", ".")) || []);
  const unsupported = new Set();
  for (const entry of present) for (const number of entry.text.match(/\b\d+(?:[.,]\d+)?\b/g) || [])
    if (!sourceNumbers.has(number.replace(",", "."))) unsupported.add(number);
  const risky = present.filter(entry => /(compre agora|frete gr[aá]tis|desconto|oferta limitada|melhor do mercado|n[ºo°]\s*1|garantia de \d|100% garantido)/i.test(entry.text));
  const factualScore = Math.max(0, 25 - unsupported.size * 5 - risky.length * 5);
  if (unsupported.size) issues.push(`Números sem apoio na descrição: ${[...unsupported].join(", ")}.`);
  if (risky.length) issues.push(`${risky.length} campo(s) contêm linguagem promocional ou alegação arriscada.`);
  criteria.push({name: "Segurança factual", score: factualScore, max: 25});

  const content = present.filter(entry => !["name", "module_heading"].includes(entry.slot.role));
  let repeats = 0;
  for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++)
    if (similarity(content[i].text, content[j].text) >= 0.72) repeats++;
  const varietyScore = Math.max(0, 20 - repeats * 3);
  if (repeats) issues.push(`${repeats} possível(is) repetição(ões) entre os módulos.`);
  criteria.push({name: "Variedade dos módulos", score: varietyScore, max: 20});

  const formatting = present.filter(entry => /[<>]|https?:\/\/|www\.|[\u2013\u2014]/i.test(entry.text));
  const readabilityScore = Math.max(0, 15 - formatting.length * 3);
  if (formatting.length) issues.push(`${formatting.length} campo(s) possuem link, marcação ou travessão.`);
  criteria.push({name: "Clareza e formatação", score: readabilityScore, max: 15});
  const score = criteria.reduce((total, item) => total + item.score, 0);
  const strengths = criteria.filter(item => item.score === item.max).map(item => item.name);
  return {score, criteria, issues, strengths, checkedFields: entries.length};
}
