import { PRESET_LANDMARKS } from '../data/demoHotels';
import { HotelItem, LlmConfig, SearchCenter, SearchHistoryItem } from '../types/hotel';

const KEY_AMAP = 'jdcx_amap_web_service_key_v1';
const KEY_SERP = 'jdcx_serpapi_hotels_key_v1';
const KEY_LLM = 'jdcx_llm_config_v1';
const KEY_SERVER_URL = 'jdcx_custom_server_url_v1';
const KEY_FAVORITES = 'jdcx_favorite_hotels_v1';

export function loadServerBaseUrl(): string {
  try {
    return localStorage.getItem(KEY_SERVER_URL) || '';
  } catch {
    return '';
  }
}

export function saveServerBaseUrl(url: string): void {
  try {
    localStorage.setItem(KEY_SERVER_URL, url.trim().replace(/\/+$/, ''));
  } catch {
    // ignore
  }
}
const KEY_HISTORY = 'jdcx_search_history_v1';
const KEY_LAST_CENTER = 'jdcx_last_center_v1';

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(KEY_LLM);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey || '',
        baseUrl: parsed.baseUrl || 'https://api.deepseek.com/v1',
        model: parsed.model || 'deepseek-chat',
      };
    }
  } catch {
    // ignore
  }
  return {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  };
}

export function saveLlmConfig(cfg: LlmConfig): void {
  try {
    localStorage.setItem(KEY_LLM, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function loadAmapKey(): string {
  try {
    return localStorage.getItem(KEY_AMAP) || '';
  } catch {
    return '';
  }
}

export function saveAmapKey(key: string): void {
  try {
    localStorage.setItem(KEY_AMAP, key.trim());
  } catch {
    // ignore
  }
}

export function loadSerpApiKey(): string {
  try {
    return localStorage.getItem(KEY_SERP) || '';
  } catch {
    return '';
  }
}

export function saveSerpApiKey(key: string): void {
  try {
    localStorage.setItem(KEY_SERP, key.trim());
  } catch {
    // ignore
  }
}

export function loadFavorites(): HotelItem[] {
  try {
    const raw = localStorage.getItem(KEY_FAVORITES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFavorites(list: HotelItem[]): void {
  try {
    localStorage.setItem(KEY_FAVORITES, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function loadSearchHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(center: SearchCenter): SearchHistoryItem[] {
  const prev = loadSearchHistory();
  const nextItem: SearchHistoryItem = {
    name: center.name,
    city: center.city,
    address: center.address,
    lng: center.lng,
    lat: center.lat,
    timestamp: Date.now(),
  };
  const deduped = [
    nextItem,
    ...prev.filter((item) => item.name !== center.name),
  ].slice(0, 15);

  try {
    localStorage.setItem(KEY_HISTORY, JSON.stringify(deduped));
  } catch {
    // ignore
  }
  return deduped;
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(KEY_HISTORY);
  } catch {
    // ignore
  }
}

export function loadLastCenter(): SearchCenter {
  try {
    const raw = localStorage.getItem(KEY_LAST_CENTER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lng === 'number' && typeof parsed.lat === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return PRESET_LANDMARKS[0];
}

export function saveLastCenter(center: SearchCenter): void {
  try {
    localStorage.setItem(KEY_LAST_CENTER, JSON.stringify(center));
  } catch {
    // ignore
  }
}
