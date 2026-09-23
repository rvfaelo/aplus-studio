// Canal exclusivo do painel, sem respostas de outras páginas da extensão.
export function connectPanel(runtime) {
  let port = null, sequence = 0;
  const pending = new Map();
  function connection() {
    if (port) return port;
    const opened = runtime.connect({name: "aplus-panel-v1"});
    port = opened;
    opened.onMessage.addListener(message => {
      const request = pending.get(message?.requestId);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.requestId);
      if (message.ok) request.resolve(message.data);
      else request.reject(new Error(message.error || "O serviço recusou o comando."));
    });
    opened.onDisconnect.addListener(() => {
      // Ler lastError evita erro não tratado; nunca incluir payload/chave no diagnóstico.
      const failed = Boolean(runtime.lastError);
      if (port !== opened) return;
      port = null;
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(`Conexão do painel encerrada${failed ? " pelo Chrome" : ""}. Recarregue a extensão e reabra o painel pelo popup.`));
      }
      pending.clear();
    });
    return opened;
  }
  return (action, data = {}) => new Promise((resolve, reject) => {
    const requestId = ++sequence;
    try {
      const opened = connection();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Sem resposta ao comando ${action}. Confira a versão no painel e recarregue a extensão. A operação pode ainda estar em andamento.`));
      }, ["projectPlan", "projectImageBriefs", "projectRegenerate", "projectFixRepetitions", "listingAnalyze", "listingOptimize", "marketGenerate", "testModels", "testAllModels", "projectFill", "projectPrepareModules"].includes(action) ? 210000 : 30000);
      pending.set(requestId, {resolve, reject, timer});
      opened.postMessage({...data, channel: "aplus-extension", action, requestId});
    } catch {
      clearTimeout(pending.get(requestId)?.timer); pending.delete(requestId);
      reject(new Error("Painel desatualizado ou desconectado. Feche esta aba, recarregue a extensão e abra o painel pelo popup."));
    }
  });
}

export function isPanelSender(sender, runtime) {
  if (sender?.id !== runtime.id) return false;
  try {
    const url = new URL(sender.url);
    url.search = ""; url.hash = "";
    return url.href === runtime.getURL("dashboard.html");
  } catch { return false; }
}
