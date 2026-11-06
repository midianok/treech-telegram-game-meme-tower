import { apiFetch } from '../api';
import { t } from '../i18n';

export interface AddMemeTowerScoreRequest {
  userId: number;
  chatId: number;
  score: number;
}

export interface MemeTowerLeaderboardEntry {
  userId: number;
  userName: string | null;
  score: number;
}

/** Ответ на отправку результата; поля пустые, если бэкенд их не возвращает. */
export interface MemeTowerScoreResult {
  bestScore?: number;
  isNewRecord?: boolean;
}

export class ScoreRequestError extends Error {
  constructor(readonly status: number) {
    super(t('api.scoreRequestFailed', { status }));
    this.name = 'ScoreRequestError';
  }
}

const MEME_TOWER_API_PATH = '/api/meme-tower';

export class MemeTowerApi {
  /**
   * Одна попытка отправки результата. Повторы и сохранение неотправленного — в `ScoreSubmitter`.
   * Сервер сам хранит максимум, поэтому отправлять можно любой результат, а не только рекорд.
   */
  async submitScore(request: AddMemeTowerScoreRequest, keepalive: boolean): Promise<MemeTowerScoreResult> {
    const response = await apiFetch(`${MEME_TOWER_API_PATH}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
      keepalive,
    });

    if (!response.ok) {
      throw new ScoreRequestError(response.status);
    }

    return this.parseScoreResult(response);
  }

  private async parseScoreResult(response: Response): Promise<MemeTowerScoreResult> {
    try {
      const text = await response.text();
      if (!text) return {};
      const record = JSON.parse(text) as Record<string, unknown>;
      const bestScore = Number(record?.bestScore);
      return {
        bestScore: Number.isFinite(bestScore) ? bestScore : undefined,
        isNewRecord: typeof record?.isNewRecord === 'boolean' ? record.isNewRecord : undefined,
      };
    } catch {
      // Старый бэкенд отвечает пустым 200 — результат при этом сохранён.
      return {};
    }
  }

  async getLeaderboard(chatId: number, limit = 10): Promise<MemeTowerLeaderboardEntry[]> {
    const params = new URLSearchParams({ chatId: String(chatId), limit: String(limit) });
    const response = await apiFetch(`${MEME_TOWER_API_PATH}/leaderboard?${params}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(t('api.leaderboardRequestFailed', { status: response.status }));
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(t('api.leaderboardResponseNotArray'));
    }

    return data.map((entry) => this.normalizeLeaderboardEntry(entry));
  }

  async getUserScore(userId: number, chatId: number): Promise<MemeTowerLeaderboardEntry | null> {
    const params = new URLSearchParams({ chatId: String(chatId) });
    const response = await apiFetch(`${MEME_TOWER_API_PATH}/score/${userId}?${params}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(t('api.userScoreRequestFailed', { status: response.status }));
    }

    const data: unknown = await response.json();

    if (data === null) {
      return null;
    }

    return this.normalizeLeaderboardEntry(data);
  }

  private normalizeLeaderboardEntry(entry: unknown): MemeTowerLeaderboardEntry {
    if (!entry || typeof entry !== 'object') {
      throw new Error(t('api.leaderboardEntryNotObject'));
    }

    const record = entry as Record<string, unknown>;
    const userId = Number(record.userId);
    const score = Number(record.score);

    if (!Number.isFinite(userId) || !Number.isFinite(score)) {
      throw new Error(t('api.invalidLeaderboardEntryNumbers'));
    }

    return {
      userId,
      userName: typeof record.userName === 'string' ? record.userName : null,
      score,
    };
  }
}
