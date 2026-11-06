import i18next, { type TOptions } from 'i18next';

const DEFAULT_LANGUAGE = 'ru';

const resources = {
  ru: {
    translation: {
      app: {
        language: 'ru',
        title: 'Мемный трич',
        description: 'Башня из мемов: роняй коробки точно друг на друга',
      },
      hud: {
        title: 'Мемный трич',
        subtitle: 'Тапни, когда коробка окажется над башней.\nВсё, что свисает, отрежется.',
        startPrompt: 'Тапни или нажми пробел',
        bestScore: 'Лучший счёт: {{score}}',
        bestScoreLoading: 'Лучший счёт: ...',
        bestScoreUnavailable: 'Лучший счёт: недоступен',
        gameOverTitle: 'Башня рухнула!',
        newRecord: 'Новый рекорд!',
        restart: 'Ещё раз',
        restartHint: 'или тапни / нажми пробел',
        leaderboardTitle: 'ТОП СТРОИТЕЛЕЙ',
        leaderboardEmpty: 'Пока никто не построил башню',
        leaderboardError: 'Таблица лидеров недоступна',
        leaderboardLoading: 'Загружаем таблицу лидеров...',
        playerFallback: 'Игрок {{userId}}',
        perfect: 'Идеально!',
        soundOn: 'Звук включён',
        soundOff: 'Звук выключен',
      },
      log: {
        failedToLoadUserScore: 'Failed to load MemeTower user score',
        failedToSyncLeaderboard: 'Failed to sync MemeTower leaderboard',
        failedToSyncUserScore: 'Failed to sync MemeTower user score',
        failedToLoadMeme: 'Failed to load meme',
      },
      api: {
        invalidLeaderboardEntryNumbers: 'MemeTower leaderboard entry contains invalid numbers',
        leaderboardEntryNotObject: 'MemeTower leaderboard entry is not an object',
        leaderboardRequestFailed: 'MemeTower leaderboard request failed with {{status}}',
        leaderboardResponseNotArray: 'MemeTower leaderboard response is not an array',
        scoreRequestFailed: 'MemeTower score request failed with {{status}}',
        userScoreRequestFailed: 'MemeTower user score request failed with {{status}}',
      },
    },
  },
} as const;

void i18next.init({
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  lng: DEFAULT_LANGUAGE,
  resources,
});

export function t(key: string, options?: TOptions): string {
  return i18next.t(key, options);
}
