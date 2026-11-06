import type { MemeTowerLeaderboardEntry } from '../../api/memeTower';
import { t } from '../../i18n';

const LEADERBOARD_SIZE = 10;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Интерфейс поверх 3D-сцены (DOM): счёт, лучший счёт, стартовый экран,
 * экран проигрыша с таблицей лидеров чата.
 */
export class GameHud {
  private readonly scoreText = el('div', 'hud-score', '0');
  private readonly bestText = el('div', 'hud-best');
  private readonly soundButton = el('button', 'icon-btn hud-sound');
  private readonly toastText = el('div', 'hud-toast');
  private readonly fade = el('div', 'hud-fade');
  private readonly startScreen = el('section', 'overlay');
  private readonly overScreen = el('section', 'overlay hidden');
  private readonly finalScore = el('div', 'final-score', '0');
  private readonly finalNote = el('div', 'final-note');
  private readonly leaderboardStatus = el('div', 'leaderboard-status');
  private readonly leaderboardRows = el('ol', 'leaderboard-rows');
  private readonly restartButton = el('button', 'btn primary', t('hud.restart'));

  constructor(private readonly root: HTMLElement) {}

  create(bestScore: number, handlers: { restart(): void; toggleSound(): void }): void {
    this.soundButton.type = 'button';
    this.soundButton.addEventListener('click', handlers.toggleSound);
    this.restartButton.type = 'button';
    this.restartButton.addEventListener('click', handlers.restart);

    this.startScreen.append(
      el('h1', 'title', t('hud.title')),
      el('p', 'subtitle', t('hud.subtitle')),
      el('div', 'tap-hint', t('hud.startPrompt')),
    );

    const panel = el('div', 'leaderboard');
    panel.append(el('div', 'leaderboard-title', t('hud.leaderboardTitle')), this.leaderboardStatus, this.leaderboardRows);
    this.overScreen.append(
      el('h2', 'over-title', t('hud.gameOverTitle')),
      this.finalScore,
      this.finalNote,
      panel,
      this.restartButton,
      el('div', 'restart-hint', t('hud.restartHint')),
    );

    this.root.append(
      this.fade,
      this.scoreText,
      this.bestText,
      this.soundButton,
      this.toastText,
      this.startScreen,
      this.overScreen,
    );
    this.setBestScore(bestScore);
  }

  /** Состояние «новая игра»: счёт 0, экраны скрыты (или показан стартовый). */
  reset(showStart: boolean): void {
    this.setScore(0);
    this.setFade(false);
    this.overScreen.classList.add('hidden');
    this.startScreen.classList.toggle('hidden', !showStart);
  }

  hideStartPrompt(): void {
    this.startScreen.classList.add('hidden');
  }

  get isGameOverVisible(): boolean {
    return !this.overScreen.classList.contains('hidden');
  }

  setScore(score: number): void {
    this.scoreText.textContent = String(score);
  }

  animateScore(): void {
    this.scoreText.classList.remove('bump');
    void this.scoreText.offsetWidth; // перезапуск CSS-анимации
    this.scoreText.classList.add('bump');
  }

  setFade(visible: boolean): void {
    this.fade.classList.toggle('visible', visible);
  }

  setBestScore(bestScore: number): void {
    this.bestText.textContent = t('hud.bestScore', { score: bestScore });
  }

  showBestScoreLoading(): void {
    this.bestText.textContent = t('hud.bestScoreLoading');
  }

  showBestScoreUnavailable(): void {
    this.bestText.textContent = t('hud.bestScoreUnavailable');
  }

  setMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? '🔇' : '🔊';
    this.soundButton.setAttribute('aria-label', muted ? t('hud.soundOff') : t('hud.soundOn'));
  }

  toast(text: string): void {
    this.toastText.textContent = text;
    this.toastText.classList.remove('show');
    void this.toastText.offsetWidth;
    this.toastText.classList.add('show');
  }

  showGameOver(score: number, isNewRecord: boolean): void {
    this.finalScore.textContent = String(score);
    this.finalNote.textContent = isNewRecord ? t('hud.newRecord') : '';
    this.overScreen.classList.remove('hidden');
  }

  setNewRecord(isNewRecord: boolean): void {
    this.finalNote.textContent = isNewRecord ? t('hud.newRecord') : '';
  }

  showLeaderboardLoading(): void {
    this.leaderboardStatus.textContent = t('hud.leaderboardLoading');
    this.leaderboardStatus.hidden = false;
    this.leaderboardRows.replaceChildren();
  }

  showLeaderboard(entries: MemeTowerLeaderboardEntry[], currentUserId: number | null): void {
    this.leaderboardStatus.textContent = t('hud.leaderboardEmpty');
    this.leaderboardStatus.hidden = entries.length > 0;
    this.leaderboardRows.replaceChildren(
      ...entries.slice(0, LEADERBOARD_SIZE).map((entry, index) => {
        const row = el('li', currentUserId === entry.userId ? 'leaderboard-row current' : 'leaderboard-row');
        row.append(
          el('span', 'place', `${index + 1}.`),
          el('span', 'name', entry.userName?.trim() || t('hud.playerFallback', { userId: entry.userId })),
          el('span', 'score', String(entry.score)),
        );
        return row;
      }),
    );
  }

  showLeaderboardError(message = t('hud.leaderboardError')): void {
    this.leaderboardStatus.textContent = message;
    this.leaderboardStatus.hidden = false;
    this.leaderboardRows.replaceChildren();
  }
}
