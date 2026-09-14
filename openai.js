import {buildSchema, generationInstructions, normalizeAndValidate} from "./shared.js";
import {errorDiagnostic} from "./diagnostics.js";
import {providerForModel, modelForRequest} from "./providers.js";

const OPENAI_ENDPOINTS = Object.freeze({
  groq: "https://api.groq.com/openai/v1/chat/completions",
  kira: "https://kiraai.vn/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions"
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
  return /^openai\/gpt-oss/.test(model) ? "low" : undefined;
}

function isGemini(model) { return String(model).startsWith("gemini/"); }
function geminiModel(model) { return String(model).replace(/^gemini\//, ""); }
function outputBudget(slots) { return Math.min(INITIAL_OUTPUT_TOKENS, Math.max(700, Math.ceil(slots.reduce((n,s)=>n+s.limit,0)/4)+350)); }

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
      const {value, done} = await reader.read();
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

  let cleaned = fullContent.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new GenerationError(
      "A API não retornou o JSON esperado. Tente novamente ou escolha outro modelo.",
      "json_validate_failed", false, {...diagnosticContext, event: "json_parse_failed"}
    );
  }
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
  if (code === "json_validate_failed") return "O modelo não gerou um JSON válido. Tentando novamente sem o validador estrito…";
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
  if (signal?.aborted) throw new Error("Operação cancelada.");
  signal?.addEventListener("abort", stop, {once: true});

  const headerTimer = setTimeout(() => {
    reason = "A API demorou para responder. Tente novamente.";
    controller.abort();
  }, gemini ? 90000 : 25000);

  const totalTimer = setTimeout(() => {
    reason = gemini ? "A geração no Gemini excedeu 4 minutos. Tente novamente." : "A geração excedeu 120 segundos. Tente novamente ou escolha outro modelo.";
    controller.abort();
  }, gemini ? 240000 : 120000);

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
      try { return JSON.parse(text); } catch { throw new GenerationError("O Gemini não retornou o JSON esperado. Tentando novamente…", "json_validate_failed", false, {...context, event: "json_parse_failed"}); }
    }
    const messages = [
      {role: "system", content: instructions},
      ...input.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      }))
    ];

    const provider=providerForModel(model);
    const requestModel=modelForRequest(model);
    const body = {model:requestModel, messages, stream: true, temperature: 0.4, max_tokens: maxOutputTokens};
    // KiraAI é compatível com o formato OpenAI, mas alguns modelos gratuitos
    // não anunciam suporte a response_format. O prompt ainda exige JSON e a
    // resposta é validada localmente antes de preencher qualquer campo.
    if (strictJson && provider!=="kira") body.response_format = {type: "json_object"};
    const effort = reasoningEffortFor(model);
    if (effort) body.reasoning_effort = effort;

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
      model, maxOutputTokens, attempt,
      secrets: [apiKey, ...(secrets || [])],
      httpStatus: response.status,
      requestId: response.headers.get("x-request-id")
    };

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw apiFailure(response.status, errorBody, {...diagnosticContext, event: "http_error"});
    }

    return await readResponseStream(response, onProgress, diagnosticContext);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(signal?.aborted ? "Operação cancelada." : reason || "A conexão foi interrompida.");
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

export async function generateTexts({apiKey, title, description, model, slots, signal, onStage = () => {}, onRateLimit = () => {}, fetcher = fetch}) {
  const source = JSON.stringify({titulo: title, descricao: description});
  let activeSlots=slots, instructions = generationInstructions(activeSlots), preserved=null;
  let input = [{role: "user", content: source}];
  let maxOutputTokens = outputBudget(activeSlots);
  let tokenRetry = false;
  let rateLimitRetry = false;
  let serverRetry = false;
  let strictJson = true;
  let jsonRetry = false;

  let stage = "Gerando textos em português…";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new Error("Operação cancelada.");
    onStage(stage);

    let raw;
    try {
      raw = await request({
        apiKey, model, input, instructions, signal, fetcher,
        maxOutputTokens, strictJson, onRateLimit,
        secrets: [title, description, source],
        attempt: attempt + 1
      });
    } catch (error) {
      if (signal?.aborted) throw new Error("Operação cancelada.");

      const isRateLimit = error.diagnostic?.httpStatus === 429 || error.code === "rate_limit_exceeded";
      if (isRateLimit && !rateLimitRetry && attempt < MAX_ATTEMPTS - 1) {
        rateLimitRetry = true;
        const wait = parseRetryDelay(error.diagnostic?.message);
        maxOutputTokens = Math.max(800, Math.floor(maxOutputTokens * 0.7));
        stage = `Limite temporário da API. Aguardando ${Math.ceil(wait / 1000)}s; próxima tentativa menor…`;
        onStage(stage);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (error.code === "json_validate_failed" && !jsonRetry && attempt < MAX_ATTEMPTS - 1) {
        jsonRetry = true;
        strictJson = false;
        stage = "O modelo não gerou um JSON válido. Tentando novamente sem o validador estrito…";
        continue;
      }

      if (error.code === "max_output_tokens" && !tokenRetry && attempt < MAX_ATTEMPTS - 1) {
        tokenRetry = true;
        maxOutputTokens = RECOVERY_OUTPUT_TOKENS;
        stage = "A resposta atingiu o limite. Tentando novamente com mais espaço…";
        continue;
      }

      if (error.retryable && !serverRetry && attempt < MAX_ATTEMPTS - 1) {
        serverRetry = true;
        stage = "Falha temporária de conexão. Aguardando para tentar novamente…";
        onStage(stage); await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      throw error;
    }

    if(preserved) raw={texts:{...preserved,...(raw?.texts||{})},notes:[...(raw?.notes||[])]};
    const validated = normalizeAndValidate(raw, slots, {title, description});
    if (!validated.issues.length) {
      return {texts: validated.texts, notes: validated.notes};
    }

    if (attempt === MAX_ATTEMPTS - 1) {
      throw new Error(`A geração ainda não passou na validação. Nenhum campo foi preenchido. ${validated.issues.slice(0, 3).join(" ")}`);
    }

    const affected=new Set();
    for(const issue of validated.issues){const key=/^([a-z0-9_]+):/.exec(issue)?.[1];if(key)affected.add(key)}
    for(const key of [...affected]){if(key.endsWith("_question"))affected.add(key.replace("_question","_answer"));if(key.endsWith("_answer"))affected.add(key.replace("_answer","_question"));if(key.endsWith("_name"))affected.add(key.replace("_name","_value"));if(key.endsWith("_value"))affected.add(key.replace("_value","_name"))}
    activeSlots=slots.filter(slot=>affected.has(slot.key));
    if(!activeSlots.length)activeSlots=slots;
    preserved=Object.fromEntries(Object.entries(validated.texts).filter(([key])=>!affected.has(key)));
    instructions=generationInstructions(activeSlots);
    maxOutputTokens=outputBudget(activeSlots);
    stage = `Corrigindo apenas ${activeSlots.length} campo(s) com problema…`;
    input = [
      {role: "user", content: source},
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
  validate = raw => ({value: raw, issues: []}), onStage = () => {}, onRateLimit = () => {}, fetcher = fetch}) {
  const source = JSON.stringify({titulo: title, descricao: description});
  let input = [{role: "user", content: source}], strictJson = true;
  let maxOutputTokens = INITIAL_OUTPUT_TOKENS, rateLimitRetry = false, jsonRetry = false, tokenRetry = false, serverRetry = false;
  let stage = "Analisando o produto e criando o planejamento…";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new Error("Operação cancelada.");
    onStage(stage);
    let raw;
    try {
      raw = await request({apiKey, model, input, instructions, signal, fetcher, maxOutputTokens,
        strictJson, onRateLimit, secrets: [title, description, source], attempt: attempt + 1});
    } catch (error) {
      if (signal?.aborted) throw new Error("Operação cancelada.");
      const rateLimited = error.diagnostic?.httpStatus === 429 || error.code === "rate_limit_exceeded";
      if (rateLimited && !rateLimitRetry && attempt < MAX_ATTEMPTS - 1) {
        rateLimitRetry = true;
        const wait = parseRetryDelay(error.diagnostic?.message);
        maxOutputTokens = Math.max(800, Math.floor(maxOutputTokens * 0.7));
        stage = `Limite temporário da API. Aguardando ${Math.ceil(wait / 1000)}s…`; onStage(stage);
        await new Promise(resolve => setTimeout(resolve, wait)); continue;
      }
      if (error.code === "json_validate_failed" && !jsonRetry && attempt < MAX_ATTEMPTS - 1) {
        jsonRetry = true; strictJson = false; stage = "Corrigindo o formato do planejamento…"; continue;
      }
      if (error.code === "max_output_tokens" && !tokenRetry && attempt < MAX_ATTEMPTS - 1) {
        tokenRetry = true; maxOutputTokens = RECOVERY_OUTPUT_TOKENS; stage = "Continuando com mais espaço para o planejamento…"; continue;
      }
      if (error.retryable && !serverRetry && attempt < MAX_ATTEMPTS - 1) {
        serverRetry = true; stage = "Falha temporária. Aguardando para tentar o planejamento novamente…";
        onStage(stage); await new Promise(resolve => setTimeout(resolve, 2000)); continue;
      }
      throw error;
    }
    const checked = validate(raw);
    if (!checked.issues?.length) return checked.value;
    if (attempt === MAX_ATTEMPTS - 1) throw new Error(`O planejamento não passou na validação. ${checked.issues.slice(0, 3).join(" ")}`);
    stage = "Revisando o planejamento e removendo informações não comprovadas…";
    input = [{role: "user", content: source}, {role: "user", content:
      `Refaça o JSON completo e corrija estes problemas:\n${checked.issues.join("\n")}\nUse somente fatos presentes nos dados do produto.`}];
  }
}
