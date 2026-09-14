// Executado apenas na página pública escolhida pelo usuário.
export function captureProductPage() {
  const clean = value => String(value || "").replace(/\s+/g," ").trim();
  if (document.querySelector('form[action*="validateCaptcha"], #captchacharacters, input[name="cvf_captcha_input"]'))
    throw new Error("Conclua a verificação da Amazon nesta aba antes de capturar.");
  const title = clean(document.querySelector('#productTitle')?.textContent);
  if (!title) throw new Error("O produto ainda não está visível. Aguarde a página carregar ou conclua a verificação da Amazon.");
  const bullets = [...document.querySelectorAll('#feature-bullets li .a-list-item')].map(node=>clean(node.textContent)).filter(Boolean);
  const details = [...document.querySelectorAll('#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr')]
    .map(row=>clean(row.textContent)).filter(Boolean);
  const description = clean(document.querySelector('#productDescription')?.textContent);
  return {url:location.href, title:title.slice(0,1000), description:[...new Set([...bullets,...details,description].filter(Boolean))].join('\n').slice(0,18000)};
}

export function matchesProductURL(url, asin) {
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:' && parsed.hostname==='www.amazon.com.br' &&
      new RegExp(`/(?:dp|gp/product)/${asin}(?:/|$)`, 'i').test(parsed.pathname) && /^B[A-Z0-9]{9}$/.test(asin);
  } catch { return false; }
}
