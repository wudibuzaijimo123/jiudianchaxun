import { LlmConfig } from '../types/hotel';

function extractJsonFromText(rawText: string): any {
  const cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch {
        // fallback to object scan
      }
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch && !cleaned.startsWith('[')) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // ignore
      }
    }

    const recovered: any[] = [];
    let depth = 0;
    let startIdx = -1;
    let inStr = false;
    let escape = false;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && startIdx >= 0) {
          try {
            const obj = JSON.parse(cleaned.slice(startIdx, i + 1));
            if (obj && obj.id) recovered.push(obj);
          } catch {
            // ignore
          }
          startIdx = -1;
        }
      }
    }
    if (recovered.length > 0) return recovered;
  }
  return null;
}

/**
 * 判断当前是否运行在独立打包的 iOS IPA / Android APK 容器内
 */
export function isNativePackagedApp(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  return proto === 'capacitor:' || proto === 'ionic:' || proto === 'file:';
}

export function resolveApiUrl(path: string, serverBaseUrl = ''): string {
  const cleanServer = serverBaseUrl.trim().replace(/\/+$/, '');
  if (cleanServer) {
    return `${cleanServer}${path}`;
  }
  return path;
}

/**
 * 纯手机端侧直连大模型（当用户直接安装独立 IPA 且未挂后端服务器时，在手机内直接请求 DeepSeek/硅基流动/通义千问 API）
 */
export async function directClientBatchAiPrices(
  llm: LlmConfig,
  city: string,
  centerName: string,
  checkIn: string,
  checkOut: string,
  hotels: { id: string; name: string; address: string; categoryLabel: string }[],
  knownPrices: { name: string; price: number | null }[]
): Promise<any[]> {
  const cleanBase = (llm.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const knownRef =
    knownPrices.length > 0
      ? knownPrices
          .slice(0, 6)
          .map((k) => `${k.name}: ¥${k.price}`)
          .join('；')
      : '暂无';

  const listStr = hotels
    .map(
      (h, i) =>
        `${i + 1}. id="${h.id}" | 店名="${h.name}" | 档次="${h.categoryLabel}" | 地址="${h.address}"`
    )
    .join('\n');

  const prompt = `请为「${city} ${centerName}」周边的以下酒店评估入住日期（${checkIn} 至 ${checkOut}）的每晚人民币参考起步价与主力客房情况（同街区已知实价参照：${knownRef}）：
${listStr}

严格返回纯 JSON 数组：
[
  {
    "id": "原样酒店id",
    "minPrice": 95,
    "priceRange": "¥85-125",
    "vacancyHint": "有房",
    "basis": "周边行情估算",
    "rooms": [
      { "name": "标准大床房", "spec": "独立卫浴", "status": "有房", "leftText": "可订", "price": 95 },
      { "name": "标准双床房", "spec": "双人入住", "status": "有房", "leftText": "可订", "price": 115 }
    ]
  }
]`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: llm.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: '只输出合法的纯 JSON 数组，禁止任何多余解释。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.15,
      max_tokens: 2800,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  }
  const parsed = extractJsonFromText(String(data?.choices?.[0]?.message?.content || ''));
  return Array.isArray(parsed) ? parsed : [];
}

export async function directClientDetailAiRooms(
  llm: LlmConfig,
  hotelName: string,
  city: string,
  address: string,
  categoryLabel: string,
  checkIn: string,
  checkOut: string,
  fallbackPrice: number | null
): Promise<any> {
  const cleanBase = (llm.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const prompt = `请针对中国「${city}」的「${hotelName}」（地址：${address}，档次：${categoryLabel}，入住：${checkIn} 至 ${checkOut}，参考价：${
    fallbackPrice ? `¥${fallbackPrice}` : '待核定'
  }），输出结构化客房情况 JSON：
{
  "lowestPrice": 95,
  "priceRange": "¥85 - ¥135",
  "vacancyStatus": "日常房源充足",
  "douyinGroupBuy": "建议点上方按钮跳转手机美团/抖音查看个人神券到手价",
  "highlights": "位置便利，出行方便",
  "pitfalls": "建议确认房间窗户朝向及隔音",
  "rooms": [
    { "roomName": "特惠大床房", "spec": "1.5m床 · 独立卫浴", "price": 95, "tag": "底价优选" },
    { "roomName": "标准双床房", "spec": "1.2m×2床 · 有窗", "price": 115, "tag": "双人推荐" }
  ]
}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: llm.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: '只输出合法的纯 JSON 对象。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.15,
      max_tokens: 1200,
    }),
  });
  const data = await resp.json();
  return extractJsonFromText(String(data?.choices?.[0]?.message?.content || ''));
}
