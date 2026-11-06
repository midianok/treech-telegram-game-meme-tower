import type { Logger } from '../../api/logger';
import { type MemeTowerApi, type MemeTowerScoreResult, ScoreRequestError } from '../../api/memeTower';
import { PendingScoreStore } from './PendingScoreStore';

/** Паузы между повторами внутри одной отправки; дальше — фоновые повторы. */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
/** Как часто дожимать неотправленные результаты, пока Mini App открыт. */
const BACKGROUND_FLUSH_INTERVAL_MS = 60_000;

export interface ScoreSubmitOutcome extends MemeTowerScoreResult {
  /** Сервер подтвердил приём. */
  saved: boolean;
  /** Какой результат ушёл на сервер (может быть больше переданного, если ждал отправки более высокий). */
  submittedScore: number;
}

/**
 * Гарантированная доставка результатов: сначала результат пишется в localStorage,
 * потом отправляется с повторами. Неподтверждённое дожимается в фоне, при возврате сети,
 * при возврате в приложение и при следующем запуске.
 */
export class ScoreSubmitter {
  private readonly store = new PendingScoreStore();
  private readonly inFlight = new Map<string, Promise<ScoreSubmitOutcome | null>>();
  private currentUserId: number | null = null;
  private started = false;

  constructor(
    private readonly api: MemeTowerApi,
    private readonly getLog: () => Logger,
  ) {}

  /** Подписки на сеть/видимость и отправка того, что осталось с прошлых запусков. */
  start(userId: number | null): void {
    this.currentUserId = userId;
    if (this.started) return;
    this.started = true;

    window.addEventListener('online', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.flush();
    });
    window.setInterval(() => this.flush(), BACKGROUND_FLUSH_INTERVAL_MS);
    this.flush();
  }

  /** Лучший ожидающий отправки результат (чтобы не показывать «лучший счёт» ниже уже набранного). */
  pendingScore(userId: number, chatId: number): number {
    return this.store.get(userId, chatId)?.score ?? 0;
  }

  submit(userId: number, chatId: number, score: number): Promise<ScoreSubmitOutcome | null> {
    this.store.put(userId, chatId, score);
    return this.drain(userId, chatId);
  }

  flush(): void {
    if (this.currentUserId === null) return;
    for (const entry of this.store.listForUser(this.currentUserId)) {
      void this.drain(entry.userId, entry.chatId);
    }
  }

  /** Отправляет ожидающий результат пары пользователь + чат; одновременно — не больше одного запроса. */
  private drain(userId: number, chatId: number): Promise<ScoreSubmitOutcome | null> {
    const key = `${userId}:${chatId}`;
    const running = this.inFlight.get(key);
    if (running) {
      // Пока шёл запрос, мог появиться результат выше — после него отправим заново.
      return running.then(() => this.drain(userId, chatId));
    }

    const promise = this.send(userId, chatId).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async send(userId: number, chatId: number): Promise<ScoreSubmitOutcome | null> {
    let outcome: ScoreSubmitOutcome | null = null;

    for (let attempt = 0; ; attempt++) {
      const entry = this.store.get(userId, chatId);
      if (!entry) return outcome;

      const log = this.getLog();
      try {
        // keepalive — чтобы запрос долетел, даже если Mini App закрыли сразу после проигрыша.
        // На повторах без него: в части WebView keepalive-запросы с preflight падают.
        const result = await this.api.submitScore({ userId, chatId, score: entry.score }, attempt === 0);
        this.store.resolve(userId, chatId, entry.score);
        log.info('score submitted successfully', { score: entry.score, attempt, ...result });
        outcome = { ...result, saved: true, submittedScore: entry.score };
        attempt = -1;
        continue; // если за это время появился результат выше — отправим и его
      } catch (error) {
        const status = error instanceof ScoreRequestError ? error.status : null;
        log.error('failed to submit score', { score: entry.score, attempt, status, error: String(error) });

        if (status === 400) {
          // Сервер отверг данные — повтор ничего не даст.
          this.store.drop(userId, chatId);
          return { saved: false, submittedScore: entry.score };
        }
        // 401 (протух initData) и 404 (пользователь неизвестен боту) в этой сессии не лечатся —
        // результат остаётся в очереди до фонового повтора или следующего запуска.
        if (status === 401 || status === 404 || attempt >= RETRY_DELAYS_MS.length) {
          return { saved: false, submittedScore: entry.score };
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
