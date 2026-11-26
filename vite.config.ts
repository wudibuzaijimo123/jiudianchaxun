import os from 'node:os';
import { URL } from 'node:url';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface CacheEntry {
  status: number;
  body: string;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 25 * 60 * 1000;

// 仅保存在当前运行进程内存中的局域网手机同步配置（绝不写入磁盘或仓库，供同一Wi-Fi手机免输Key同步）
let lanMemorySyncState: Record<string, any> = {};
const lanHotelTargets = new Map<string, any>();

function getCached(key: string): CacheEntry | null {
  const hit = apiCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return hit;
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf-8');
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function extractJsonFromLlmText(rawText: string): any {
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
        // 若数组末尾被截断，逐个抢救已闭合的顶层酒店对象
      }
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch && !cleaned.trim().startsWith('[')) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // ignore
      }
    }

    // 截断容错恢复：从数组中扫描所有完整闭合的顶层 { ... } 对象
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
          const candidate = cleaned.slice(startIdx, i + 1);
          try {
            const obj = JSON.parse(candidate);
            if (obj && obj.id) recovered.push(obj);
          } catch {
            // ignore broken fragment
          }
          startIdx = -1;
        }
      }
    }
    if (recovered.length > 0) return recovered;
  }
  return null;
}

async function callOpenAiCompatibleLlm(
  llm: { apiKey: string; baseUrl?: string; model?: string },
  prompt: string,
  maxTokens = 1400
): Promise<string> {
  const cleanBase = String(llm.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: llm.model || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            '你是中国本地酒店房价检索与数据分析引擎。只输出合法的纯 JSON，不要输出任何 Markdown 解释文字。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.15,
      max_tokens: maxTokens,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `LLM HTTP ${resp.status}`);
  }
  return String(data?.choices?.[0]?.message?.content || '');
}

async function searchCnWebSnippets(query: string, serpApiKey: string): Promise<any[]> {
  if (!serpApiKey.trim()) return [];
  const cacheKey = `serp_web:${query}`;
  const cached = getCached(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.body);
    } catch {
      return [];
    }
  }

  try {
    const target = new URL('https://serpapi.com/search.json');
    target.searchParams.set('engine', 'google');
    target.searchParams.set('api_key', serpApiKey.trim());
    target.searchParams.set('q', query);
    target.searchParams.set('hl', 'zh-CN');
    target.searchParams.set('gl', 'hk');
    target.searchParams.set('num', '12');

    const r = await fetch(target.toString());
    const data = await r.json();
    const list = Array.isArray(data.organic_results) ? data.organic_results : [];
    if (r.ok && list.length > 0) {
      apiCache.set(cacheKey, {
        status: 200,
        body: JSON.stringify(list),
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }
    return list;
  } catch {
    return [];
  }
}

function backendProxyPlugin(): Plugin {
  return {
    name: 'local-api-proxy',
    configureServer(server) {
      // 1. 获取本机局域网真实 Wi-Fi IP
      server.middlewares.use('/api/lan-info', (_req, res) => {
        const nets = os.networkInterfaces();
        const candidates: { ip: string; score: number }[] = [];

        for (const [ifaceName, addrs] of Object.entries(nets)) {
          if (!addrs) continue;
          const isVirtual =
            /vmware|vbox|virtual|wsl|vethernet|hyper-v|clash|mihomo|tun|tap|loopback/i.test(
              ifaceName
            );

          for (const addr of addrs) {
            if (addr.family !== 'IPv4' || addr.internal) continue;
            const ip = addr.address;
            if (ip.startsWith('198.18.') || ip.startsWith('169.254.')) continue;

            let score = isVirtual ? 10 : 100;
            if (ip.startsWith('192.168.')) score += 30;
            else if (ip.startsWith('10.')) score += 20;
            if (ip.endsWith('.1')) score -= 50;

            candidates.push({ ip, score });
          }
        }

        const addrInfo = server.httpServer?.address();
        const actualPort =
          addrInfo && typeof addrInfo === 'object' && addrInfo.port
            ? addrInfo.port
            : server.config.server.port || 5173;

        candidates.sort((a, b) => b.score - a.score);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            ips: candidates.map((c) => c.ip),
            port: actualPort,
          })
        );
      });

      // 2. SerpApi Google Hotels 实时空房与报价代理（含本地缓存）
      server.middlewares.use('/api/serp-hotels', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', 'http://localhost');
          const apiKey = reqUrl.searchParams.get('api_key') || '';
          const q = reqUrl.searchParams.get('q') || '';
          const checkIn = reqUrl.searchParams.get('check_in_date') || '';
          const checkOut = reqUrl.searchParams.get('check_out_date') || '';
          const propertyToken = reqUrl.searchParams.get('property_token') || '';

          if (!apiKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: '缺少 SerpApi Key' }));
            return;
          }

          const cacheKey = `hotels:${q}:${propertyToken}:${checkIn}:${checkOut}`;
          const cached = getCached(cacheKey);
          if (cached) {
            res.statusCode = cached.status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(cached.body);
            return;
          }

          const target = new URL('https://serpapi.com/search.json');
          target.searchParams.set('engine', 'google_hotels');
          target.searchParams.set('api_key', apiKey);
          target.searchParams.set('currency', 'CNY');
          target.searchParams.set('gl', 'hk');
          target.searchParams.set('hl', 'zh-CN');
          target.searchParams.set('adults', '2');
          if (checkIn) target.searchParams.set('check_in_date', checkIn);
          if (checkOut) target.searchParams.set('check_out_date', checkOut);

          if (propertyToken) {
            target.searchParams.set('property_token', propertyToken);
          } else {
            target.searchParams.set('q', q);
          }

          const upstream = await fetch(target.toString());
          const text = await upstream.text();
          if (upstream.status === 200) {
            apiCache.set(cacheKey, {
              status: 200,
              body: text,
              expiresAt: Date.now() + CACHE_TTL_MS,
            });
          }
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(text);
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err?.message || '上游实时房价服务连接失败' }));
        }
      });

      // 3. 国内全网酒店情报聚合（抖音 + 小红书 + 携程/同程/去哪儿公开收录）
      server.middlewares.use('/api/cn-hotel-intel', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', 'http://localhost');
          const apiKey = reqUrl.searchParams.get('api_key') || '';
          const hotel = (reqUrl.searchParams.get('hotel') || '').trim();
          const city = (reqUrl.searchParams.get('city') || '').replace(/市$/, '').trim();

          if (!apiKey || !hotel) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: '参数不完整' }));
            return;
          }

          const cacheKey = `cn_intel:${city}:${hotel}`;
          const cached = getCached(cacheKey);
          if (cached) {
            res.statusCode = cached.status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(cached.body);
            return;
          }

          const query = `${city} ${hotel} (携程 OR 同程 OR 去哪儿 OR 抖音 OR 小红书 OR 团购 OR 价格)`;
          const organic = await searchCnWebSnippets(query, apiKey);

          const items: any[] = [];
          const extractedPrices: number[] = [];
          const metaFacts = new Set<string>();

          for (const row of organic) {
            const link = String(row.link || '');
            const title = String(row.title || '');
            const snippet = String(row.snippet || '');
            const combined = `${title} ${snippet}`;

            let platform: 'douyin' | 'xiaohongshu' | 'ctrip' | 'tongcheng' | 'qunar' | 'meituan' | 'web' = 'web';
            let platformLabel = '全网收录';

            if (/douyin\.com|iesdouyin\.com/i.test(link) || /抖音/.test(title)) {
              platform = 'douyin';
              platformLabel = '抖音实拍/团购';
            } else if (/xiaohongshu\.com/i.test(link) || /小红书/.test(title)) {
              platform = 'xiaohongshu';
              platformLabel = '小红书避坑笔记';
            } else if (/ctrip\.com/i.test(link) || /携程/.test(title)) {
              platform = 'ctrip';
              platformLabel = '携程国内站';
            } else if (/ly\.com|elong\.com/i.test(link) || /同程|艺龙/.test(title)) {
              platform = 'tongcheng';
              platformLabel = '同程艺龙';
            } else if (/qunar\.com/i.test(link) || /去哪儿/.test(title)) {
              platform = 'qunar';
              platformLabel = '去哪儿网';
            } else if (/meituan\.com|dianping\.com/i.test(link) || /美团|大众点评/.test(title)) {
              platform = 'meituan';
              platformLabel = '美团/点评收录';
            }

            const priceMatches = combined.matchAll(/(?:¥|￥)\s*(\d{2,4})|(\d{2,4})\s*元(?:\/晚|起)?/g);
            for (const m of priceMatches) {
              const val = Number(m[1] || m[2]);
              if (val >= 40 && val <= 3500) {
                extractedPrices.push(val);
              }
            }

            const openYear = combined.match(/(20\d{2}年开业|20\d{2}年装修)/);
            if (openYear) metaFacts.add(openYear[1]);
            const roomCnt = combined.match(/(\d{1,3}间房|\d{1,3}间客房)/);
            if (roomCnt) metaFacts.add(roomCnt[1]);
            const cnScore = combined.match(/([34]\.\d|5\.0)\s*分/);
            if (cnScore) metaFacts.add(`国内评分 ${cnScore[1]}分`);

            items.push({
              platform,
              platformLabel,
              title: title.replace(/\s*[-|_].*$/, '').trim() || title,
              snippet,
              link,
              date: row.date || '',
            });
          }

          const payload = JSON.stringify({
            items,
            minExtractedPrice:
              extractedPrices.length > 0 ? Math.min(...extractedPrices) : null,
            metaFacts: Array.from(metaFacts).slice(0, 5),
          });

          apiCache.set(cacheKey, {
            status: 200,
            body: payload,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(payload);
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err?.message || '国内情报检索失败' }));
        }
      });

      // 4. 核心新增：AI 批量全网检索周边酒店房价与房型摘要，直接回填打印到主列表卡片和地图气泡上！
      server.middlewares.use('/api/ai-batch-prices', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        try {
          const body = await readJsonBody(req);
          const { llm, serpApiKey, city, centerName, checkIn, checkOut, hotels, knownPrices } = body;

          if (!llm?.apiKey || !Array.isArray(hotels) || hotels.length === 0) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: '缺少 AI API Key 或待搜价酒店列表' }));
            return;
          }

          const targetSlice = hotels.slice(0, 16);
          const cacheKey = `ai_batch:${city}:${centerName}:${checkIn}:${targetSlice
            .map((h: any) => h.id)
            .join(',')}`;
          const cached = getCached(cacheKey);
          if (cached) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(cached.body);
            return;
          }

          const cleanCity = String(city || '').replace(/市$/, '');
          // 针对当前批次每家门店单独并发检索其在携程/美团/同程/去哪儿的公开收录实价摘要，拒绝盲猜！
          const perHotelSnippets = await Promise.all(
            targetSlice.map(async (h: any) => {
              if (!serpApiKey) return { id: h.id, text: '' };
              const shortName = String(h.name).replace(/[（(].*?[)）]/g, '').trim() || h.name;
              const rows = await searchCnWebSnippets(
                `${cleanCity} "${shortName}" (携程 OR 美团 OR 同程 OR 去哪儿) (元 OR ¥ OR 房价)`,
                serpApiKey
              );
              const text = rows
                .slice(0, 3)
                .map((r: any) => `${r.title}：${r.snippet}`)
                .join(' | ');
              return { id: h.id, text };
            })
          );

          const snippetById = new Map<string, string>();
          perHotelSnippets.forEach((p) => snippetById.set(String(p.id), p.text));

          const knownRefText =
            Array.isArray(knownPrices) && knownPrices.length > 0
              ? knownPrices
                  .slice(0, 8)
                  .map((k: any) => `${k.name}: ¥${k.price}/晚`)
                  .join('；')
              : '暂无';

          const hotelListText = targetSlice
            .map((h: any, idx: number) => {
              const sText = snippetById.get(String(h.id)) || '未检索到公开网页挂牌数字';
              return `${idx + 1}. id="${h.id}" | 店名="${h.name}" | 类型="${h.categoryLabel}" | 地址="${h.address}"\n   └─ 网页检索实证：${sText}`;
            })
            .join('\n');

          const prompt = `请为「${cleanCity} ${centerName}」周边的以下 ${targetSlice.length} 家酒店核定入住日期（${checkIn} 至 ${checkOut}）的每晚人民币价格与客房情况。

【同区域已确认真实房价参照】：
${knownRefText}

【待核价酒店及各自网页检索实证】：
${hotelListText}

请严格返回一个 JSON 数组（不要遗漏任何 id），格式如下：
[
  {
    "id": "原样返回酒店id",
    "minPrice": 95,
    "priceRange": "¥85-125",
    "vacancyHint": "有房",
    "basis": "公开挂牌实价",
    "rooms": [
      { "name": "标准大床房", "spec": "独立卫浴", "status": "有房", "leftText": "可订", "price": 95 },
      { "name": "标准双床房", "spec": "双人入住", "status": "有房", "leftText": "可订", "price": 115 }
    ]
  }
]
严格准确性要求：
1. 若某店的「网页检索实证」中出现了明确的人民币房价数字（如 ¥98、118元起），必须严格采用该真实数字，并将 basis 设为 "公开网页实价"！
2. 若某店是未上网公开挂价的村镇/校门口个体小旅馆（「网页检索实证」无明确数字），请结合同街区真实参照价审慎估算，且必须诚实地将 basis 设为 "周边行情估算(美团私域价请扫码核实)"，禁止伪装成实价！
3. 只输出纯 JSON 数组！`;

          console.log(`[ai-batch-prices] querying ${targetSlice.length} hotels near "${centerName}" via model=${llm.model}`);
          const rawReply = await callOpenAiCompatibleLlm(llm, prompt, 3500);
          const parsed = extractJsonFromLlmText(rawReply);
          console.log(`[ai-batch-prices] parsed=${Array.isArray(parsed) ? parsed.length : 'failed'}`);

          if (!Array.isArray(parsed)) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'AI 返回格式解析失败', raw: rawReply.slice(0, 200) }));
            return;
          }

          const payload = JSON.stringify({ results: parsed });
          apiCache.set(cacheKey, {
            status: 200,
            body: payload,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(payload);
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err?.message || 'AI 批量搜价请求失败' }));
        }
      });

      // 5. 单家酒店详情抽屉：AI 全网深搜该店细分房型价目表 + 抖音团购价 + 避坑指南
      server.middlewares.use('/api/ai-hotel-rooms', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        try {
          const body = await readJsonBody(req);
          const {
            llm,
            serpApiKey,
            hotelName,
            city,
            address,
            categoryLabel,
            checkIn,
            checkOut,
            existingSnippets,
            fallbackPrice,
          } = body;

          if (!llm?.apiKey || !hotelName) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: '缺少 AI 配置或酒店名' }));
            return;
          }

          const cacheKey = `ai_detail:${city}:${hotelName}:${checkIn}`;
          const cached = getCached(cacheKey);
          if (cached) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(cached.body);
            return;
          }

          const cleanCity = String(city || '').replace(/市$/, '');
          let snippets = Array.isArray(existingSnippets) ? existingSnippets : [];
          if (snippets.length === 0 && serpApiKey) {
            const raw = await searchCnWebSnippets(
              `${cleanCity} "${hotelName}" 房型 大床房 双床房 价格 携程 美团 抖音 团购`,
              serpApiKey
            );
            snippets = raw.map((r: any) => ({
              platformLabel: '公开检索',
              title: r.title,
              snippet: r.snippet,
            }));
          }

          const snippetContext = snippets
            .slice(0, 10)
            .map((s: any, idx: number) => `[${idx + 1}] ${s.title || ''}：${s.snippet || ''}`)
            .join('\n');

          const prompt = `请针对中国「${cleanCity}」的「${hotelName}」（地址：${address}，档次：${categoryLabel}，入住日期：${checkIn} 至 ${checkOut}，已知参考起步价：${
            fallbackPrice ? `¥${fallbackPrice}` : '待核定'
          }），结合以下全网检索摘要，生成结构化房型价目表与住店情报 JSON：

【全网检索摘要】：
${snippetContext || '暂无直接网页正文，请结合该门店品牌/地段与国内美团携程同档门店行情给出参考房型表并注明参考属性'}

请严格输出如下 JSON 对象（纯数字价格，不要加单位字符）：
{
  "lowestPrice": 89,
  "priceRange": "¥79 - ¥139",
  "vacancyStatus": "日常房源充足，可直接预订或到店",
  "douyinGroupBuy": "抖音/美团常见特惠大床房团购约 ¥79-95",
  "highlights": "地理位置便利，性价比高",
  "pitfalls": "预订前建议确认房间是否有独立外窗及隔音情况",
  "rooms": [
    { "roomName": "特惠大床房", "spec": "1.5m床 · 独立卫浴", "price": 89, "tag": "人气底价" },
    { "roomName": "标准双床房", "spec": "2张1.2m床 · 有窗", "price": 109, "tag": "双人优选" },
    { "roomName": "商务/精选房", "spec": "1.8m大床 · 空间宽敞", "price": 129, "tag": "舒适升级" }
  ]
}`;

          const rawReply = await callOpenAiCompatibleLlm(llm, prompt, 1200);
          const parsed = extractJsonFromLlmText(rawReply);

          if (!parsed || typeof parsed !== 'object') {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'AI 房型表解析失败' }));
            return;
          }

          const payload = JSON.stringify(parsed);
          apiCache.set(cacheKey, {
            status: 200,
            body: payload,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(payload);
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err?.message || 'AI 房型检索失败' }));
        }
      });

      // 6. 精准定位美团酒店具体门店购买详情页 (https://hotel.meituan.com/<poiId>/)
      server.middlewares.use('/api/meituan-url', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', 'http://localhost');
          const apiKey = (reqUrl.searchParams.get('api_key') || '').trim();
          const hotel = (reqUrl.searchParams.get('hotel') || '').trim();
          const city = (reqUrl.searchParams.get('city') || '').replace(/市$/, '').trim();

          const fallbackUrl = 'https://hotel.meituan.com/';
          if (!hotel || !apiKey) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ url: fallbackUrl, matched: false }));
            return;
          }

          const cacheKey = `mt_url:${city}:${hotel}`;
          const cached = getCached(cacheKey);
          if (cached) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(cached.body);
            return;
          }

          const cleanName = hotel.replace(/[（(].*?[)）]/g, '').trim() || hotel;
          const results = await searchCnWebSnippets(
            `${city} "${cleanName}" (site:hotel.meituan.com OR site:meituan.com/jiudian)`,
            apiKey
          );

          let directUrl = '';
          for (const item of results) {
            const link = String(item.link || '');
            const idMatch = link.match(/(?:hotel\.meituan\.com|meituan\.com\/jiudian)\/(\d{5,15})/);
            if (idMatch && idMatch[1]) {
              directUrl = `https://hotel.meituan.com/${idMatch[1]}/`;
              break;
            }
          }

          if (!directUrl) {
            const broadResults = await searchCnWebSnippets(
              `${city} ${hotel} 美团酒店 预订 site:meituan.com`,
              apiKey
            );
            for (const item of broadResults) {
              const link = String(item.link || '');
              const idMatch = link.match(/(?:hotel\.meituan\.com|meituan\.com\/jiudian)\/(\d{5,15})/);
              if (idMatch && idMatch[1]) {
                directUrl = `https://hotel.meituan.com/${idMatch[1]}/`;
                break;
              }
            }
          }

          const payload = JSON.stringify({
            url: directUrl || fallbackUrl,
            matched: Boolean(directUrl),
          });

          apiCache.set(cacheKey, {
            status: 200,
            body: payload,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(payload);
        } catch {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ url: 'https://hotel.meituan.com/', matched: false }));
        }
      });

      // 7. 局域网手机免长URL配置同步接口（解决超长二维码扫不出问题）
      server.middlewares.use('/api/sync-config', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (req.method === 'POST') {
          try {
            const body = await readJsonBody(req);
            lanMemorySyncState = { ...lanMemorySyncState, ...body, updatedAt: Date.now() };
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false }));
          }
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify(lanMemorySyncState));
      });

      // 8. 精准同店扫码桥接存储：按唯一门店 ID 保存完整地址坐标，保证手机扫码 100% 命中同一家店绝不跳错分店
      server.middlewares.use('/api/hotel-target', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (req.method === 'POST') {
          try {
            const hotel = await readJsonBody(req);
            if (hotel?.id) {
              lanHotelTargets.set(String(hotel.id), hotel);
            }
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false }));
          }
          return;
        }

        const reqUrl = new URL(req.url || '', 'http://localhost');
        const id = reqUrl.searchParams.get('id') || '';
        const found = lanHotelTargets.get(id) || null;
        res.statusCode = found ? 200 : 404;
        res.end(JSON.stringify({ hotel: found }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), backendProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
