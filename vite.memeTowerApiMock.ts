import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Plugin } from 'vite';

interface MockLeaderboardEntry {
  userId: number;
  userName: string | null;
  score: number;
}

const SATURN_API_PREFIX = '/saturn-api';
const MEME_TOWER_API_PATH = '/api/meme-tower';
const LOGS_API_PATH = '/api/logs';
const MOCK_LEADERBOARD: MockLeaderboardEntry[] = [
  { userId: 101, userName: 'Трич', score: 37 },
  { userId: 102, userName: 'Олег', score: 28 },
  { userId: 103, userName: 'Seesh', score: 21 },
  { userId: 104, userName: 'Moon', score: 14 },
  { userId: 105, userName: 'Grappy', score: 9 },
];

/** Мок Saturn API для dev-сервера: таблица лидеров «Мемного трича» в памяти и приём логов. */
export function memeTowerApiMockPlugin(): Plugin {
  const scores = new Map<number, MockLeaderboardEntry>(MOCK_LEADERBOARD.map((entry) => [entry.userId, entry]));

  return {
    name: 'meme-tower-api-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = getMockApiUrl(request);

        if (!url) {
          next();
          return;
        }

        try {
          if (request.method === 'POST' && url.pathname === LOGS_API_PATH) {
            await readJsonBody(request);
            response.statusCode = 204;
            response.end();
            return;
          }

          if (request.method === 'GET' && url.pathname === `${MEME_TOWER_API_PATH}/leaderboard`) {
            const limit = Number(url.searchParams.get('limit') ?? 10);
            sendJson(response, getLeaderboard(scores, limit));
            return;
          }

          const scoreMatch = url.pathname.match(/^\/api\/meme-tower\/score\/(\d+)$/);
          if (request.method === 'GET' && scoreMatch) {
            const userScore = scores.get(Number(scoreMatch[1]));

            if (!userScore) {
              response.statusCode = 404;
              response.end();
              return;
            }

            sendJson(response, userScore);
            return;
          }

          if (request.method === 'POST' && url.pathname === `${MEME_TOWER_API_PATH}/score`) {
            const body = await readJsonBody(request);
            const entry = normalizeScoreRequest(body);
            const previous = scores.get(entry.userId);
            const bestScore = Math.max(entry.score, previous?.score ?? 0);

            scores.set(entry.userId, { ...entry, score: bestScore });

            sendJson(response, {
              bestScore,
              isNewRecord: previous ? entry.score > previous.score : entry.score > 0,
            });
            return;
          }

          sendJson(response, { message: 'Mock endpoint not found' }, 404);
        } catch (error) {
          sendJson(response, { message: error instanceof Error ? error.message : 'Mock API error' }, 400);
        }
      });
    },
  };
}

function getMockApiUrl(request: IncomingMessage): URL | null {
  const requestUrl = request.url ?? '';

  if (!requestUrl.startsWith(SATURN_API_PREFIX)) {
    return null;
  }

  const url = new URL(requestUrl, 'http://localhost');
  url.pathname = url.pathname.replace(SATURN_API_PREFIX, '');

  if (!url.pathname.startsWith(MEME_TOWER_API_PATH) && url.pathname !== LOGS_API_PATH) {
    return null;
  }

  return url;
}

function getLeaderboard(scores: Map<number, MockLeaderboardEntry>, limit: number): MockLeaderboardEntry[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;

  return [...scores.values()].sort((left, right) => right.score - left.score).slice(0, safeLimit);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : null;
}

function normalizeScoreRequest(body: unknown): MockLeaderboardEntry {
  if (!body || typeof body !== 'object') {
    throw new Error('Score request body must be an object');
  }

  const record = body as Record<string, unknown>;
  const userId = Number(record.userId);
  const score = Number(record.score);

  if (!Number.isSafeInteger(userId) || !Number.isFinite(score)) {
    throw new Error('Score request body contains invalid userId or score');
  }

  return {
    userId,
    userName: `Игрок ${userId}`,
    score: Math.max(0, Math.floor(score)),
  };
}

function sendJson(response: ServerResponse, data: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(data));
}
