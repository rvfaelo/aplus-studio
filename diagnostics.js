// Guarda apenas os campos necessários para entender um erro. O objeto completo
// da API pode conter entrada/saída do produto e nunca é copiado para o relatório.
export function errorDiagnostic(payload = {}, context = {}) {
  const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const item = object(payload), response = object(item.response);
  const remote = response.error ?? item.error ?? item;
  const detail = object(remote);
  const secrets = (context.secrets || []).filter(value => typeof value === "string" && value.length)
    .sort((a, b) => b.length - a.length);

  const clean = (value, limit = 160) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    let text = String(value);
    // Remove a chave inteira, dados de entrada conhecidos, variantes escapadas
    // e credenciais que um erro remoto possa ter refletido parcialmente.
    for (const secret of secrets) {
      const variants = [secret, JSON.stringify(secret).slice(1, -1)];
      for (const variant of variants) text = text.split(variant).join("[omitido]");
    }
    text = text.replace(/Bearer\s+[^\s,"'<>]+/gi, "Bearer [omitido]")
      .replace(/\bsk[-_][A-Za-z0-9_.*-]+/g, "[chave omitida]")
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ").trim();
    return text ? text.slice(0, limit) : null;
  };
  const positiveInteger = value => Number.isInteger(value) && value > 0 ? value : null;
  return {
    model: clean(context.model, 100),
    httpStatus: positiveInteger(context.httpStatus),
    event: clean(context.event || item.type, 100),
    // code pode legitimamente ser null. message continua sendo preservada.
    code: clean(detail.code ?? item.code),
    type: clean(detail.type === "error" || /^response\./.test(detail.type || "") ? null : detail.type),
    param: clean(detail.param ?? item.param),
    message: clean(typeof remote === "string" ? remote : detail.message, 1200),
    incompleteReason: clean(response.incomplete_details?.reason),
    requestId: clean(context.requestId || item.request_id),
    responseId: clean(response.id || context.responseId || item.response_id),
    attempt: positiveInteger(context.attempt),
    maxOutputTokens: positiveInteger(context.maxOutputTokens)
  };
}
