import {generateStructured} from "./openai.js";
import {compactSalesStrategy, strategyPrompt} from "./strategy.js";

const clean = (value, max = 1200) => String(value ?? "").normalize("NFC")
  .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

export function planningInstructions(strategy = null) {
  const antiReturn = strategy?.planningFocus === "returns";
  const briefShape = antiReturn
    ? `{"module":"", "size":"", "goal":"", "scene":"", "composition":"", "prompt":"", "question_answered":"", "return_risk_reduced":"", "must_show":"", "must_not_suggest":"", "overlay_text":""}`
    : `{"module":"", "size":"", "goal":"", "scene":"", "composition":"", "prompt":""}`;
  const visualRules = antiReturn ? `
REGRAS ESPECÍFICAS DO MODO ANTI-DEVOLUÇÃO:
- As oito imagens devem funcionar como uma demonstração visual do produto. Clareza e compra correta vêm antes da beleza e da emoção.
- No máximo duas imagens podem ser exclusivamente lifestyle. As demais devem demonstrar produto, conteúdo da compra, escala, material, comportamento físico, uso correto, medição, compatibilidade, instalação ou limitação comprovada.
- Cada briefing deve responder uma dúvida diferente e preencher question_answered, return_risk_reduced, must_show e must_not_suggest.
- O Banner principal identifica exatamente o produto; a imagem 2 mostra o que acompanha; a 3 mostra tamanho/escala; a 4 material/comportamento; a 5 uso correto; a 6 medição/compatibilidade/instalação; a 7 limite/expectativa real; o Banner final resume a decisão.
- Se não houver fato suficiente para uma função, adapte a cena para esclarecer outra dúvida comprovada. Nunca invente uma medida, limitação ou incompatibilidade.
- Variações no primeiro e último banner devem parecer opções, nunca um kit, salvo quando o conjunto estiver confirmado.
- Pessoas só entram para demonstrar escala ou uso correto. Nunca use uma pessoa apenas como decoração.
- overlay_text contém, quando indispensável, uma legenda factual muito curta para ser adicionada DEPOIS por uma camada gráfica. O prompt fotográfico nunca deve pedir à IA para desenhar letras, números ou setas.
- Para produto infantil, não crie cena que sugira uso sem supervisão, sustentação ou segurança não comprovadas.
` : "";
  return `Você é um planejador de Amazon A+ Premium em português do Brasil.
Responda SOMENTE com JSON válido. Não use Markdown.

${strategyPrompt(strategy)}

Use exclusivamente os fatos do título e da descrição. Nunca invente medidas, material, capacidade, compatibilidade, certificação, itens inclusos, garantia, desempenho, público ou resultado. Público, problema e contexto de uso que não estejam explícitos devem ser marcados como inferência cautelosa.

Formato obrigatório:
{
  "planning_focus":"${antiReturn ? "returns" : "commercial"}",
  "diagnosis": {"category":"", "audience":"", "audience_is_inference":true, "purchase_moment":"", "main_problem":"", "emotional_desire":"", "main_objection":"", "central_benefit":"", "summary":""},
  "missing_information":[{"field":"", "reason":""}],
  "feature_benefits":[{"feature":"", "benefit":"", "evidence":""}],
  "image_briefs":[${briefShape}],
  "notes":[""]
}

Regras:
- Liste de 3 a 8 informações realmente ausentes que fariam diferença no A+. Não diga que algo falta quando aparece na descrição.
- Refine audience, purchase_moment, main_problem, emotional_desire e main_objection para este produto específico. Marque audience_is_inference como true sempre que o público não estiver literal nos dados.
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
- Cada briefing deve cumprir a função persuasiva do módulo definida na estratégia, além de usar cena, fundo e ângulo visual diferentes, sem colagem, grid ou mosaico.
- Se o produto tiver mais de uma variação confirmada (como cor, estampa, tamanho, kit ou modelo), o Banner principal e o Banner final devem mostrar TODAS as variações juntas. Não escolha apenas uma e não invente variações ausentes dos dados ou das imagens de referência. Essa regra permite reutilizar o mesmo A+ nos ASINs das variações.
- Quando uma pessoa ajudar a demonstrar o benefício, escolha homem ou mulher conforme o público, a categoria e o cenário de uso. Em produtos de uso amplo, distribua homens e mulheres entre as cenas humanas para mostrar contextos diferentes; por exemplo, uma almofada de cadeira pode aparecer com uma mulher e com um homem trabalhando em home office. Não force alternância nem inclua uma pessoa quando isso não contribuir para a estratégia do produto.
- Nos briefings que incluírem pessoas, declare de forma explícita no campo prompt quem aparece e qual uso real está sendo demonstrado. Evite repetir a mesma pessoa em todas as imagens.
- Os banners devem manter produto e elementos essenciais na área central segura de aproximadamente 600 × 450.
- Os prompts devem pedir produto idêntico à referência, fotografia comercial realista, sem texto, logo, marca d'água, números ou medidas na imagem.
- Não sugira depoimentos, avaliações, concorrentes, descontos, urgência, garantia ou alegações sem prova.
- O plano é separado dos textos que serão preenchidos na Amazon.
${visualRules}`;
}

export function normalizePlan(raw, strategy = null) {
  const issues = [], diagnosis = raw?.diagnosis || {};
  const requiredDiagnosis = ["category", "audience", "main_problem", "central_benefit", "summary"];
  const optionalDiagnosis = ["purchase_moment", "emotional_desire", "main_objection"];
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
  const antiReturn = strategy?.planningFocus === "returns" || raw?.planning_focus === "returns";
  const imageBriefKeys = ["module", "size", "goal", "scene", "composition", "prompt",
    ...(antiReturn ? ["question_answered", "return_risk_reduced", "must_show", "must_not_suggest", "overlay_text"] : [])];
  const imageBriefs = pairs(raw?.image_briefs, imageBriefKeys, 8);
  imageBriefs.forEach((brief, index) => {
    if (index === 0 || index === 7) brief.prompt = clean(`${brief.prompt} Se existirem duas ou mais variações confirmadas do produto nos dados ou nas imagens de referência, mostre todas elas juntas neste banner, sem omitir nenhuma e sem inventar novas variações.`, 3000);
  });
  if (missingInformation.length < 3) issues.push("Liste pelo menos 3 informações ausentes relevantes.");
  if (!featureBenefits.length) issues.push("Inclua ao menos uma relação entre característica e benefício.");
  if (imageBriefs.length !== 8) issues.push("São necessários exatamente 8 briefings de imagem.");
  const expectedSizes = ["1464 × 600", "300 × 225", "300 × 225", "300 × 225", "300 × 225", "650 × 350", "650 × 350", "1464 × 600"];
  imageBriefs.forEach((brief, index) => {
    if (brief.size.replace(/x/g, "×").replace(/\s/g, "") !== expectedSizes[index]?.replace(/\s/g, "")) issues.push(`Tamanho incorreto no briefing ${index + 1}.`);
  });
  const value = {planningFocus: antiReturn ? "returns" : "commercial",
    diagnosis: Object.fromEntries([...requiredDiagnosis, ...optionalDiagnosis].map(key => [key, clean(diagnosis[key])])),
    audienceIsInference: Boolean(diagnosis.audience_is_inference), missingInformation, featureBenefits, imageBriefs,
    notes: Array.isArray(raw?.notes) ? raw.notes.slice(0, 12).map(note => clean(note, 700)) : []};
  return {value, issues};
}

export async function generatePlan(options) {
  const plan = await generateStructured({...options, instructions: planningInstructions(options.strategy),
    validate: raw => normalizePlan(raw, options.strategy)});
  if (options.strategy) {
    plan.salesStrategy = compactSalesStrategy(options.strategy);
    plan.categoryChecklist = options.strategy.checklist || [];
  }
  return plan;
}

export function buildFullImagePrompt(plan, title = "") {
  const briefs = Array.isArray(plan?.imageBriefs) ? plan.imageBriefs : [];
  if (!briefs.length) return "";
  const product = clean(title, 1000) || clean(plan?.diagnosis?.category, 300) || "produto das imagens de referência";
  const antiReturn = plan?.planningFocus === "returns" || plan?.salesStrategy?.planningFocus === "returns";
  const lines = [
    `Crie exatamente ${briefs.length} imagens para o produto: ${product}.`,
    "",
    "REGRAS OBRIGATÓRIAS PARA TODAS AS IMAGENS:",
    "- Gere cada imagem separadamente, como uma imagem individual. Nunca use grid, colagem, mosaico ou montagem com várias cenas.",
    "- O produto deve permanecer idêntico às imagens de referência, sem mudar formato, cor, proporções, peças ou detalhes.",
    "- Use fotografia comercial realista de alta qualidade e mantenha uma cena, fundo e ângulo diferentes em cada imagem.",
    "- Se houver duas ou mais variações confirmadas do produto, mostre TODAS juntas na imagem 1 (Banner principal) e na imagem 8 (Banner final). Não omita nem invente variações.",
    "- Use pessoas somente quando demonstrarem um benefício real. Escolha homem ou mulher conforme o produto, o público e a situação; em produtos de uso amplo, varie entre homem e mulher nas cenas humanas, sem repetir sempre a mesma pessoa e sem forçar uma presença humana inadequada.",
    "- Não inclua texto, letras, números, medidas, setas, logos ou marcas d'água.",
    "- Nos banners 1464 × 600, mantenha o produto e os elementos essenciais dentro da área segura central aproximada de 600 × 450.",
    "- Produza as imagens na ordem abaixo e respeite exatamente o tamanho indicado para cada uma.",
    ""
  ];
  if (antiReturn) lines.push(
    "FOCO CENTRAL: DEMONSTRAÇÃO VISUAL ANTI-DEVOLUÇÃO",
    "- Prioridade: evitar compra errada, mostrar exatamente o produto e corrigir expectativas antes de persuadir.",
    "- No máximo duas imagens podem ser exclusivamente lifestyle; as demais devem demonstrar uma informação decisiva.",
    "- Não esconda limitações comprovadas e não sugira quantidade, escala, firmeza, resistência, segurança ou compatibilidade inexistentes.",
    "- Pessoas só devem aparecer para explicar escala ou uso correto.",
    "- Qualquer texto visual indicado abaixo é uma orientação para sobreposição posterior. NÃO renderize letras, números ou setas na fotografia gerada.",
    ""
  );
  if (plan?.salesStrategy) {
    lines.push(`Direção de venda: ${clean(plan.salesStrategy.direction, 800)}`,
      `Cliente e desejo: ${clean(plan.salesStrategy.buyer, 700)}; ${clean(plan.salesStrategy.desire, 700)}`,
      "Cada imagem deve reforçar o ângulo comercial do seu módulo sem adicionar texto à própria imagem.", "");
  }
  briefs.forEach((brief, index) => {
    lines.push(`${index + 1}. ${clean(brief.module, 300)} (${clean(brief.size, 80)})`);
    if (brief.goal) lines.push(`Objetivo: ${clean(brief.goal, 700)}`);
    if (brief.scene) lines.push(`Cena: ${clean(brief.scene, 1000)}`);
    if (brief.composition) lines.push(`Composição: ${clean(brief.composition, 1000)}`);
    if (antiReturn && brief.question_answered) lines.push(`Dúvida respondida: ${clean(brief.question_answered, 700)}`);
    if (antiReturn && brief.return_risk_reduced) lines.push(`Risco de devolução reduzido: ${clean(brief.return_risk_reduced, 700)}`);
    if (antiReturn && brief.must_show) lines.push(`Precisa ficar visível: ${clean(brief.must_show, 900)}`);
    if (antiReturn && brief.must_not_suggest) lines.push(`Não pode sugerir: ${clean(brief.must_not_suggest, 900)}`);
    if (antiReturn && brief.overlay_text) lines.push(`Texto visual opcional para adicionar depois, sem renderizar na foto: ${clean(brief.overlay_text, 300)}`);
    lines.push(`Prompt: ${clean(brief.prompt, 3000)}`, "");
  });
  lines.push("Entregue as imagens separadamente, na sequência indicada, nunca reunidas em uma única imagem.");
  return lines.join("\n");
}

const REPETITION_STOPWORDS = new Set([
  "ainda", "algum", "alguma", "antes", "cada", "como", "com", "deixa", "este", "esta", "isso", "mais",
  "mesmo", "muito", "para", "pela", "pelo", "pode", "produto", "seu", "seus", "sua", "suas", "tambem",
  "todo", "toda", "todos", "todas", "uma", "usar", "uso"
]);
const comparableText = value => clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const words = (value, ignored = new Set()) => new Set(comparableText(value).split(/\s+/)
  .filter(word => word.length > 3 && !REPETITION_STOPWORDS.has(word) && !ignored.has(word)));
const similarity = (a, b, ignored = new Set()) => {
  const left = words(a, ignored), right = words(b, ignored);
  if (!left.size || !right.size) return {score: 0, common: [], left, right};
  const common = [...left].filter(word => right.has(word));
  // Dice exige equilíbrio entre os dois textos. O cálculo antigo dividia pelo
  // menor texto e dizia 100% sempre que uma especificação curta aparecia num corpo maior.
  return {score: (2 * common.length) / (left.size + right.size), common, left, right};
};
const fieldLabel = entry => clean(entry.slot.label || entry.slot.key, 160);
const moduleIdentity = entry => {
  const numbered = /^(four|two|faq|specs)_(\d+)_/.exec(entry.slot.key || "");
  return numbered ? `${numbered[1]}_${numbered[2]}` : entry.slot.module || entry.slot.key;
};
const excerpt = (value, max = 140) => {
  const text = clean(value, 1000);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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

  const sourceNumbers = new Set(`${title} ${description}`.match(/(?<!\d)\d+(?:[.,]\d+)?(?!\d)/g)?.map(value => value.replace(",", ".")) || []);
  const unsupported = new Map();
  for (const entry of present) for (const number of entry.text.match(/(?<!\d)\d+(?:[.,]\d+)?(?!\d)/g) || []) {
    const normalized = number.replace(",", ".");
    if (sourceNumbers.has(normalized)) continue;
    if (!unsupported.has(normalized)) unsupported.set(normalized, {display: number, entries: []});
    const record = unsupported.get(normalized);
    if (!record.entries.some(item => item.slot.key === entry.slot.key)) record.entries.push(entry);
  }
  const risky = present.filter(entry => /(compre agora|frete gr[aá]tis|desconto|oferta limitada|melhor do mercado|n[ºo°]\s*1|garantia de \d|100% garantido)/i.test(entry.text));
  const factualScore = Math.max(0, 25 - unsupported.size * 5 - risky.length * 5);
  if (unsupported.size) {
    const displays = [...unsupported.values()].map(item => item.display);
    issues.push(`Números sem apoio nos dados do produto: ${displays.join(", ")}. Eles aparecem no conteúdo A+, mas não foram encontrados no título nem na descrição. Confira a fonte de cada número ou remova-o.`);
    for (const {display, entries: locations} of unsupported.values()) {
      const labels = locations.map(fieldLabel).join("; ");
      const sample = excerpt(locations[0]?.text || "");
      issues.push(`Número ${display}: aparece em "${labels}", no trecho "${sample}". Ação: confirme esse número nos dados do produto ou ajuste o campo antes de publicar.`);
    }
  }
  if (risky.length) issues.push(`${risky.length} campo(s) contêm linguagem promocional ou alegação arriscada.`);
  criteria.push({name: "Segurança factual", score: factualScore, max: 25});

  // Variedade mede apenas textos publicitários equivalentes. Título x corpo,
  // FAQ e ficha técnica podem repetir naturalmente o nome e os fatos do produto.
  const content = present.filter(entry => ["headline", "body"].includes(entry.slot.role));
  const titleWords = words(title);
  const repetitions = [];
  for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) {
    if (moduleIdentity(content[i]) === moduleIdentity(content[j])) continue;
    if (content[i].slot.role !== content[j].slot.role) continue;
    const exact = comparableText(content[i].text) === comparableText(content[j].text);
    const compared = similarity(content[i].text, content[j].text, titleWords);
    const minimumCommon = content[i].slot.role === "headline" ? 2 : 4;
    if (!exact && (compared.score < 0.72 || compared.common.length < minimumCommon)) continue;
    const common = (compared.common.length ? compared.common : [...words(content[i].text)].filter(word => words(content[j].text).has(word))).slice(0, 8);
    repetitions.push({left: content[i], right: content[j], score: exact ? 1 : compared.score, common});
  }
  const varietyScore = Math.max(0, 20 - repetitions.length * 3);
  if (repetitions.length) {
    issues.push(`${repetitions.length} par(es) de textos muito semelhantes foram encontrados em módulos diferentes. Isso pode fazer o A+ parecer repetitivo.`);
    for (const item of repetitions.slice(0, 10)) {
      const terms = item.common.length ? ` Termos em comum: ${item.common.join(", ")}.` : "";
      issues.push(`Repetição de ${Math.round(item.score * 100)}% entre "${fieldLabel(item.left)}" e "${fieldLabel(item.right)}".${terms} Trechos: "${excerpt(item.left.text, 90)}" / "${excerpt(item.right.text, 90)}". Ação: mantenha um benefício em um campo e use o outro para um uso, detalhe ou dúvida diferente.`);
    }
    if (repetitions.length > 10) issues.push(`${repetitions.length - 10} outro(s) par(es) semelhante(s) não foram listados; revise os módulos restantes.`);
  }
  criteria.push({name: "Variedade dos módulos", score: varietyScore, max: 20});

  const formatting = present.filter(entry => /[<>]|https?:\/\/|www\.|[\u2013\u2014]/i.test(entry.text));
  const readabilityScore = Math.max(0, 15 - formatting.length * 3);
  if (formatting.length) issues.push(`${formatting.length} campo(s) possuem link, marcação ou travessão.`);
  criteria.push({name: "Clareza e formatação", score: readabilityScore, max: 15});
  const score = criteria.reduce((total, item) => total + item.score, 0);
  const strengths = criteria.filter(item => item.score === item.max).map(item => item.name);
  return {score, criteria, issues, strengths, checkedFields: entries.length,
    repetitionTargets: [...new Set(repetitions.map(item => item.right.slot.key))],
    repetitions: repetitions.map(item => ({leftKey: item.left.slot.key, rightKey: item.right.slot.key,
      leftLabel: fieldLabel(item.left), rightLabel: fieldLabel(item.right), score: Math.round(item.score * 100)}))};
}
