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
        // ignore
      }
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // ignore
      }
    }
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

        candidates.sort((a, b) => b.score - a.score);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            ips: candidates.map((c) => c.ip),
            port: server.config.server.port || 5173,
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
          // 组合检索该地段及代表性门店在国内携程/美团/同程/抖音的公开挂牌价摘要
          const sampleNames = targetSlice
            .slice(0, 5)
            .map((h: any) => `"${String(h.name).replace(/[（(].*?[)）]/g, '')}"`)
            .join(' OR ');

          const [areaSnippets, hotelSnippets] = await Promise.all([
            searchCnWebSnippets(
              `${cleanCity} ${centerName} 附近酒店 宾馆 携程 美团 价格 多少钱一晚`,
              serpApiKey || ''
            ),
            sampleNames
              ? searchCnWebSnippets(
                  `${cleanCity} (${sampleNames}) (携程 OR 同程 OR 美团 OR 抖音 OR 房价 OR 元)`,
                  serpApiKey || ''
                )
              : Promise.resolve([]),
          ]);

          const mergedSnippets = [...hotelSnippets, ...areaSnippets]
            .slice(0, 14)
            .map((s: any, i: number) => `[网页${i + 1}] ${s.title}：${s.snippet}`)
            .join('\n');

          const knownRefText =
            Array.isArray(knownPrices) && knownPrices.length > 0
              ? knownPrices
                  .slice(0, 8)
                  .map((k: any) => `${k.name}: ¥${k.price}/晚`)
                  .join('；')
              : '暂无';

          const hotelListText = targetSlice
            .map(
              (h: any, idx: number) =>
                `${idx + 1}. id="${h.id}" | 店名="${h.name}" | 类型="${h.categoryLabel}" | 地址="${h.address}" | 距中心=${h.distance}m`
            )
            .join('\n');

          const prompt = `请为「${cleanCity} ${centerName}」周边的以下 ${targetSlice.length} 家酒店/宾馆检索并核定入住日期（${checkIn} 至 ${checkOut}）的每晚人民币起步价与主力房型价格，供界面直接展示。

【同区域已确认真实房价参照】：
${knownRefText}

【全网实时检索到的国内携程/美团/同程/抖音公开网页摘要】：
${mergedSnippets || '（当前区域个体门店公开网页较少，请结合门店品牌档次、地理位置与同区域真实参照价给出贴合中国本地实际行情的价格）'}

【待定价酒店清单】：
${hotelListText}

请严格返回一个 JSON 数组，包含每一家店的定价对象（不要遗漏任何 id），格式如下：
[
  {
    "id": "原样返回酒店id",
    "minPrice": 89,
    "priceRange": "¥79-119",
    "roomBrief": "单人/大床房 ¥89 · 双床房 ¥109",
    "vacancyHint": "有房可订",
    "basis": "全网检索挂牌"
  }
]
要求：
1. minPrice 必须是贴合实际的纯整数（人民币元），村镇/高校门口个体小宾馆/公寓通常在 65~135 元之间，经济连锁（汉庭/如家/格林豪泰/尚客优等）通常在 129~229 元，中高端（全季/亚朵/维也纳）通常在 259~459 元；若上方网页摘要中有明确价格则优先采用网页实价并将 basis 设为 "全网检索实价"，否则将 basis 设为 "AI同地段行情"。
2. 只输出纯 JSON 数组！`;

          const rawReply = await callOpenAiCompatibleLlm(llm, prompt, 1600);
          const parsed = extractJsonFromLlmText(rawReply);

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
    },
  };
}

export default defineConfig({
  plugins: [react(), backendProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
