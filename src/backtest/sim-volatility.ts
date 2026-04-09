import { SIGMA_DEFAULTS, SIGMA_FLOOR, calcCellSize } from './sim-math';

const BUFFER_MAX_AGE = 5 * 60 * 1000; // 5 minutes
const KILL_SWITCH_MULTIPLIER = 3;
const KILL_SWITCH_DURATION = 20000;

export class SimVolatility {
  private emaBuffer: { t: number; p: number }[] = [];
  private sigmas: Map<number, number> = new Map();
  private sigmaHistory: number[] = [];
  private _cellSize = 10;
  private lastCellSizeUpdate = 0;
  private bettingPausedUntil = 0;
  private prevEma: number | null = null;
  private recentMoves: { move: number; t: number }[] = [];

  get cellSize(): number { return this._cellSize; }
  get isBettingPaused(): boolean { return Date.now() < this.bettingPausedUntil; }

  isBettingPausedAt(simTime: number): boolean {
    return simTime < this.bettingPausedUntil;
  }

  pushPrice(emaPrice: number, timestamp: number) {
    this.emaBuffer.push({ t: timestamp, p: emaPrice });
    // Trim old entries
    while (this.emaBuffer.length > 0 && timestamp - this.emaBuffer[0].t > BUFFER_MAX_AGE) {
      this.emaBuffer.shift();
    }

    // Kill switch check
    if (this.prevEma !== null) {
      const move = Math.abs(emaPrice - this.prevEma);
      this.recentMoves.push({ move, t: timestamp });
      while (this.recentMoves.length > 0 && timestamp - this.recentMoves[0].t > 5000) {
        this.recentMoves.shift();
      }
      if (this.recentMoves.length >= 5) {
        const avgMove = this.recentMoves.reduce((s, m) => s + m.move, 0) / this.recentMoves.length;
        const sigma10s = this.getSigma(10);
        const normalMove = sigma10s / 20;
        if (avgMove > normalMove * KILL_SWITCH_MULTIPLIER) {
          this.bettingPausedUntil = timestamp + KILL_SWITCH_DURATION;
        }
      }
    }
    this.prevEma = emaPrice;

    // Update sigmas
    for (const horizon of [10, 15, 20]) {
      const realized = this.computeRealizedSigma(horizon);
      const floor = SIGMA_FLOOR[horizon];
      this.sigmas.set(horizon, realized !== null ? Math.max(realized, floor) : SIGMA_DEFAULTS[horizon]);
    }

    // Update cell size every 30s
    if (timestamp - this.lastCellSizeUpdate >= 30000) {
      this._cellSize = calcCellSize(this.getSigma(10));
      this.lastCellSizeUpdate = timestamp;
    }
  }

  getSigma(horizon: number): number {
    return this.sigmas.get(horizon) ?? SIGMA_DEFAULTS[horizon];
  }

  getSigmaMedian24h(): number {
    if (this.sigmaHistory.length < 10) return SIGMA_DEFAULTS[10];
    const sorted = [...this.sigmaHistory].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  recordSigmaForHistory() {
    this.sigmaHistory.push(this.getSigma(10));
    if (this.sigmaHistory.length > 2880) this.sigmaHistory.shift();
  }

  getRecentTrend(): number {
    if (this.emaBuffer.length < 10) return 0;
    const recent = this.emaBuffer.slice(-10);
    return recent[recent.length - 1].p - recent[0].p;
  }

  private computeRealizedSigma(horizonSec: number): number | null {
    const horizonMs = horizonSec * 1000;
    const deltas: number[] = [];

    for (let i = 0; i < this.emaBuffer.length; i++) {
      const targetTime = this.emaBuffer[i].t + horizonMs;
      const future = this.emaBuffer.find(x => Math.abs(x.t - targetTime) < 1000);
      if (future) {
        deltas.push(future.p - this.emaBuffer[i].p);
      }
    }

    if (deltas.length < 30) return null;
    const variance = deltas.reduce((sum, d) => sum + d * d, 0) / deltas.length;
    return Math.sqrt(variance);
  }
}
