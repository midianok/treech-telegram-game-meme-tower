import { STORAGE_PENDING_SCORES_KEY } from '../constants';

/** Результат, который ещё не подтверждён сервером. */
export interface PendingScore {
  userId: number;
  chatId: number;
  score: number;
  createdAt: number;
}

/** Неотправленный результат живёт неделю — дольше нет смысла (например, игрока исключили из чата). */
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Очередь неотправленных результатов в localStorage: по одному (максимальному) на пару пользователь + чат.
 * Переживает закрытие Mini App, обрыв сети и протухший initData — отправка повторится при следующем запуске.
 * Если localStorage недоступен, очередь работает в памяти до конца сессии.
 */
export class PendingScoreStore {
  private memory = new Map<string, PendingScore>();

  constructor() {
    this.memory = this.load();
  }

  get(userId: number, chatId: number): PendingScore | null {
    return this.memory.get(key(userId, chatId)) ?? null;
  }

  listForUser(userId: number): PendingScore[] {
    return [...this.memory.values()].filter((entry) => entry.userId === userId);
  }

  /** Запоминает результат, если он больше уже ожидающего отправки. */
  put(userId: number, chatId: number, score: number): void {
    const existing = this.get(userId, chatId);
    if (existing && existing.score >= score) return;

    this.memory.set(key(userId, chatId), { userId, chatId, score, createdAt: Date.now() });
    this.save();
  }

  /** Убирает ожидающий результат, если сервер подтвердил не меньший. */
  resolve(userId: number, chatId: number, confirmedScore: number): void {
    const existing = this.get(userId, chatId);
    if (!existing || existing.score > confirmedScore) return;

    this.memory.delete(key(userId, chatId));
    this.save();
  }

  drop(userId: number, chatId: number): void {
    if (this.memory.delete(key(userId, chatId))) this.save();
  }

  private load(): Map<string, PendingScore> {
    const result = new Map<string, PendingScore>();
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_PENDING_SCORES_KEY);
    } catch {
      return result;
    }
    if (!raw) return result;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return result;

      const now = Date.now();
      for (const item of parsed) {
        const entry = normalize(item);
        if (entry && now - entry.createdAt < PENDING_TTL_MS) {
          result.set(key(entry.userId, entry.chatId), entry);
        }
      }
    } catch {
      /* битые данные — начинаем с пустой очереди */
    }
    return result;
  }

  private save(): void {
    try {
      if (this.memory.size === 0) {
        localStorage.removeItem(STORAGE_PENDING_SCORES_KEY);
      } else {
        localStorage.setItem(STORAGE_PENDING_SCORES_KEY, JSON.stringify([...this.memory.values()]));
      }
    } catch {
      /* приватный режим — остаётся очередь в памяти */
    }
  }
}

function key(userId: number, chatId: number): string {
  return `${userId}:${chatId}`;
}

function normalize(item: unknown): PendingScore | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const userId = Number(record.userId);
  const chatId = Number(record.chatId);
  const score = Number(record.score);
  const createdAt = Number(record.createdAt);

  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(chatId)) return null;
  if (!Number.isSafeInteger(score) || score < 0 || !Number.isFinite(createdAt)) return null;
  return { userId, chatId, score, createdAt };
}
