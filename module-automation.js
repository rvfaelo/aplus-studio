(() => {
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();

  const TARGET_SEQUENCE = Object.freeze(["full", "four", "two", "faq", "full", "specs"]);

  function kindForLabel(value) {
    const label = normalize(value);
    if (!label) return null;
    if (/^(?:\+\s*)?(?:adicionar modulo|add module)$/.test(label)) return "add_module";
    if (/^(?:\+\s*)?(?:adicionar pergunta|add question)$/.test(label)) return "add_question";
    if (/^(?:\+\s*)?(?:adicionar especificacao|add specification)$/.test(label)) return "add_specification";
    if (/premium.*(?:quatro imagens|four(?: column)? images?)/.test(label)) return "four";
    if (/premium.*(?:duas imagens|two(?: column)? images?|dual images?)/.test(label)) return "two";
    if (/premium.*(?:perguntas e respostas|questions? and answers?|faq)/.test(label)) return "faq";
    if (/(?:especificacoes tecnicas.*premium|premium.*technical specifications?|premium.*tech specs)/.test(label)) return "specs";
    if (/premium.*(?:imagem completa|full(?: background| width)? image)/.test(label)) return "full";
    return null;
  }

  function eventLabel(event) {
    const values = [event?.control, ...(event?.composedPath || [])];
    return values.flatMap(item => [item?.label, item?.ariaLabel, item?.title]).find(value => kindForLabel(value)) || "";
  }

  const countsSignature = counts => JSON.stringify(["full", "four", "two", "faq", "specs"].map(key => Number(counts?.[key] || 0)));

  function structuralChange(event) {
    const before = countsSignature(event?.before?.moduleCounts);
    return (event?.observations || []).some(item => countsSignature(item?.moduleCounts) !== before);
  }

  function filterRecorderEvents(events = []) {
    const kept = [], ignored = [];
    for (const event of events) {
      if (kindForLabel(eventLabel(event)) || structuralChange(event)) kept.push({...event, sequence: kept.length + 1});
      else ignored.push(event);
    }
    return {events: kept, ignored};
  }

  function isTargetPrefix(sequence = [], target = TARGET_SEQUENCE) {
    return sequence.length <= target.length && sequence.every((value, index) => value === target[index]);
  }

  globalThis.APlusModuleAutomation = Object.freeze({
    TARGET_SEQUENCE,
    normalize,
    kindForLabel,
    eventLabel,
    structuralChange,
    filterRecorderEvents,
    isTargetPrefix
  });
})();
