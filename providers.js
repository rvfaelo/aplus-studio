// O identificador legado é mantido para não quebrar projetos salvos em versões anteriores.
// A interface agora apresenta este modo como "Automático — priorizar qualidade".
export const AUTO_MODEL = "auto/economico";
export const XKIRO_AUTO_QUALITY_MODEL = "xkiro/auto-quality";

export function providerForModel(model) {
  const value=String(model||"");
  if(value===AUTO_MODEL)return "auto";
  if(value.startsWith("openai-api/"))return "openai";
  if(value.startsWith("gemini/"))return "gemini";
  if(value.startsWith("kira/"))return "kira";
  if(value.startsWith("tokenrouter/"))return "kira"; // migração da versão 1.3
  if(value.startsWith("openrouter/"))return "openrouter";
  if(value.startsWith("xkiro/"))return "xkiro";
  if(value.startsWith("deepseek/"))return "deepseek";
  return "groq";
}

export function modelForRequest(model) {
  const value=String(model||"");
  if(value==="tokenrouter/z-ai/glm-5.3-free")return "glm-5.3-free";
  // xKiro exige o ID completo do catálogo (vendor/model). O prefixo xkiro/
  // existe apenas dentro da extensão para distinguir o provedor.
  return value.replace(/^(?:openai-api|kira|xkiro|openrouter|deepseek)\//,"");
}

function modelText(model={}) {
  return `${model.id||""} ${model.display_name||""}`.toLowerCase();
}

// Heurística deliberadamente voltada a QUALIDADE para o catálogo gratuito do xKiro.
// Não usa preço como desempate: o modo automático só considera access_tier=free.
// O catálogo ao vivo continua sendo a fonte de verdade; assim, modelos novos podem
// ser escolhidos sem exigir uma atualização da extensão.
export function xkiroQualityScore(model={}) {
  if(String(model.access_tier||"").toLowerCase()!=="free")return Number.NEGATIVE_INFINITY;
  const text=modelText(model);
  let score=0;
  const context=Number(model.context_length||0), output=Number(model.max_output_tokens||0);
  if(model.capabilities?.reasoning)score+=32;
  if(model.capabilities?.vision)score+=2;
  if(context>=1_000_000)score+=14;else if(context>=250_000)score+=11;else if(context>=128_000)score+=8;else if(context>=64_000)score+=4;
  if(output>=32_000)score+=9;else if(output>=16_000)score+=7;else if(output>=8_000)score+=4;

  if(/\bmax\b/.test(text))score+=24;
  if(/\bpro\b/.test(text))score+=20;
  if(/\bplus\b/.test(text))score+=12;
  if(/\bpreview\b/.test(text))score+=2;
  if(/\bflash\b/.test(text))score+=3;
  if(/\bhighspeed\b|\bturbo\b/.test(text))score-=2;
  if(/\bcoder\b|\bcode\b/.test(text))score-=10; // A+ é redação/planejamento, não programação.
  if(/\bmini\b|\blite\b|\bsmall\b/.test(text))score-=14;

  const sizes=[...text.matchAll(/(?:^|[^\d])(\d{1,3}(?:\.\d+)?)b(?:\b|[^a-z])/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  const size=sizes.length?Math.max(...sizes):0;
  if(size>=100)score+=22;else if(size>=70)score+=18;else if(size>=32)score+=14;else if(size>=20)score+=9;else if(size>0&&size<=10)score-=8;

  // Pequeno desempate para gerações mais recentes quando a família expõe versão no nome.
  const versions=[...text.matchAll(/\b(\d+)\.(\d+)\b/g)].map(match=>Number(match[1])*10+Number(match[2]));
  if(versions.length)score+=Math.min(8,Math.max(...versions)/10);
  return score;
}

export function chooseXkiroQualityModel(models=[]) {
  const free=(Array.isArray(models)?models:[]).filter(item=>String(item?.access_tier||"").toLowerCase()==="free" && String(item?.id||"").includes("/"));
  return free.sort((a,b)=>xkiroQualityScore(b)-xkiroQualityScore(a) || Number(b.context_length||0)-Number(a.context_length||0) || String(a.id).localeCompare(String(b.id)))[0]||null;
}

export function automaticCandidates(purpose="texts") {
  // Qualidade primeiro. Dentro do xKiro, o modelo é escolhido no catálogo ao vivo
  // entre os modelos GRATUITOS, evitando uso pago acidental.
  return purpose==="planning" ? [
    {provider:"openai",model:"openai-api/gpt-5.6-sol"},
    {provider:"xkiro",model:XKIRO_AUTO_QUALITY_MODEL},
    {provider:"openrouter",model:"openrouter/auto-free"},
    {provider:"groq",model:"openai/gpt-oss-120b"},
    {provider:"deepseek",model:"deepseek/deepseek-v4-flash"},
    {provider:"kira",model:"kira/glm-5.3-free"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash"},
    {provider:"kira",model:"kira/qwen3.8-flash"},
    {provider:"groq",model:"qwen/qwen3.8-27b"},
    {provider:"openai",model:"openai-api/gpt-5.6-terra"},
    {provider:"openai",model:"openai-api/gpt-5.6-luna"}
  ] : [
    {provider:"openai",model:"openai-api/gpt-5.6-sol"},
    {provider:"xkiro",model:XKIRO_AUTO_QUALITY_MODEL},
    {provider:"openrouter",model:"openrouter/auto-free"},
    {provider:"groq",model:"openai/gpt-oss-120b"},
    {provider:"deepseek",model:"deepseek/deepseek-v4-flash"},
    {provider:"kira",model:"kira/glm-5.3-free"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash"},
    {provider:"kira",model:"kira/qwen3.8-flash"},
    {provider:"groq",model:"qwen/qwen3.8-27b"},
    {provider:"openai",model:"openai-api/gpt-5.6-terra"},
    {provider:"openai",model:"openai-api/gpt-5.6-luna"},
    {provider:"groq",model:"openai/gpt-oss-20b"}
  ];
}

export function routesFor(model,keys={},purpose="texts") {
  const provider=providerForModel(model);
  const candidates=provider==="auto"?automaticCandidates(purpose):[{provider,model}];
  const disabled=new Set(Array.isArray(keys.__disabledModels)?keys.__disabledModels:[]);
  const verified=new Set(Array.isArray(keys.__verifiedModels)?keys.__verifiedModels:[]);
  // A trava de modelos aprovados vale para o automático. A escolha manual
  // continua disponível como substituição consciente do usuário.
  const verifiedOnly=provider==="auto"&&Boolean(keys.__useOnlyVerified);
  return candidates.filter(item=>String(keys[item.provider]||"").trim() && !disabled.has(item.model) &&
    (!verifiedOnly || verified.has(item.model))).map(item=>({...item,apiKey:String(keys[item.provider]).trim(),
      verifiedOnly,verifiedModels:verified}));
}

export const DISPLAY_MODELS = Object.freeze({
  openai:["openai-api/gpt-5.6-luna","openai-api/gpt-5.6-terra","openai-api/gpt-5.6-sol"],
  kira:["kira/qwen3.8-flash","kira/glm-5.3-free"],
  xkiro:[XKIRO_AUTO_QUALITY_MODEL],openrouter:["openrouter/auto-free"],
  gemini:["gemini/gemini-3.5-flash"],
  groq:["openai/gpt-oss-20b","openai/gpt-oss-120b","qwen/qwen3.8-27b"],
  deepseek:["deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro"]
});

export const MODEL_MIGRATIONS = Object.freeze({
  "gemini/gemini-2.5-flash":"gemini/gemini-3.5-flash",
  "gemini/gemini-2.5-flash-lite":"gemini/gemini-3.5-flash",
  "gemini/gemini-3.5-flash-lite":"gemini/gemini-3.5-flash",
  "qwen/qwen3.6-27b":"qwen/qwen3.8-27b",
  "llama-3.1-8b-instant":"openai/gpt-oss-120b",
  "llama-3.3-70b-versatile":"openai/gpt-oss-120b",
  "tokenrouter/z-ai/glm-5.3-free":"kira/glm-5.3-free",
  "deepseek/deepseek-flash":"xkiro/auto-quality"
});
export const migrateModel = model => MODEL_MIGRATIONS[model] || model || XKIRO_AUTO_QUALITY_MODEL;

// Free variants must be explicitly published with zero input/output price.
// Never manufacture a :free suffix or silently strip it for a paid model.
export function isOpenRouterFree(model) {
  const pricing = model?.pricing || {};
  return /:free$/.test(String(model?.id || "")) &&
    ["prompt", "completion"].every(key => pricing[key] !== undefined && pricing[key] !== null && pricing[key] !== "" && Number(pricing[key]) === 0) &&
    Object.values(pricing).every(value => value == null || value === "" || Number(value) === 0) &&
    model?.architecture?.output_modalities?.includes("text") &&
    model?.architecture?.input_modalities?.includes("text") && Number(model.context_length) >= 16000;
}

// A suitability estimate, not a benchmark of writing quality. Live history
// corrects this initial ordering based on validated output and elapsed time.
export function freeTaskScore(model, purpose = "texts", provider = "openrouter") {
  if (provider === "openrouter" && !isOpenRouterFree(model)) return -Infinity;
  if (provider === "xkiro" && !Number.isFinite(xkiroQualityScore(model))) return -Infinity;
  const description = `${model.id} ${model.name || model.display_name || ""} ${model.description || ""}`.toLowerCase();
  const params = model.supported_parameters || [];
  const analytical = ["analysis", "technical", "returns", "planning", "research", "competitors", "bundles"].includes(purpose);
  const complex=["texts","copy","technical","listing","analysis","returns","planning","research","competitors","bundles"].includes(purpose);
  const sizes=[...description.matchAll(/(?:^|[^\d])(\d{1,3}(?:\.\d+)?)b(?:\b|[^a-z])/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  const largestSize=sizes.length?Math.max(...sizes):0;
  if(complex&&largestSize>0&&largestSize<=8)return Number.NEGATIVE_INFINITY;
  let score = provider === "xkiro" ? xkiroQualityScore(model) / 3 : 20;
  if (params.includes("response_format") || params.includes("structured_outputs")) score += 14;
  if (/multilingual|portuguese|português|instruction.following/.test(description)) score += 12;
  if (/general.purpose|generalist|conversational|language capabilities/.test(description)) score += 10;
  if (/reasoning|planning|analysis/.test(description)) score += analytical ? 18 : 5;
  if (/creative|writing|marketing|copywriting/.test(description)) score += analytical ? 5 : 20;
  if (/coding agent|software engineering|finance.focused|health and medicine.focused|coder|code model/.test(description)) score -= 35;
  if (/nemotron/.test(description)) score += analytical ? 10 : 0;
  if (/inkling|qwen|glm/.test(description)) score += analytical ? 4 : 10;
  if (/mini|lite|small|\b8b\b/.test(description)) score -= 20;
  if (/flash|lightning|high.throughput/.test(description)) score += 5;
  return score;
}
