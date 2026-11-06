# Мемный трич

Изометрическая игра-«башня» (жанр Stack) для Telegram Mini App: коробка с мемом выезжает сбоку,
тапни, чтобы положить её на башню. Всё, что свисает, отрезается и падает, следующие коробки
становятся меньше. Почти точное попадание (≤ 5%) — «идеально»: коробка встаёт ровно, без обрезки.
Каждые 3 коробки она едет чуть быстрее.

Стек как у «Наморево горе»: TypeScript + Vite, i18next, Telegram WebApp SDK, Saturn API
(лучший счёт пользователя и таблица лидеров чата). Рендер — three.js, физика — Rapier.

## Команды

```bash
npm install
npm run dev      # dev-сервер на 0.0.0.0 с моком Saturn API
npm run build    # tsc + vite build
npm run preview
```

## Мемы

Положи файлы в `src/assets/memes/` — подхватятся автоматически:

- картинки: jpg, png, webp, avif, svg;
- анимированные: **gif** (анимируется), **mp4 / webm / mov** (без звука, по кругу).

Мем обрезается до квадрата по центру и целиком занимает коробку исходного размера; у обрезанных
коробок видна соответствующая часть мема. Анимация идёт только у мемов, видимых на экране.

## Управление

- тап / клик / любая клавиша во время игры — положить коробку;
- старт и рестарт — тап, `Space`, `Enter`, `R` или кнопка «Ещё раз».

## Telegram и API

- Запуск из бота: `https://t.me/<bot>/memnytrich?startapp=<chatId>` (команда `мемный трич`).
  Mini App с short name `memnytrich` нужно создать в BotFather (`/newapp`) с URL задеплоенной игры
  (`https://midianok.github.io/treech-telegram-game-meme-tower/`).
- `POST /saturn-api/api/meme-tower/score`, `GET .../score/{userId}?chatId=`, `GET .../leaderboard?chatId=&limit=10`,
  заголовок `X-Telegram-Init-Data`. Вне Telegram лучший счёт хранится в `localStorage`.
- Деплой: GitHub Pages (`.github/workflows/gh-pages.yml`), `VITE_BASE_PATH=/treech-telegram-game-meme-tower/`,
  `VITE_API_BASE_URL=https://routefabric.ru/saturn-api`.
