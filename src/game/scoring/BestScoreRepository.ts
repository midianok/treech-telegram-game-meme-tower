import { STORAGE_BEST_SCORE_KEY } from '../constants';

export class BestScoreRepository {
  read(): number {
    const savedScore = localStorage.getItem(STORAGE_BEST_SCORE_KEY);
    return savedScore === null ? 0 : Number(savedScore) || 0;
  }

  write(score: number): void {
    localStorage.setItem(STORAGE_BEST_SCORE_KEY, String(score));
  }
}
