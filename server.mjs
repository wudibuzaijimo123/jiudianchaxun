import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 5173);

const apiCache = new Map();
const CACHE_TTL_MS = 25 * 60 * 1000;
let lanMemorySyncState = {};
const lanHotelTargets = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function getCached(key) {
  const hit = apiCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return hit;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
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

function extractJsonFromLlmText(rawText) {
  const cleaned = String(rawText || '')
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
      } catch {}
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch && !cleaned.startsWith('[')) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {}
    }
    const recovered = [];
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
          } catch {}
          startIdx = -1;
        }
      }
    }
    if (recovered.length > 0) return recovered;
  }
  return null;
}

async function callOpenAiCompatibleLlm(llm, prompt, maxTokens = 3200, systemPrompt = '你是中国本地酒店房价检索与数据分析引擎。只输出合法的纯 JSON。') {
  const cleanBase = String(llm.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${String(llm.apiKey || '').trim()}`,
    },
    body: JSON.stringify({
      model: llm.model || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
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

async function searchCnWebSnippets(query, serpApiKey) {
  if (!serpApiKey || !serpApiKey.trim()) return [];
  const cacheKey = `serp_web:${query}`;
  const cached = getCached(cacheKey);
  if (cached) return JSON.parse(cached.body);

  try {
    const target = new URL('https://serpapi.com/search.json');
    target.searchParams.set('engine', 'google');
    target.searchParams.set('api_key', serpApiKey.trim());
    target.searchParams.set('q', query);
    target.searchParams.set('hl', 'zh-CN');
    target.searchParams.set('gl', 'hk');
    target.searchParams.set('num', '10');
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

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // 允许独立签名的 iOS IPA / 跨域客户端连接自家云服务器
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  try {
    if (pathname === '/api/lan-info') {
      const nets = os.networkInterfaces();
      const ips = [];
      for (const addrs of Object.values(nets)) {
        if (!addrs) continue;
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('198.18.')) {
            ips.push(addr.address);
          }
        }
      }
      return sendJson(res, 200, { ips, port: PORT });
    }

    if (pathname === '/api/serp-hotels') {
      const apiKey = reqUrl.searchParams.get('api_key') || '';
      const q = reqUrl.searchParams.get('q') || '';
      const checkIn = reqUrl.searchParams.get('check_in_date') || '';
      const checkOut = reqUrl.searchParams.get('check_out_date') || '';
      const propertyToken = reqUrl.searchParams.get('property_token') || '';
      if (!apiKey) return sendJson(res, 400, { error: '缺少 SerpApi Key' });

      const cacheKey = `hotels:${q}:${propertyToken}:${checkIn}:${checkOut}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.statusCode = cached.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(cached.body);
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
      if (propertyToken) target.searchParams.set('property_token', propertyToken);
      else target.searchParams.set('q', q);

      const upstream = await fetch(target.toString());
      const text = await upstream.text();
      if (upstream.status === 200) {
        apiCache.set(cacheKey, { status: 200, body: text, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(text);
    }

    if (pathname === '/api/cn-hotel-intel') {
      const apiKey = reqUrl.searchParams.get('api_key') || '';
      const hotel = (reqUrl.searchParams.get('hotel') || '').trim();
      const city = (reqUrl.searchParams.get('city') || '').replace(/市$/, '').trim();
      if (!apiKey || !hotel) return sendJson(res, 400, { error: '参数不完整' });

      const cacheKey = `cn_intel:${city}:${hotel}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(cached.body);
      }

      const organic = await searchCnWebSnippets(
        `${city} ${hotel} (携程 OR 同程 OR 去哪儿 OR 抖音 OR 小红书 OR 团购 OR 价格)`,
        apiKey
      );
      const items = [];
      const extractedPrices = [];
      const metaFacts = new Set();

      for (const row of organic) {
        const link = String(row.link || '');
        const title = String(row.title || '');
        const snippet = String(row.snippet || '');
        const combined = `${title} ${snippet}`;
        let platform = 'web';
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
        }
        const priceMatches = combined.matchAll(/(?:¥|￥)\s*(\d{2,4})|(\d{2,4})\s*元(?:\/晚|起)?/g);
        for (const m of priceMatches) {
          const val = Number(m[1] || m[2]);
          if (val >= 40 && val <= 3500) extractedPrices.push(val);
        }
        const openYear = combined.match(/(20\d{2}年开业|20\d{2}年装修)/);
        if (openYear) metaFacts.add(openYear[1]);
        items.push({
          platform,
          platformLabel,
          title: title.replace(/\s*[-|_].*$/, '').trim() || title,
          snippet,
          link,
        });
      }

      const payload = JSON.stringify({
        items,
        minExtractedPrice: extractedPrices.length > 0 ? Math.min(...extractedPrices) : null,
        metaFacts: Array.from(metaFacts).slice(0, 5),
      });
      apiCache.set(cacheKey, { status: 200, body: payload, expiresAt: Date.now() + CACHE_TTL_MS });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(payload);
    }

    if (pathname === '/api/ai-batch-prices' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { llm, serpApiKey, city, centerName, checkIn, checkOut, hotels, knownPrices } = body;
      if (!llm?.apiKey || !Array.isArray(hotels) || hotels.length === 0) {
        return sendJson(res, 400, { error: '缺少 AI Key 或酒店列表' });
      }
      const targetSlice = hotels.slice(0, 8);
      const cleanCity = String(city || '').replace(/市$/, '');

      const perHotelSnippets = await Promise.all(
        targetSlice.map(async (h) => {
          if (!serpApiKey) return { id: h.id, text: '' };
          const shortName = String(h.name).replace(/[（(].*?[)）]/g, '').trim() || h.name;
          const rows = await searchCnWebSnippets(
            `${cleanCity} "${shortName}" (携程 OR 美团 OR 同程) (元 OR ¥ OR 房价)`,
            serpApiKey
          );
          return {
            id: h.id,
            text: rows
              .slice(0, 3)
              .map((r) => `${r.title}：${r.snippet}`)
              .join(' | '),
          };
        })
      );
      const snippetById = new Map(perHotelSnippets.map((p) => [String(p.id), p.text]));
      const knownRefText =
        Array.isArray(knownPrices) && knownPrices.length > 0
          ? knownPrices
              .slice(0, 8)
              .map((k) => `${k.name}: ¥${k.price}/晚`)
              .join('；')
          : '暂无';
      const hotelListText = targetSlice
        .map(
          (h, idx) =>
            `${idx + 1}. id="${h.id}" | 店名="${h.name}" | 类型="${h.categoryLabel}" | 地址="${
              h.address
            }"\n   └─ 网页实证：${snippetById.get(String(h.id)) || '无公开挂牌数字'}`
        )
        .join('\n');

      const prompt = `请为「${cleanCity} ${centerName}」周边的以下酒店核定入住（${checkIn} 至 ${checkOut}）的每晚人民币价格与客房情况（参照：${knownRefText}）：\n${hotelListText}\n严格返回纯 JSON 数组：[ { "id": "原样id", "minPrice": 95, "priceRange": "¥85-125", "vacancyHint": "有房", "basis": "公开网页实价 或 周边行情估算", "rooms": [ { "name": "标准大床房", "spec": "独立卫浴", "status": "有房", "leftText": "可订", "price": 95 }, { "name": "标准双床房", "spec": "双人入住", "status": "有房", "leftText": "可订", "price": 115 } ] } ]`;
      const rawReply = await callOpenAiCompatibleLlm(llm, prompt, 3200);
      const parsed = extractJsonFromLlmText(rawReply);
      if (!Array.isArray(parsed)) return sendJson(res, 500, { error: 'AI JSON 解析失败' });
      return sendJson(res, 200, { results: parsed });
    }

    if (pathname === '/api/ai-hotel-rooms' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { llm, hotelName, city, address, categoryLabel, checkIn, checkOut, existingSnippets, fallbackPrice } =
        body;
      if (!llm?.apiKey || !hotelName) return sendJson(res, 400, { error: '参数缺失' });
      const snippetContext = (Array.isArray(existingSnippets) ? existingSnippets : [])
        .slice(0, 8)
        .map((s, i) => `[${i + 1}] ${s.title || ''}：${s.snippet || ''}`)
        .join('\n');
      const prompt = `针对「${city} ${hotelName}」（地址：${address}，档次：${categoryLabel}，${checkIn}至${checkOut}，参考价：${
        fallbackPrice || '待定'
      }），结合摘要：\n${snippetContext}\n严格输出纯 JSON 对象：{ "lowestPrice": 95, "priceRange": "¥85 - ¥135", "vacancyStatus": "日常房源充足", "douyinGroupBuy": "建议点上方按钮跳美团/抖音核实个人券后价", "highlights": "交通便利", "pitfalls": "建议确认窗户及隔音", "rooms": [ { "roomName": "特惠大床房", "spec": "1.5m床·独卫", "price": 95, "tag": "底价" }, { "roomName": "标准双床房", "spec": "1.2m×2床", "price": 115, "tag": "双人" } ] }`;
      const rawReply = await callOpenAiCompatibleLlm(llm, prompt, 1400);
      const parsed = extractJsonFromLlmText(rawReply);
      if (!parsed) return sendJson(res, 500, { error: 'AI 房型解析失败' });
      return sendJson(res, 200, parsed);
    }

    // AI 周边租房房源检索（安居客式：户型/面积/月租/押付方式）
    if (pathname === '/api/ai-rentals' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { llm, serpApiKey = '', city = '', centerName = '', radius = 3000, maxRent, count = 12 } = body;
      if (!llm?.apiKey) return sendJson(res, 400, { error: '缺少大模型 Key' });

      const cleanCity = String(city).replace(/市$/, '');
      const cacheKey = `rentals:${cleanCity}:${centerName}:${radius}:${maxRent || ''}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(cached.body);
      }

      const snippets = serpApiKey
        ? await searchCnWebSnippets(
            `${cleanCity} ${centerName} 租房 (安居客 OR 58同城 OR 贝壳) 月租 整租 合租 单间`,
            serpApiKey
          )
        : [];
      const evidence = snippets
        .slice(0, 8)
        .map((s, i) => `[${i + 1}] ${s.title || ''}：${s.snippet || ''}`)
        .join('\n');

      const prompt = `请检索「${cleanCity} ${centerName}」周边 ${
        radius >= 1000 ? `${Math.round(radius / 1000)}km` : `${radius}m`
      } 范围内真实可租房源信息（参照安居客/58同城/贝壳该地段挂牌特征），输出约 ${count} 条。
要求：优先真实存在的小区/公寓/自建房/城中村；租金符合该城市该地段行情${maxRent ? `，月租尽量不超过 ${maxRent} 元` : ''}；
类型包含整租/合租/单间/床位/日租；不要编造房东手机号；距离为合理估算米数。
${evidence ? `\n公开检索摘要（仅作行情参考）：\n${evidence}\n` : ''}
严格只返回 JSON 数组，每项字段：
{"title":"整租·阳光花园 2室1厅","community":"阳光花园","district":"城关区","address":"建设路88号","kind":"整租","layout":"2室1厅1卫","area":89,"floor":"中楼层/18层","orientation":"南","decoration":"精装","rentMonthly":1800,"rentDaily":null,"payMethod":"押一付三","minLease":"一年起租","tags":["近地铁","有电梯"],"facilities":["空调","洗衣机","热水器","宽带","独卫"],"distanceMeters":420,"basis":"该地段挂牌行情","riskNote":"合租需确认是否独卫"}`;

      const rawReply = await callOpenAiCompatibleLlm(
        llm,
        prompt,
        3200,
        '你是中国本地租房房源检索引擎，熟悉安居客/58同城/贝壳的挂牌数据结构。只输出合法的纯 JSON 数组，不要输出任何解释文字。'
      );
      const parsed = extractJsonFromLlmText(rawReply);
      if (!Array.isArray(parsed)) return sendJson(res, 500, { error: 'AI 房源 JSON 解析失败' });

      const payload = JSON.stringify({
        listings: parsed.slice(0, 20),
        notice: snippets.length > 0 ? `已参考 ${snippets.length} 条公开挂牌摘要` : '',
      });
      apiCache.set(cacheKey, { status: 200, body: payload, expiresAt: Date.now() + CACHE_TTL_MS });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(payload);
    }

    // 周边招聘岗位（参照 BOSS直聘/58同城/智联的挂牌特征）
    if (pathname === '/api/ai-jobs' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { llm, serpApiKey = '', city = '', centerName = '', radius = 3000, count = 12 } = body;
      if (!llm?.apiKey) return sendJson(res, 400, { error: '缺少大模型 Key' });

      const cleanCity = String(city).replace(/市$/, '');
      const cacheKey = `jobs:${cleanCity}:${centerName}:${radius}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(cached.body);
      }

      const snippets = serpApiKey
        ? await searchCnWebSnippets(
            `${cleanCity} ${centerName} 招聘 (BOSS直聘 OR 58同城 OR 智联招聘) 工资 服务员 店员`,
            serpApiKey
          )
        : [];
      const evidence = snippets
        .slice(0, 8)
        .map((s, i) => `[${i + 1}] ${s.title || ''}：${s.snippet || ''}`)
        .join('\n');

      const prompt = `请检索「${cleanCity} ${centerName}」周边 ${
        radius >= 1000 ? `${Math.round(radius / 1000)}km` : `${radius}m`
      } 范围内真实在招岗位（参照 BOSS直聘/58同城/智联招聘该地段门店与小微企业招聘特征），输出约 ${count} 条。
要求：以餐饮、酒店、超市、快递物流、家政、门店导购、工厂普工、外卖骑手等小城常见岗位为主，不要编造大厂高薪岗位；
薪资符合该城市该地段行情并注明单位（元/月、元/天、元/时）；类型覆盖全职/兼职/日结/钟点工；不要编造 HR 手机号或微信号；距离用合理估算米数。
${evidence ? `\n公开检索摘要（仅作行情参考）：\n${evidence}\n` : ''}
严格只返回 JSON 数组，每项字段：
{"title":"餐厅服务员","company":"老城火锅店","salaryText":"3200-4000元/月","salaryMin":3200,"salaryMax":4000,"salaryUnit":"月","type":"全职","experience":"经验不限","education":"学历不限","headcount":2,"district":"城关区","address":"建设路12号","distanceMeters":380,"tags":["包吃","月休4天","有提成"],"description":"负责点单、上菜、餐前准备。","publishText":"今天发布"}`;

      const rawReply = await callOpenAiCompatibleLlm(
        llm,
        prompt,
        3200,
        '你是中国本地招聘信息检索引擎，熟悉 BOSS直聘/58同城/智联招聘的岗位数据结构。只输出合法的纯 JSON 数组，不要输出任何解释文字。'
      );
      const parsed = extractJsonFromLlmText(rawReply);
      if (!Array.isArray(parsed)) return sendJson(res, 500, { error: 'AI 岗位 JSON 解析失败' });

      const payload = JSON.stringify({
        jobs: parsed.slice(0, 20),
        notice: snippets.length > 0 ? `已参考 ${snippets.length} 条公开招聘摘要` : '',
      });
      apiCache.set(cacheKey, { status: 200, body: payload, expiresAt: Date.now() + CACHE_TTL_MS });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(payload);
    }

    // 高德图床代理：部分高德图片只给 http 源，https 页面会被浏览器当作混合内容拦掉
    if (pathname === '/api/img-proxy') {
      const target = reqUrl.searchParams.get('url') || '';
      if (!/^https?:\/\/([a-z0-9-]+\.)+(autonavi|amap)\.com\//i.test(target)) {
        return sendJson(res, 400, { error: '仅支持高德图床地址' });
      }

      const candidates = Array.from(
        new Set([
          target,
          target.replace(/^http:\/\//i, 'https://'),
          target.replace(/^https:\/\//i, 'http://'),
        ])
      );

      for (const url of candidates) {
        try {
          const upstream = await fetch(url, {
            headers: { Referer: 'https://www.amap.com/', 'User-Agent': 'Mozilla/5.0' },
          });
          if (!upstream.ok) continue;
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = 200;
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.end(buf);
        } catch {
          // 换一个协议再试
        }
      }
      return sendJson(res, 502, { error: '高德图片拉取失败' });
    }

    if (pathname === '/api/sync-config') {
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        lanMemorySyncState = { ...lanMemorySyncState, ...body, updatedAt: Date.now() };
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 200, lanMemorySyncState);
    }

    if (pathname === '/api/hotel-target') {
      if (req.method === 'POST') {
        const hotel = await readJsonBody(req);
        if (hotel?.id) lanHotelTargets.set(String(hotel.id), hotel);
        return sendJson(res, 200, { ok: true });
      }
      const id = reqUrl.searchParams.get('id') || '';
      const found = lanHotelTargets.get(id) || null;
      return sendJson(res, found ? 200 : 404, { hotel: found });
    }

    // 静态生产文件托管 (dist/)
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(DIST_DIR)) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      return res.end('Please run `npm run build` first.');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Internal Server Error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 附近住哪儿生产服务已启动: http://0.0.0.0:${PORT}`);
});
