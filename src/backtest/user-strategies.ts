import type { SimCell } from './types';

export interface UserStrategy {
  name: string;
  pickCell(cells: SimCell[], emaPrice: number, cellSize: number, recentTrend: number): SimCell | null;
  pickStake(balance: number, multiplier: number): number;
  getBetIntervalMs(): number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * "Casual" — most common user type.
 * Picks cells somewhat near the price, stakes $5-25.
 * Bets infrequently, sometimes skips rounds entirely.
 * This is someone casually trying the app on their phone.
 */
export class CasualStrategy implements UserStrategy {
  name = 'Casual';

  pickCell(cells: SimCell[], emaPrice: number): SimCell | null {
    if (cells.length === 0) return null;
    // Prefers cells near price but not always — sometimes random
    if (Math.random() < 0.3) {
      // Random pick (30% of the time — "let me try this one")
      return cells[randInt(0, cells.length - 1)];
    }
    // Otherwise gravitates toward center (70%)
    const center = Math.floor(cells.length / 2);
    const offset = Math.round((Math.random() - 0.5) * 4); // -2 to +2
    const idx = Math.max(0, Math.min(cells.length - 1, center + offset));
    return cells[idx];
  }

  pickStake(balance: number): number {
    // Conservative — bets 5-15% of balance, rounded to $5
    const pct = 0.05 + Math.random() * 0.10;
    const raw = balance * pct;
    return Math.max(5, Math.min(25, Math.round(raw / 5) * 5));
  }

  getBetIntervalMs(): number {
    return randInt(4000, 10000); // 4-10 seconds — not spamming
  }
}

/**
 * "Gambler" — chases big multipliers.
 * Picks far cells hoping for a big payout.
 * Stakes small but bets frequently.
 * Gets excited after wins, tilts hard after losses.
 */
export class GamblerStrategy implements UserStrategy {
  name = 'Gambler';

  pickCell(cells: SimCell[], emaPrice: number): SimCell | null {
    if (cells.length === 0) return null;
    // Strongly prefers edges (high multiplier cells)
    const edges = cells.filter((c) => {
      const dist = Math.abs((c.low + c.high) / 2 - emaPrice);
      return dist > 15; // far from price
    });
    if (edges.length > 0) return edges[randInt(0, edges.length - 1)];
    // Fallback: any cell
    return cells[randInt(0, cells.length - 1)];
  }

  pickStake(balance: number): number {
    // Bets small — $5-15 per bet (lots of lottery tickets)
    return Math.max(5, Math.min(15, Math.round(balance * 0.08 / 5) * 5));
  }

  getBetIntervalMs(): number {
    return randInt(2000, 5000); // fast — always placing bets
  }
}

/**
 * "Analyst" — studies the chart, bets with the trend.
 * Picks cells in the direction the price is moving.
 * Medium stakes, medium frequency.
 * Most likely to be profitable or break even.
 */
export class AnalystStrategy implements UserStrategy {
  name = 'Analyst';

  pickCell(cells: SimCell[], emaPrice: number, _cellSize: number, recentTrend: number): SimCell | null {
    if (cells.length === 0) return null;

    // Bets with the trend, but not too far
    const direction = recentTrend > 0 ? 'up' : 'down';
    const preferred = cells.filter((c) => {
      const center = (c.low + c.high) / 2;
      const dist = Math.abs(center - emaPrice);
      const isRight = direction === 'up' ? center > emaPrice : center < emaPrice;
      return isRight && dist < 30; // not too far
    });

    if (preferred.length > 0) return preferred[randInt(0, preferred.length - 1)];

    // If no trend, pick near center
    const center = Math.floor(cells.length / 2);
    return cells[center];
  }

  pickStake(balance: number): number {
    // Moderate — 8-12% of balance
    const pct = 0.08 + Math.random() * 0.04;
    return Math.max(5, Math.min(50, Math.round(balance * pct / 5) * 5));
  }

  getBetIntervalMs(): number {
    return randInt(5000, 12000); // patient — waits for the right moment
  }
}

/**
 * "Whale" — high roller, big bets, less frequent.
 * Picks center cells (plays it safe-ish with big money).
 * Stakes $25-100.
 * Quits quickly if losing.
 */
export class WhaleStrategy implements UserStrategy {
  name = 'Whale';

  pickCell(cells: SimCell[], emaPrice: number): SimCell | null {
    if (cells.length === 0) return null;
    // Almost always picks center or 1 cell away
    const center = Math.floor(cells.length / 2);
    const offset = Math.round((Math.random() - 0.5) * 2);
    return cells[Math.max(0, Math.min(cells.length - 1, center + offset))];
  }

  pickStake(balance: number): number {
    // Big — 15-25% of balance
    const pct = 0.15 + Math.random() * 0.10;
    return Math.max(25, Math.min(100, Math.round(balance * pct / 5) * 5));
  }

  getBetIntervalMs(): number {
    return randInt(8000, 20000); // very patient
  }
}

/**
 * "Martingale" — doubles down after losses.
 * Dangerous for the platform if they hit a win streak,
 * but usually goes broke fast.
 */
export class MartingaleStrategy implements UserStrategy {
  name = 'Martingale';
  private lastStake = 5;
  private lastWon = true;

  pickCell(cells: SimCell[], emaPrice: number): SimCell | null {
    if (cells.length === 0) return null;
    // Picks center cells (needs high probability for martingale to work)
    const center = Math.floor(cells.length / 2);
    return cells[center];
  }

  pickStake(balance: number, multiplier: number): number {
    if (this.lastWon) {
      this.lastStake = 5; // reset after win
    } else {
      this.lastStake = Math.min(this.lastStake * 2, 100); // double after loss
    }
    return Math.min(this.lastStake, balance, 100);
  }

  getBetIntervalMs(): number {
    return randInt(3000, 6000);
  }

  // Called externally to track win/loss
  recordResult(won: boolean) {
    this.lastWon = won;
  }
}

export function createStrategy(name: string): UserStrategy {
  switch (name) {
    case 'Casual': return new CasualStrategy();
    case 'Gambler': return new GamblerStrategy();
    case 'Analyst': return new AnalystStrategy();
    case 'Whale': return new WhaleStrategy();
    case 'Martingale': return new MartingaleStrategy();
    // Legacy compatibility
    case 'Random': return new CasualStrategy();
    case 'CenterBiased': return new AnalystStrategy();
    case 'EdgeChaser': return new GamblerStrategy();
    case 'StreakFollower': return new AnalystStrategy();
    default: return new CasualStrategy();
  }
}
