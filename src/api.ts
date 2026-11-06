const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/saturn-api';

interface TelegramInitDataSource {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
}

function getInitData(): string {
  return (window as unknown as TelegramInitDataSource).Telegram?.WebApp?.initData ?? '';
}

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-Telegram-Init-Data', getInitData());

  return fetch(`${apiBase}${path}`, { ...options, headers });
}
