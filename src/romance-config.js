const fallbackName = '亲爱的';
const messageBody = '今晚的星光送给你，往后每一个平凡的日子，我都想和你一起。';

export function createRomanceConfig(input = {}) {
  const name = typeof input?.recipientName === 'string' ? input.recipientName.trim() : '';
  const recipientName = name || fallbackName;
  return {
    recipientName,
    messageBody,
    message: recipientName + '，' + messageBody,
    title: '灵绘 · 把星光送给' + recipientName,
    revealHint: '把心里的话，送给' + recipientName,
    fireworksHint: '为' + recipientName + '，点亮漫天烟花',
  };
}

export async function loadRomanceConfig(url, fetcher = globalThis.fetch) {
  try {
    const response = await fetcher(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Config request failed: ' + response.status);
    const input = await response.json();
    if (typeof input?.recipientName !== 'string' || !input.recipientName.trim()) {
      throw new Error('recipientName must be a non-empty string');
    }
    return { config: createRomanceConfig(input), error: null };
  } catch {
    return {
      config: createRomanceConfig(),
      error: '姓名配置读取失败，暂用“亲爱的”。请检查 config.json 的 JSON 格式，以及 recipientName 是否为非空字符串；保存后刷新页面。',
    };
  }
}
