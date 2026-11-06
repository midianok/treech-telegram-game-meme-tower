import { type Logger, logger } from '../api/logger';
import { MemeTowerApi } from '../api/memeTower';
import { t } from '../i18n';
import {
  getTelegramPlayerContext,
  hapticImpact,
  hapticNotification,
  onTelegramViewportChanged,
} from '../telegram';
import { muted, preloadFinishSounds, setMuted, sfx } from './audio/sfx';
import { getGameViewportSize } from './config';
import { CFG, STORAGE_MUTED_KEY } from './constants';
import { getBoxSpeed } from './difficulty';
import { registerGameInput } from './input/registerGameInput';
import { MemeLibrary } from './memes/MemeLibrary';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { GameView } from './render/GameView';
import { BestScoreRepository } from './scoring/BestScoreRepository';
import { ScoreSubmitter } from './scoring/ScoreSubmitter';
import { GameSession } from './state/GameSession';
import { type LossReason, Tower } from './tower/Tower';
import { GameHud } from './ui/GameHud';

const MEME_ACTIVITY_INTERVAL_MS = 250;

/**
 * Игра целиком: сессия, башня, HUD и синхронизация счёта с Saturn API
 * (лучший счёт пользователя и таблица лидеров чата — как в «Наморево горе»).
 */
export class MemeTowerGame {
  private readonly session = new GameSession();
  private readonly bestScoreRepository = new BestScoreRepository();
  private readonly memeTowerApi = new MemeTowerApi();
  private readonly scoreSubmitter = new ScoreSubmitter(this.memeTowerApi, () => this.log);
  private readonly tower: Tower;

  private playerContext = getTelegramPlayerContext();
  private scoreSyncRequestId = 0;
  private bestScoreRequestId = 0;
  private userBestScoreLoaded = false;
  private log: Logger = logger;
  private gameOverTimer = -1;
  private newLocalRecord = false;
  private newServerRecord = false;
  private memeActivityTimer = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;

  /** Загрузка (физика, мемы) с прогрессом на экране загрузки, затем запуск игры. */
  static async boot(app: HTMLElement, hudRoot: HTMLElement): Promise<MemeTowerGame> {
    const progressEl = document.getElementById('loading-progress');
    const setProgress = (value: number) => {
      if (progressEl) progressEl.style.width = `${Math.round(value * 100)}%`;
    };

    const view = new GameView(app);
    // Фразы при проигрыше грузятся в фоне — до первого game over успевают.
    void preloadFinishSounds();
    // Основание ниже на высоких экранах, как в оригинале.
    const baseY = getGameViewportSize().height > 667 ? -3 : -2;
    const [physics, memes] = await Promise.all([
      PhysicsWorld.create(baseY),
      (async () => {
        const library = new MemeLibrary(view.renderer);
        await library.preload((value) => setProgress(0.1 + value * 0.9));
        return library;
      })(),
    ]);

    const game = new MemeTowerGame(view, physics, memes, new GameHud(hudRoot), baseY);
    game.start();
    if (import.meta.env.DEV) {
      // Отладка из консоли: __game.state и т.д.
      Object.defineProperty(window, '__game', {
        get: () => ({
          ...game.tower.debugState(),
          score: game.session.score,
          started: game.session.started,
          gameOver: game.session.gameOver,
          memes: memes.count,
        }),
      });
    }

    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      loadingScreen.addEventListener('transitionend', () => loadingScreen.remove(), { once: true });
    }
    return game;
  }

  private constructor(
    private readonly view: GameView,
    physics: PhysicsWorld,
    private readonly memes: MemeLibrary,
    private readonly hud: GameHud,
    baseY: number,
  ) {
    this.tower = new Tower(view, physics, memes, baseY, {
      placed: (perfect) => this.onBoxPlaced(perfect),
      lost: (reason) => this.endGame(reason),
    });
  }

  private start(): void {
    setMuted(readMuted());
    this.hud.create(0, {
      restart: () => this.resetGame(),
      toggleSound: () => {
        setMuted(!muted);
        writeMuted(muted);
        this.hud.setMuted(muted);
      },
    });
    this.hud.setMuted(muted);

    registerGameInput({
      action: () => this.handleAction(),
      isRunning: () => this.session.isRunning,
    });

    const handleViewportResize = () => this.resizeToViewport();
    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    onTelegramViewportChanged(handleViewportResize);
    this.resizeToViewport();

    this.createRound(true);
    // Досылаем результаты, которые не дошли до сервера в прошлых запусках.
    this.scoreSubmitter.start(this.playerContext?.userId ?? null);

    let lastTime = performance.now();
    this.view.renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      this.update(dt);
    });
  }

  /** Аналог FlappyScene.create(): новая сессия, лучший счёт с сервера (в Telegram) или из localStorage. */
  private createRound(showStartScreen: boolean): void {
    this.scoreSyncRequestId += 1;
    this.playerContext = getTelegramPlayerContext();
    this.userBestScoreLoaded = false;
    this.session.reset(this.playerContext ? 0 : this.bestScoreRepository.read());
    this.gameOverTimer = -1;

    this.log = logger.withContext({
      correlationId: crypto.randomUUID(),
      userId: this.playerContext?.userId ?? null,
      chatId: this.playerContext?.chatId ?? null,
    });
    this.log.info('round created', { localBestScore: this.session.bestScore, memeCount: this.memes.count });

    this.tower.reset();
    this.hud.reset(showStartScreen);
    this.hud.setBestScore(this.session.bestScore);

    if (this.playerContext) {
      this.hud.showBestScoreLoading();
      void this.loadUserBestScore(++this.bestScoreRequestId);
    }
  }

  private update(dt: number): void {
    this.tower.update(dt, getBoxSpeed(this.session.score));

    this.memeActivityTimer -= dt * 1000;
    if (this.memeActivityTimer <= 0) {
      this.memeActivityTimer = MEME_ACTIVITY_INTERVAL_MS;
      this.memes.setActive(this.tower.visibleMemes());
    }
    this.memes.update(dt * 1000);

    if (this.gameOverTimer > 0) {
      this.gameOverTimer -= dt;
      if (this.gameOverTimer <= 0) this.hud.showGameOver(this.session.score, this.isNewRecord());
    }

    this.view.update(dt);
    this.view.render();
  }

  private handleAction(): void {
    if (this.session.gameOver) {
      if (this.hud.isGameOverVisible) this.resetGame();
      return;
    }
    if (!this.session.started) {
      this.startGame();
      return;
    }
    this.tower.place();
  }

  private startGame(): void {
    this.log.info('game started', { bestScore: this.session.bestScore });
    this.session.start();
    this.hud.hideStartPrompt();
    this.tower.start();
    // Внутри жеста пользователя: видео-мемы точно смогут запуститься (iOS).
    this.memes.setActive(this.tower.visibleMemes());
    this.memes.resume();
  }

  private onBoxPlaced(perfect: boolean): void {
    const score = this.session.addPoint();
    this.hud.setScore(score);
    this.hud.animateScore();
    this.hud.setFade(score >= CFG.cameraFollowFrom);
    if (perfect) {
      hapticImpact('medium');
      sfx.perfect();
      this.hud.toast(t('hud.perfect'));
    } else {
      hapticImpact('light');
      sfx.land(score);
    }
  }

  private endGame(reason: LossReason): void {
    if (this.session.gameOver) {
      return;
    }

    this.log.info('game over', { score: this.session.score, bestScore: this.session.bestScore, reason });
    this.session.end();
    hapticNotification('error');
    sfx.over();
    this.hud.setFade(false);

    if (!this.playerContext && this.session.commitBestScore()) {
      this.bestScoreRepository.write(this.session.bestScore);
      this.newLocalRecord = true;
    }

    // Лучший счёт до этой игры — чтобы понять, рекорд ли это, если сервер не скажет сам.
    const previousBestScore = this.userBestScoreLoaded ? this.session.bestScore : null;

    if (!this.playerContext || this.userBestScoreLoaded) {
      this.hud.setBestScore(this.session.bestScore);
    }

    this.gameOverTimer = CFG.gameOverDelay;
    this.hud.showLeaderboardLoading();
    this.bestScoreRequestId += 1;
    void this.syncMemeTowerScore(++this.scoreSyncRequestId, this.session.score, previousBestScore);
  }

  private isNewRecord(): boolean {
    return this.session.score > 0 && (this.newLocalRecord || this.newServerRecord);
  }

  private resetGame(): void {
    if (!this.session.gameOver) {
      return;
    }

    this.newLocalRecord = false;
    this.newServerRecord = false;
    this.createRound(false);
    this.startGame();
  }

  private async loadUserBestScore(requestId: number): Promise<void> {
    if (!this.playerContext) {
      return;
    }

    try {
      const userScore = await this.memeTowerApi.getUserScore(this.playerContext.userId, this.playerContext.chatId);

      if (requestId !== this.bestScoreRequestId) {
        return;
      }

      // Неотправленный результат тоже считаем: он уже набран и дойдёт до сервера.
      const { userId, chatId } = this.playerContext;
      const bestScore = Math.max(userScore?.score ?? 0, this.scoreSubmitter.pendingScore(userId, chatId));
      this.session.bestScore = bestScore;
      this.userBestScoreLoaded = true;
      this.hud.setBestScore(bestScore);
      this.log.info('user best score loaded', { bestScore });
    } catch (error) {
      if (requestId !== this.bestScoreRequestId) {
        return;
      }

      console.error(t('log.failedToLoadUserScore'), error);
      this.log.error('failed to load user best score', { error: String(error) });
      this.userBestScoreLoaded = false;
      this.hud.showBestScoreUnavailable();
    }
  }

  private async syncMemeTowerScore(requestId: number, score: number, previousBestScore: number | null): Promise<void> {
    await this.submitScore(requestId, score, previousBestScore);

    try {
      const leaderboard = await this.memeTowerApi.getLeaderboard(this.playerContext?.chatId ?? 0);
      if (requestId !== this.scoreSyncRequestId) {
        return;
      }

      this.log.info('leaderboard loaded', { entryCount: leaderboard.length });
      this.hud.showLeaderboard(leaderboard, this.playerContext?.userId ?? null);
    } catch (error) {
      if (requestId !== this.scoreSyncRequestId) {
        return;
      }

      console.error(t('log.failedToSyncLeaderboard'), error);
      this.log.error('failed to load leaderboard', { error: String(error) });
      this.hud.showLeaderboardError();
    }
  }

  /**
   * Результат отправляется всегда, сразу и без предварительного запроса текущего рекорда:
   * максимум хранит сервер. Неудачная отправка остаётся в очереди `ScoreSubmitter` и будет повторена.
   */
  private async submitScore(requestId: number, score: number, previousBestScore: number | null): Promise<void> {
    if (!this.playerContext) {
      return;
    }

    const { userId, chatId } = this.playerContext;
    this.log.info('submitting score', { score, previousBestScore });

    // Рестарт не прерывает отправку — requestId проверяется только перед обновлением HUD.
    const outcome = await this.scoreSubmitter.submit(userId, chatId, score);

    if (requestId !== this.scoreSyncRequestId) {
      return;
    }

    if (!outcome?.saved) {
      console.error(t('log.failedToSyncUserScore'));
      if (!this.userBestScoreLoaded) {
        this.hud.showBestScoreUnavailable();
      }
      return;
    }

    const ownScore = outcome.submittedScore === score;
    const isNewRecord =
      outcome.isNewRecord !== undefined
        ? outcome.isNewRecord && ownScore
        : previousBestScore !== null && score > previousBestScore;
    let serverBestScore = outcome.bestScore;
    if (serverBestScore === undefined && !this.userBestScoreLoaded) {
      // Старый бэкенд не возвращает рекорд в ответе на POST — дочитываем отдельно.
      try {
        serverBestScore = (await this.memeTowerApi.getUserScore(userId, chatId))?.score ?? 0;
      } catch (error) {
        this.log.error('failed to fetch user score after submit', { score, error: String(error) });
      }
      if (requestId !== this.scoreSyncRequestId) {
        return;
      }
    }

    if (serverBestScore !== undefined || this.userBestScoreLoaded) {
      const bestScore = Math.max(this.session.bestScore, serverBestScore ?? 0, outcome.submittedScore);
      this.session.bestScore = bestScore;
      this.userBestScoreLoaded = true;
      this.hud.setBestScore(bestScore);
    } else {
      this.hud.showBestScoreUnavailable();
    }

    if (isNewRecord) {
      this.newServerRecord = true;
      this.hud.setNewRecord(this.isNewRecord());
    }
  }

  private resizeToViewport(): void {
    const { width, height } = getGameViewportSize();

    if (width === this.viewportWidth && height === this.viewportHeight) {
      return;
    }

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.view.resize(width, height);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_MUTED_KEY, value ? '1' : '0');
  } catch {
    /* приватный режим — не страшно */
  }
}
