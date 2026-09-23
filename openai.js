import {abortError} from "./generation-policy.js";
import {buildSchema, generationInstructions, normalizeAndValidate} from "./shared.js";
import {errorDiagnostic} from "./diagnostics.js";
import {providerForModel, modelForRequest, chooseXkiroQualityModel, XKIRO_AUTO_QUALITY_MODEL, isOpenRouterFree, freeTaskScore} from "./providers.js";

const OPENAI_ENDPOINTS = Object.freeze({
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  kira: "https://kiraai.vn/api/v1/chat/completions",
  xkiro: "https://api.xkiro.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions"
  ,deepseek: "https://api.deepseek.com/chat/completions"
});
const INITIAL_OUTPUT_TOKENS = 2600;
const RECOVERY_OUTPUT_TOKENS = 6000;
const MAX_ATTEMPTS = 4;

class GenerationError extends Error {
  constructor(message, code, retryable = false, diagnostic = null) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
    this.retryable = retryable;
    this.diagnostic = diagnostic;
  }
}

function parseRetryDelay(message) {
  const match = /try again in ([\d.]+)s/i.exec(message || "");
  if (match) return Math.ceil(Number(match[1]) * 1000) + 700;
  return 15000;
}

// "6.9s" → 6900; "1m30s" → 90000; "2h" → 7200000.
function parseDuration(text) {
  if (!text) return null;
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(String(text).trim());
  if (!match) return null;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  const ms = ((h * 60 + m) * 60 + s) * 1000;
  return ms > 0 ? ms : null;
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Extrai os headers de rate limit da Groq. Devolve null quando ausentes.
function readRateLimit(response) {
  const limit = num(response.headers.get("x-ratelimit-limit-tokens"));
  const remaining = num(response.headers.get("x-ratelimit-remaining-tokens"));
  const reset = parseDuration(response.headers.get("x-ratelimit-reset-tokens"));
  if (limit === null && remaining === null && reset === null) return null;
  return {limit, remaining, resetAt: reset !== null ? Date.now() + reset : null};
}

function reasoningEffortFor(model) {
  return /^(?:openai\/gpt-oss|openai-api\/gpt-)/.test(model) ? "low" : undefined;
}

function isGemini(model) { return String(model).startsWith("gemini/"); }
function geminiModel(model) { return String(model).replace(/^gemini\//, ""); }
function outputBudget(slots) { return Math.min(INITIAL_OUTPUT_TOKENS, Math.max(700, Math.ceil(slots.reduce((n,s)=>n+s.limit,0)/4)+350)); }

function jsonStrictAvailable(provider, routerModel = null) {
  if (provider === "gemini") return true;
  if (provider === "kira" || provider === "xkiro") return false;
  return !routerModel || routerModel.supported_parameters?.includes("response_format");
}

function extractBalancedJson(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const direct = raw.match(/^\s*(\{[\s\S]*\})\s*$/);
  if (direct) return direct[1];
  const start = raw.indexOf("{");
  if (start < 0) return raw;
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < raw.length; index++) {
    const char = raw[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = inString; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  const fallback = raw.match(/\{[\s\S]*\}/);
  return fallback ? fallback[0] : raw;
}

function parseJsonObject(text) {
  const candidate = extractBalancedJson(text);
  try { return {value: JSON.parse(candidate), repaired: false}; } catch { /* tenta reparos seguros abaixo */ }
  const repaired = candidate
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\uFEFF/g, "")
    .trim();
  if (repaired !== candidate) {
    try { return {value: JSON.parse(repaired), repaired: true}; } catch { /* mantém erro original */ }
  }
  return null;
}

const MODEL_LIST_ENDPOINTS = Object.freeze({
  openai: "https://api.openai.com/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
  kira: "https://kiraai.vn/api/v1/models",
  xkiro: "https://api.xkiro.com/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models"
  ,deepseek: "https://api.deepseek.com/models"
});

const XKIRO_USAGE_ENDPOINT = "https://api.xkiro.com/v1/usage";
let xkiroCatalogCache = null;

function xkiroAuto(model) { return String(model) === XKIRO_AUTO_QUALITY_MODEL; }

async function fetchXkiroCatalog({apiKey, fetcher = fetch, force = false, signal} = {}) {
  if (!force && xkiroCatalogCache && Date.now() - xkiroCatalogCache.at < 5 * 60 * 1000) return xkiroCatalogCache.models;
  const response = await fetcher(MODEL_LIST_ENDPOINTS.xkiro, {signal, method: "GET", credentials: "omit", redirect: "error",
    headers: apiKey ? {Authorization: `Bearer ${apiKey}`} : {}});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiFailure(response.status, payload, {model: XKIRO_AUTO_QUALITY_MODEL, event: "xkiro_models"});
  const models = Array.isArray(payload.data) ? payload.data : [];
  xkiroCatalogCache = {at: Date.now(), models};
  return models;
}

async function resolveXkiroModel(model, apiKey, fetcher = fetch, signal) {
  if (!xkiroAuto(model)) return {id: modelForRequest(model), metadata: null};
  const models = await fetchXkiroCatalog({apiKey, fetcher, signal});
  const selected = chooseXkiroQualityModel(models);
  if (!selected) throw new GenerationError("Nenhum modelo gratuito de chat foi encontrado no catálogo atual do xKiro.", "xkiro_no_free_model", false,
    {model, event: "xkiro_model_select"});
  return {id: String(selected.id), metadata: selected};
}

let openRouterCache = null;
export async function freeCatalog(provider, apiKey, signal, fetcher = fetch, force = false) {
  if (provider === "xkiro") return fetchXkiroCatalog({apiKey,signal,fetcher,force});
  if (provider !== "openrouter") throw new Error("Catálogo não reconhecido.");
  if (!force && openRouterCache && Date.now()-openRouterCache.at<300000) return openRouterCache.models;
  const response = await fetcher(MODEL_LIST_ENDPOINTS.openrouter, {method:"GET",signal,credentials:"omit",redirect:"error"});
  const payload=await response.json().catch(()=>({}));
  if (!response.ok) throw apiFailure(response.status,payload,{model:"openrouter/auto-free",event:"models"});
  const models=(Array.isArray(payload.data)?payload.data:[]).filter(isOpenRouterFree);
  openRouterCache={at:Date.now(),models};
  return models;
}
async function openRouterModel(model,apiKey,signal,fetcher) {
  const models=await freeCatalog("openrouter",apiKey,signal,fetcher);
  const selected=model==="openrouter/auto-free" ? [...models].sort((a,b)=>freeTaskScore(b)-freeTaskScore(a))[0] : models.find(item=>item.id===modelForRequest(model));
  if (!selected) throw new Error("Modelo OpenRouter ausente do catálogo gratuito. Nenhum modelo pago será usado.");
  return selected;
}
function waitForRetry(milliseconds,signal) {
  return new Promise((resolve,reject)=>{
    if (signal?.aborted) return reject(abortError(signal));
    const stop=()=>{clearTimeout(timer);reject(abortError(signal));};
    const timer=setTimeout(()=>{signal?.removeEventListener("abort",stop);resolve();},milliseconds);
    signal?.addEventListener("abort",stop,{once:true});
  });
}

// Valida autenticação sem gerar conteúdo nem consumir tokens. A listagem também
// permite avisar quando o modelo padrão do provedor não está liberado na conta.
export async function testApiKey({apiKey, model, fetcher = fetch}) {
  const key = String(apiKey || "").trim();
  const provider = providerForModel(model);
  if (!key || key.length < 20 || key.length > 1000 || /\s/.test(key)) throw new Error("Cole uma API Key válida, sem espaços.");
  if (provider === "auto" || !MODEL_LIST_ENDPOINTS[provider]) throw new Error("Selecione um provedor para testar a chave.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    if (provider === "openrouter") {
      const response=await fetcher("https://openrouter.ai/api/v1/key",{method:"GET",credentials:"omit",redirect:"error",signal:controller.signal,headers:{Authorization:`Bearer ${key}`}});
      const payload=await response.json().catch(()=>({}));
      if (!response.ok) throw apiFailure(response.status,payload,{model,secrets:[key],event:"key_test"});
      if (!payload.data || typeof payload.data!=="object") throw new Error("O OpenRouter não confirmou a autenticação.");
      const models=await freeCatalog("openrouter",key,controller.signal,fetcher,true);
      const selected=[...models].sort((a,b)=>freeTaskScore(b)-freeTaskScore(a))[0];
      if (!selected) throw new Error("Chave válida, mas nenhum modelo gratuito adequado foi encontrado.");
      return {valid:true,provider,model:selected.id,modelAvailable:true,modelCount:models.length,selectedAutomatically:true};
    }
    if (provider === "xkiro") {
      // /v1/models é público no xKiro; /v1/usage exige autenticação e é gratuito,
      // por isso ele é usado para validar de verdade a chave sem gastar tokens.
      const usageResponse = await fetcher(XKIRO_USAGE_ENDPOINT, {method: "GET", credentials: "omit", redirect: "error",
        headers: {Authorization: `Bearer ${key}`}, signal: controller.signal});
      const usage = await usageResponse.json().catch(() => ({}));
      if (!usageResponse.ok) throw apiFailure(usageResponse.status, usage, {model, secrets: [key], event: "key_test"});
      const models = await fetchXkiroCatalog({apiKey: key, fetcher, force: true, signal: controller.signal});
      const selected = xkiroAuto(model) ? chooseXkiroQualityModel(models) : models.find(item => String(item?.id||"") === modelForRequest(model));
      if (xkiroAuto(model) && !selected) throw new Error("A chave é válida, mas o xKiro não publicou nenhum modelo gratuito de chat neste momento.");
      return {valid: true, provider, model: selected?.id || modelForRequest(model), modelAvailable: !!selected, modelCount: models.length,
        selectedAutomatically: xkiroAuto(model), freeTokens: usage?.free_tokens || null, plan: usage?.plan ?? null};
    }
    const headers = provider === "gemini" ? {"x-goog-api-key": key} : {Authorization: `Bearer ${key}`};
    const response = await fetcher(MODEL_LIST_ENDPOINTS[provider], {method: "GET", credentials: "omit", redirect: "error", headers, signal: controller.signal});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw apiFailure(response.status, payload, {model, secrets: [key], event: "key_test"});
    const requested = modelForRequest(model);
    const models = provider === "gemini"
      ? (payload.models || []).map(item => String(item?.name || "").replace(/^models\//, ""))
      : (payload.data || []).map(item => String(item?.id || ""));
    const modelAvailable = !models.length || models.includes(requested);
    return {valid: true, provider, model: requested, modelAvailable, modelCount: models.length};
  } catch (error) {
    if (controller.signal.aborted) throw new Error("O teste da chave demorou mais de 20 segundos. Confira a conexão e tente novamente.");
    if (error instanceof TypeError) throw new Error("Não foi possível conectar ao provedor para testar a chave.");
    throw error;
  } finally { clearTimeout(timer); }
}

function modelTestStatus(status, code = "") {
  if (status === 401) return "key_error";
  if ([400,403,404].includes(status) || ["model_not_found","permission_denied","unsupported_model"].includes(code)) return "unavailable";
  if (status === 408 || status === 429 || status >= 500) return "temporary";
  return "unstable";
}

async function probeOneModel({apiKey, model, provider, purpose = "texts", fetcher = fetch}) {
  purpose=purpose==="planning"?"planning":"texts";
  const startedAt=Date.now(),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    let requestModel=modelForRequest(model),endpoint=OPENAI_ENDPOINTS[provider],body,routerModel=null;
    if(provider==="xkiro")requestModel=(await resolveXkiroModel(model,apiKey,fetcher,controller.signal)).id;
    if(provider==="openrouter"){routerModel=await openRouterModel(model,apiKey,controller.signal,fetcher);requestModel=routerModel.id;}
    const expected=purpose==="planning"
      ? {image_briefs:[{module:"Banner principal",size:"1464 × 600",goal:"Mostrar o produto",scene:"Fundo claro",composition:"Produto central",prompt:"Fotografia realista",overlay_text:""}]}
      : {texts:{probe:"Texto A+ válido"},notes:[]};
    const instruction=`Teste de compatibilidade para ${purpose==="planning"?"briefings de imagem":"Textos A+"}. Retorne somente este JSON válido, sem Markdown: ${JSON.stringify(expected)}`;
    if(provider==="gemini"){
      endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(requestModel)}:generateContent`;
      body={contents:[{role:"user",parts:[{text:instruction}]}],generationConfig:{temperature:0,maxOutputTokens:300,responseMimeType:"application/json"}};
    }else body={model:requestModel,messages:[{role:"user",content:instruction}],stream:false,temperature:0,max_tokens:300};
    if(jsonStrictAvailable(provider,routerModel))body.response_format={type:"json_object"};
    if(provider==="openai"){delete body.max_tokens;delete body.temperature;body.max_completion_tokens=300;}
    if(provider==="openrouter")body.provider={max_price:{prompt:0,completion:0}};
    const headers={"Content-Type":"application/json",...(provider==="gemini"?{"x-goog-api-key":apiKey}:{Authorization:`Bearer ${apiKey}`})};
    const response=await fetcher(endpoint,{method:"POST",signal:controller.signal,credentials:"omit",redirect:"error",headers,body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const diagnostic=errorDiagnostic(payload,{model,httpStatus:response.status,event:"model_probe"});
      return {model,resolvedModel:requestModel,status:modelTestStatus(response.status,diagnostic.code||diagnostic.type),httpStatus:response.status,
        reason:apiError(response.status,diagnostic.code||diagnostic.type,diagnostic.param,diagnostic.message),elapsedMs:Date.now()-startedAt};
    }
    const content=provider==="gemini"?payload.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join(""):
      payload.choices?.[0]?.message?.content;
    const parsed=parseJsonObject(content);
    const valid=purpose==="planning" ? Array.isArray(parsed?.value?.image_briefs)&&parsed.value.image_briefs.length===1
      : typeof parsed?.value?.texts?.probe==="string"&&Array.isArray(parsed.value.notes);
    return {model,resolvedModel:requestModel,purpose,status:valid?"working":"unstable",httpStatus:response.status,
      reason:valid?`${purpose==="planning"?"Briefing":"Texto A+"} em JSON validado`:String(content||"").trim()?"Resposta recebida, mas o JSON exigido não foi obedecido":"O modelo respondeu sem texto",elapsedMs:Date.now()-startedAt};
  }catch(error){
    if(controller.signal.aborted)return {model,resolvedModel:modelForRequest(model),status:"temporary",httpStatus:0,reason:"Tempo de espera excedido",elapsedMs:Date.now()-startedAt};
    return {model,resolvedModel:modelForRequest(model),status:"temporary",httpStatus:Number(error?.diagnostic?.httpStatus||0),
      reason:String(error?.message||"Falha temporária de conexão").slice(0,300),elapsedMs:Date.now()-startedAt};
  }finally{clearTimeout(timer);}
}

// Faz uma chamada mínima real. Listar modelos confirma catálogo, mas não confirma
// que a conta consegue gerar com cada um.
export async function testProviderModels({apiKey,provider,models,fetcher=fetch,onResult=()=>{}}) {
  const key=String(apiKey||"").trim();
  if(!key)throw new Error("Nenhuma chave salva para este provedor.");
  const requested=[...new Set((Array.isArray(models)?models:[]).filter(model=>providerForModel(model)===provider))].slice(0,12);
  if(!requested.length)throw new Error("Nenhum modelo configurado para este provedor.");
  const results=[];
  for(const model of requested){
    const tasks={};
    for(const purpose of ["texts","planning"]){
      tasks[purpose]=await probeOneModel({apiKey:key,model,provider,purpose,fetcher});
      if(tasks[purpose].status==="key_error")break;
    }
    const taskRows=Object.values(tasks),working=taskRows.filter(row=>row.status==="working").length;
    const status=working===2?"working":working?"partial":taskRows[0]?.status||"temporary";
    const result={model,resolvedModel:taskRows.find(row=>row.resolvedModel)?.resolvedModel||modelForRequest(model),status,tasks,
      elapsedMs:taskRows.reduce((sum,row)=>sum+Number(row.elapsedMs||0),0),
      reason:[tasks.texts&&`Textos: ${tasks.texts.reason}`,tasks.planning&&`Briefings: ${tasks.planning.reason}`].filter(Boolean).join(" · ")};
    results.push(result);onResult(result);
    if(taskRows.some(row=>row.status==="key_error"))break;
  }
  return {provider,testedAt:Date.now(),results};
}

function apiFailure(status, payload, context = {}) {
  const diagnostic = errorDiagnostic(payload, {...context, httpStatus: context.httpStatus ?? status});
  const code = diagnostic.code || diagnostic.type || "";
  const retryable = status >= 500 ||
    ["server_error", "internal_server_error", "service_unavailable"].includes(code);
  let message = apiError(status, code, diagnostic.param, diagnostic.message);
  if (!status && message.startsWith("A API informou uma falha")) {
    message = diagnostic.message
      ? `Falha na geração. Mensagem da API: ${diagnostic.message.slice(0, 600)}`
      : "A API informou uma falha sem mensagem explicativa. Consulte os detalhes do erro abaixo.";
  }
  return new GenerationError(message, code, retryable, diagnostic);
}

export async function readResponseStream(response, onProgress = () => {}, context = {}) {
  if (!response.body) throw new Error("A API não retornou um fluxo de resposta.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullContent = "", received = 0, finishReason = null;
  const diagnosticContext = {
    ...context,
    httpStatus: response.status,
    requestId: response.headers.get("x-request-id") || context.requestId
  };

  try {
    for (;;) {
      let idleTimer;
      const idleMs=Number(context.streamIdleTimeoutMs||15000);
      let packet;
      try {
        packet=await Promise.race([
          reader.read(),
          new Promise((_,reject)=>{idleTimer=setTimeout(()=>reject(new GenerationError(
            "O modelo parou de enviar a resposta. O automático tentará outro modelo.","stream_idle_timeout",true,
            {...diagnosticContext,event:"stream_idle_timeout"})),idleMs);})
        ]);
      } finally {clearTimeout(idleTimer);}
      const {value, done} = packet;
      const chunk = done ? decoder.decode() : decoder.decode(value, {stream: true});
      buffer += chunk;
      received += chunk.length;
      if (received > 2000000) throw new Error("Resposta da API maior que o esperado.");

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        let item;
        try { item = JSON.parse(data); } catch { continue; }

        if (item.error) {
          throw apiFailure(0, item, {...diagnosticContext, event: "stream_error"});
        }

        const choice = item.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === "string") {
          fullContent += delta;
          onProgress(fullContent.length);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (finishReason === "length") {
    throw new GenerationError(
      "A resposta foi cortada pelo limite de tokens de saída. Tente novamente ou reduza as linhas em Opções.",
      "max_output_tokens", false, {...diagnosticContext, event: "stream_truncated", incompleteReason: "length"}
    );
  }

  if (!fullContent.trim()) {
    throw new Error("A API não retornou nenhum texto. Tente novamente.");
  }

  const parsed = parseJsonObject(fullContent);
  if (parsed) {
    return parsed.value;
  }
  throw new GenerationError(
    "A API não retornou o JSON esperado. O automático tentará outro modelo quando possível.",
    "json_validate_failed", false, {...diagnosticContext, event: "json_parse_failed",
      responseChars: fullContent.length}
  );
}

export function apiError(status, code, param, remoteMessage) {
  if (status === 401 || code === "invalid_api_key") return "API Key inválida ou revogada. Confira a chave do provedor selecionado.";
  if (status === 403 || code === "permission_denied") return "Sua chave não tem permissão para usar este modelo.";
  if (code === "insufficient_quota") return "Sem cota disponível nesta API. Verifique o limite do provedor selecionado.";
  if (status === 429 || code === "rate_limit_exceeded") {
    const wait = /try again in ([\d.]+)s/i.exec(remoteMessage || "");
    if (wait) return `Limite temporário de tokens atingido. Aguardando ${Math.ceil(Number(wait[1]))}s para tentar novamente…`;
    return "Limite temporário da API atingido. Aguarde um pouco e tente novamente.";
  }
  if (status === 404 || code === "model_not_found") return "Modelo não encontrado. Confira o seletor de modelo.";
  if (["content_filter", "content_policy_violation"].includes(code)) return "A API interrompeu a resposta por filtro de conteúdo. Revise os dados do produto.";
  if (code === "context_length_exceeded") return "O produto e o pedido excederam a janela de contexto do modelo. Reduza a descrição.";
  if (code === "max_output_tokens" || code === "max_tokens") return "A resposta atingiu o limite de tokens de saída.";
  if (code === "json_validate_failed") return "O modelo não gerou um JSON válido. O automático tentará outro modelo quando possível.";
  if (status === 400 || ["invalid_request_error", "unsupported_parameter", "unsupported_value"].includes(code)) {
    return "A API rejeitou a configuração. Confira o modelo selecionado.";
  }
  if (status >= 500 || ["server_error", "internal_server_error", "service_unavailable"].includes(code)) {
    return "Falha temporária na API. Tente novamente mais tarde.";
  }
  if (!status) return "A API informou uma falha durante a geração, sem um código reconhecido. Tente novamente.";
  return `Falha na API (HTTP ${status}).`;
}

async function request({apiKey, model, input, instructions, signal, onProgress, fetcher, maxOutputTokens, secrets, attempt, strictJson, onRateLimit}) {
  const controller = new AbortController();
  const gemini = isGemini(model);
  let reason = "";
  const stop = () => controller.abort();
  if (signal?.aborted) throw abortError(signal);
  signal?.addEventListener("abort", stop, {once: true});

  const headerTimer = setTimeout(() => {
    reason = "A API demorou para responder. Tente novamente.";
    controller.abort();
  }, gemini ? 20000 : 12000);

  const totalTimer = setTimeout(() => {
    reason = "A geração excedeu 45 segundos. O automático tentará outro modelo.";
    controller.abort();
  }, 45000);

  try {
    if (gemini) {
      const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel(model))}:generateContent`, {
        method: "POST", signal: controller.signal, credentials: "omit",
        headers: {"Content-Type": "application/json", "x-goog-api-key": apiKey},
        body: JSON.stringify({systemInstruction: {parts: [{text: instructions}]},
          contents: [{role: "user", parts: input.map(m => ({text: typeof m.content === "string" ? m.content : JSON.stringify(m.content)}))}],
          generationConfig: {temperature: 0.4, maxOutputTokens, responseMimeType: "application/json"}})
      });
      clearTimeout(headerTimer);
      const context = {model, maxOutputTokens, attempt, secrets: [apiKey, ...(secrets || [])], httpStatus: response.status,
        requestId: response.headers.get("x-request-id")};
      if (!response.ok) throw apiFailure(response.status, await response.json().catch(() => ({})), {...context, event: "http_error"});
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
      if (!text) throw new GenerationError("O Gemini não retornou texto. Tente novamente.", "empty_response", true, {...context, event: "empty_response"});
      if (typeof onProgress === "function") onProgress(text.length);
      const parsed = parseJsonObject(text);
      if (parsed) return parsed.value;
      throw new GenerationError("O Gemini não retornou o JSON esperado. Tentando novamente…", "json_validate_failed", false, {...context, event: "json_parse_failed", strictJsonApplied: true, responseChars: text.length});
    }
    const messages = [
      {role: "system", content: instructions},
      ...input.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      }))
    ];

    const provider=providerForModel(model);
    const xkiroResolved = provider === "xkiro" ? await resolveXkiroModel(model, apiKey, fetcher, controller.signal) : null;
    const routerModel = provider === "openrouter" ? await openRouterModel(model,apiKey,controller.signal,fetcher) : null;
    const requestModel=routerModel?.id || xkiroResolved?.id || modelForRequest(model);
    const body = provider === "openai"
      ? {model:requestModel, messages, stream: true, max_completion_tokens: maxOutputTokens}
      : {model:requestModel, messages, stream: true, temperature: 0.4, max_tokens: maxOutputTokens};
    // KiraAI e o catálogo gratuito do xKiro misturam modelos com suporte desigual
    // a response_format. O prompt ainda exige JSON e a resposta é validada localmente.
    const strictJsonApplied = Boolean(strictJson && jsonStrictAvailable(provider, routerModel));
    if (strictJsonApplied) body.response_format = {type: "json_object"};
    const effort = reasoningEffortFor(model);
    if (effort) body.reasoning_effort = effort;
    if (routerModel) {
      body.provider = {max_price:{prompt:0,completion:0}};
      if (!routerModel.supported_parameters?.includes("temperature")) delete body.temperature;
      if (routerModel.supported_parameters?.includes("reasoning")) body.reasoning={effort:"low"};
    }

    const endpoint=OPENAI_ENDPOINTS[provider];
    if(!endpoint) throw new GenerationError("Provedor não reconhecido para este modelo.","provider_not_found",false,{model,provider,event:"provider_error"});
    const response = await fetcher(endpoint, {
      method: "POST",
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    clearTimeout(headerTimer);

    // Headers de rate limit. Vale tanto para 200 quanto para 429 — na 429 é
    // ainda mais útil, porque mostra exatamente quanto falta.
    try {
      const info = readRateLimit(response);
      if (info && typeof onRateLimit === "function") onRateLimit(info);
    } catch { /* headers são opcionais */ }

    const diagnosticContext = {
      model: provider === "xkiro" ? `${model} -> ${requestModel}` : model, maxOutputTokens, attempt,
      secrets: [apiKey, ...(secrets || [])],
      httpStatus: response.status,
      requestId: response.headers.get("x-request-id"),
      strictJsonApplied
    };

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw apiFailure(response.status, errorBody, {...diagnosticContext, event: "http_error"});
    }

    return await readResponseStream(response, onProgress, {...diagnosticContext,streamIdleTimeoutMs:15000});
  } catch (error) {
    if (controller.signal.aborted) {
      throw signal?.aborted ? abortError(signal) : new Error(reason || "A conexão foi interrompida.");
    }
    if (error instanceof TypeError) {
      throw new GenerationError("Não foi possível conectar à API. A extensão tentará novamente.", "network_error", true,
        {model, maxOutputTokens, attempt, event: "network_error"});
    }
    throw error;
  } finally {
    clearTimeout(headerTimer);
    clearTimeout(totalTimer);
    signal?.removeEventListener("abort", stop);
  }
}

export async function generateTexts({apiKey, title, description, model, slots, strategy = null, signal, revisionPrompt = "", onStage = () => {}, onRateLimit = () => {}, fetcher = fetch}) {
  const source = JSON.stringify({titulo: title, descricao: description});
  let activeSlots=slots, instructions = generationInstructions(activeSlots, strategy), preserved=null;
  let input = [{role: "user", content: source}];
  if (revisionPrompt) input.push({role: "user", content: String(revisionPrompt).slice(0, 30000)});
  let maxOutputTokens = outputBudget(activeSlots);
  let tokenRetry = false;
  let rateLimitRetry = false;
  let serverRetry = false;
  let strictJson = true;
  let jsonRetry = false;

  let stage = "Gerando textos em português…";

  const attemptLimit = signal?.generationMaxAttempts || MAX_ATTEMPTS;
  for (let attempt = 0; attempt < attemptLimit; attempt++) {
    if (signal?.aborted) throw abortError(signal);
    onStage(`Tentativa ${attempt + 1}/${attemptLimit}: ${stage}`);

    let raw;
    try {
      raw = await request({
        apiKey, model, input, instructions, signal, fetcher,
        maxOutputTokens, strictJson, onRateLimit,
        secrets: [title, description, source, revisionPrompt],
        attempt: attempt + 1
      });
    } catch (error) {
      if (signal?.aborted) throw abortError(signal);

      const isRateLimit = error.diagnostic?.httpStatus === 429 || error.code === "rate_limit_exceeded";
      if (isRateLimit && !signal?.skipRateLimitRetry && !rateLimitRetry && attempt < attemptLimit - 1) {
        rateLimitRetry = true;
        const wait = parseRetryDelay(error.diagnostic?.message);
        maxOutputTokens = Math.max(800, Math.floor(maxOutputTokens * 0.7));
        stage = `Limite temporário da API. Aguardando ${Math.ceil(wait / 1000)}s; próxima tentativa menor…`;
        onStage(`Tentativa ${attempt + 1}/${attemptLimit}: ${stage}`);
        await waitForRetry(wait, signal);
        continue;
      }

      if (error.code === "json_validate_failed" && error.diagnostic?.strictJsonApplied !== false && !jsonRetry && attempt < attemptLimit - 1) {
        jsonRetry = true;
        strictJson = false;
        stage = "O modelo não gerou um JSON válido. Tentando uma recuperação de formato…";
        continue;
      }

      if (error.code === "max_output_tokens" && !tokenRetry && attempt < attemptLimit - 1) {
        tokenRetry = true;
        maxOutputTokens = RECOVERY_OUTPUT_TOKENS;
        stage = "A resposta atingiu o limite. Tentando novamente com mais espaço…";
        continue;
      }

      if (error.retryable && !serverRetry && attempt < attemptLimit - 1) {
        serverRetry = true;
        stage = "Falha temporária de conexão. Aguardando para tentar novamente…";
        onStage(`Tentativa ${attempt + 1}/${attemptLimit}: ${stage}`); await waitForRetry(2000, signal);
        continue;
      }

      throw error;
    }

    if(preserved) raw={texts:{...preserved,...(raw?.texts||{})},notes:[...(raw?.notes||[])]};
    onStage(`Tentativa ${attempt + 1}/${attemptLimit}: validando textos e limites…`);
    const validated = normalizeAndValidate(raw, slots, {title, description});
    if (!validated.issues.length) {
      return {texts: validated.texts, notes: validated.notes};
    }

    if (attempt === attemptLimit - 1) {
      throw new Error(`A geração ainda não passou na validação. Nenhum campo foi preenchido. ${validated.issues.slice(0, 3).join(" ")}`);
    }

    const affected=new Set();
    for(const issue of validated.issues){const key=/^([a-z0-9_]+):/.exec(issue)?.[1];if(key)affected.add(key)}
    for(const key of [...affected]){if(key.endsWith("_question"))affected.add(key.replace("_question","_answer"));if(key.endsWith("_answer"))affected.add(key.replace("_answer","_question"));if(key.endsWith("_name"))affected.add(key.replace("_name","_value"));if(key.endsWith("_value"))affected.add(key.replace("_value","_name"))}
    activeSlots=slots.filter(slot=>affected.has(slot.key));
    if(!activeSlots.length)activeSlots=slots;
    preserved=Object.fromEntries(Object.entries(validated.texts).filter(([key])=>!affected.has(key)));
    instructions=generationInstructions(activeSlots, strategy);
    maxOutputTokens=outputBudget(activeSlots);
    stage = `Corrigindo apenas ${activeSlots.length} campo(s) com problema…`;
    input = [
      {role: "user", content: source},
      ...(revisionPrompt ? [{role: "user", content: String(revisionPrompt).slice(0, 30000)}] : []),
      {role: "user", content:
        `Retorne apenas os campos solicitados no schema, corrigindo estes problemas:\n` +
        `${validated.issues.join("\n")}\n\n` +
        `Não repita os demais campos; eles já foram preservados.`}
    ];
  }
}

// Geração JSON genérica usada pelo planejamento. Mantém as mesmas proteções,
// diagnóstico sanitizado, cancelamento e recuperação do fluxo principal.
export async function generateStructured({apiKey, title, description, model, instructions, signal,
  validate = raw => ({value: raw, issues: []}), onStage = () => {}, onRateLimit = () => {}, fetcher = fetch,
  initialStage = "Analisando o produto e criando o planejamento…", initialOutputTokens = INITIAL_OUTPUT_TOKENS}) {
  const source = JSON.stringify({titulo: title, descricao: description});
  let input = [{role: "user", content: source}], strictJson = true;
  let maxOutputTokens = Math.max(700, Math.min(Number(initialOutputTokens) || INITIAL_OUTPUT_TOKENS, RECOVERY_OUTPUT_TOKENS));
  let rateLimitRetry = false, jsonRetry = false, tokenRetry = false, serverRetry = false;
  let stage = initialStage;
  const attemptLimit = signal?.generationMaxAttempts || MAX_ATTEMPTS;
  for (let attempt = 0; attempt < attemptLimit; attempt++) {
    if (signal?.aborted) throw abortError(signal);
    onStage(`Tentativa ${attempt + 1}/${attemptLimit}: ${stage}`);
    let raw;
    try {
      raw = await request({apiKey, model, input, instructions, signal, fetcher, maxOutputTokens,
        strictJson, onRateLimit, secrets: [title, description, source], attempt: attempt + 1});
    } catch (error) {
      if (signal?.aborted) throw abortError(signal);
      const rateLimited = error.diagnostic?.httpStatus === 429 || error.code === "rate_limit_exceeded";
      if (rateLimited && !signal?.skipRateLimitRetry && !rateLimitRetry && attempt < attemptLimit - 1) {
        rateLimitRetry = true;
        const wait = parseRetryDelay(error.diagnostic?.message);
        maxOutputTokens = Math.max(800, Math.floor(maxOutputTokens * 0.7));
        stage = `Limite temporário da API. Aguardando ${Math.ceil(wait / 1000)}s…`; onStage(`Tentativa ${attempt + 1}/${attemptLimit}: ${stage}`);
        await waitForRetry(wait, signal); continue;
      }
      if (error.code === "json_validate_failed" && error.diagnostic?.strictJsonApplied !== false && !jsonRetry && attempt < attemptLimit - 1) {
        jsonRetry = true; strictJson = false; stage = "Corrigindo o formato do planejamento…"; continue;
      }
      if (error.code === "max_output_tokens" && !tokenRetry && attempt < attemptLimit - 1) {
        tokenRetry = true; maxOutputTokens = RECOVERY_OUTPUT_TOKENS; stage = "Continuando com mais espaço para o planejamento…"; continue;
      }
      if (error.retryable && !serverRetry && attempt < attemptLimit - 1) {
        serverRetry = true; stage = "Falha temporária. Aguardando para tentar o planejamento novamente…";
        onStage(`Tentativa ${attempt + 1}/${attemptLimit}: ${stage}`); await waitForRetry(2000, signal); continue;
      }
      throw error;
    }
    onStage(`Tentativa ${attempt + 1}/${attemptLimit}: validando resposta estruturada…`);
    const checked = validate(raw);
    if (!checked.issues?.length) return checked.value;
    if (attempt === attemptLimit - 1) throw new Error(`O planejamento não passou na validação. ${checked.issues.slice(0, 3).join(" ")}`);
    stage = "Revisando o planejamento e removendo informações não comprovadas…";
    input = [{role: "user", content: source}, {role: "user", content:
      `Refaça o JSON completo e corrija estes problemas:\n${checked.issues.join("\n")}\nUse somente fatos presentes nos dados do produto.`}];
  }
}
