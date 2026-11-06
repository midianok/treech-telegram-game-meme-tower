export class GameSession {
  score = 0;
  bestScore = 0;
  started = false;
  gameOver = false;

  reset(bestScore: number): void {
    this.score = 0;
    this.bestScore = bestScore;
    this.started = false;
    this.gameOver = false;
  }

  start(): void {
    this.started = true;
  }

  end(): void {
    this.gameOver = true;
  }

  addPoint(): number {
    this.score += 1;
    return this.score;
  }

  commitBestScore(): boolean {
    if (this.score <= this.bestScore) {
      return false;
    }

    this.bestScore = this.score;
    return true;
  }

  get isRunning(): boolean {
    return this.started && !this.gameOver;
  }
}
