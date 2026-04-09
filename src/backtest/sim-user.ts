import type { SimUserState } from './types';
import type { UserStrategy } from './user-strategies';
import { createStrategy } from './user-strategies';

/**
 * Simulated user with realistic human behavior:
 * - Emotional state affects betting (tilt after losses, confidence after wins)
 * - Users quit after a personal loss threshold (not just session limit)
 * - Bet frequency varies (excited after win → bets faster, cautious after loss)
 * - Users take breaks randomly
 * - Stake sizing changes with emotional state
 */
export class SimUser {
  state: SimUserState;
  strategy: UserStrategy;

  // Behavioral state
  private consecutiveLosses = 0;
  private consecutiveWins = 0;
  private personalQuitThreshold: number; // each user has different pain tolerance
  private hasQuit = false;
  private onBreakUntil = 0; // sim time ms when break ends
  private excitement = 1.0; // 0.5 = cautious, 1.0 = normal, 2.0 = tilted/excited
  private depositCount = 0; // how many times they've re-deposited
  private maxDeposits: number; // some users redeposit, some don't

  constructor(strategyName: string, startingBalance = 100) {
    const id = Math.random().toString(36).substring(2, 10);
    this.strategy = createStrategy(strategyName);

    // Realistic starting balance: most users deposit $50-200, not $1000
    const balance = startingBalance || randomBetween(50, 200);

    // Personal quit threshold: most quit after losing $30-150
    this.personalQuitThreshold = randomBetween(30, 150);

    // Some users will redeposit 0-3 times
    this.maxDeposits = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : randomInt(2, 3);

    this.state = {
      id,
      balance,
      sessionLoss: 0,
      lastBetMs: 0,
      strategyName,
      betCount: 0,
      winCount: 0,
      totalStaked: 0,
      totalWon: 0,
    };
  }

  canBet(simTime: number): boolean {
    if (this.hasQuit) return false;
    if (this.state.balance < 5) {
      // Try to redeposit
      if (this.depositCount < this.maxDeposits) {
        this.depositCount++;
        const redeposit = randomBetween(30, 100);
        this.state.balance += redeposit;
        this.consecutiveLosses = 0;
        this.excitement = 1.0;
        // Excitement bump from fresh money
      } else {
        this.hasQuit = true;
        return false;
      }
    }

    // Personal quit threshold
    if (this.state.sessionLoss >= this.personalQuitThreshold) {
      // 70% chance to actually quit, 30% to keep going (gambling addiction behavior)
      if (Math.random() < 0.7) {
        this.hasQuit = true;
        return false;
      }
      // If they don't quit, raise threshold a bit (moving goalposts)
      this.personalQuitThreshold += randomBetween(20, 50);
    }

    // On break?
    if (simTime < this.onBreakUntil) return false;

    // Cooldown adjusted by excitement
    const baseCooldown = this.strategy.getBetIntervalMs();
    const adjustedCooldown = baseCooldown / this.excitement;
    if (simTime - this.state.lastBetMs < adjustedCooldown) return false;

    // Random chance to skip a round (real users don't bet every opportunity)
    if (Math.random() < 0.3) return false;

    return true;
  }

  getStakeMultiplier(): number {
    // Tilted users bet bigger, cautious users bet smaller
    return Math.max(0.3, Math.min(2.5, this.excitement));
  }

  onWin(payout: number, simTime: number) {
    this.state.balance += payout;
    this.state.winCount++;
    this.state.totalWon += payout;
    this.consecutiveWins++;
    this.consecutiveLosses = 0;

    // Excitement increases after wins
    this.excitement = Math.min(2.0, this.excitement + 0.15);

    // Some users take a break after a big win (cash out psychology)
    if (payout > 100 && Math.random() < 0.25) {
      this.onBreakUntil = simTime + randomBetween(10000, 30000);
    }

    // Small chance to quit while ahead (smart users)
    if (this.state.balance > 300 && Math.random() < 0.05) {
      this.hasQuit = true;
    }
  }

  onLoss(stake: number, simTime: number) {
    this.state.sessionLoss += stake;
    this.consecutiveLosses++;
    this.consecutiveWins = 0;

    // After 3+ consecutive losses: tilt behavior
    if (this.consecutiveLosses >= 3) {
      // 40% tilt (bet bigger, faster), 40% cautious (bet smaller, slower), 20% take break
      const reaction = Math.random();
      if (reaction < 0.4) {
        this.excitement = Math.min(2.5, this.excitement + 0.3); // tilt
      } else if (reaction < 0.8) {
        this.excitement = Math.max(0.4, this.excitement - 0.2); // cautious
      } else {
        this.onBreakUntil = simTime + randomBetween(15000, 60000); // take break
        this.excitement = 0.8;
      }
    }

    // After 5+ losses: high chance to quit
    if (this.consecutiveLosses >= 5 && Math.random() < 0.4) {
      this.hasQuit = true;
    }
  }

  deductStake(amount: number, simTime: number) {
    this.state.balance -= amount;
    this.state.lastBetMs = simTime;
    this.state.betCount++;
    this.state.totalStaked += amount;
  }

  // Legacy compatibility
  creditWin(payout: number) { /* handled by onWin */ }
  addLoss(stake: number) { /* handled by onLoss */ }

  isActive(): boolean {
    return !this.hasQuit && this.state.balance >= 5;
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createUsers(
  numUsers: number,
  strategyMix: { random: number; centerBiased: number; edgeChaser: number; streakFollower: number },
): SimUser[] {
  const users: SimUser[] = [];
  const total = strategyMix.random + strategyMix.centerBiased + strategyMix.edgeChaser + strategyMix.streakFollower;

  const counts = {
    Random: Math.round((strategyMix.random / total) * numUsers),
    CenterBiased: Math.round((strategyMix.centerBiased / total) * numUsers),
    EdgeChaser: Math.round((strategyMix.edgeChaser / total) * numUsers),
    StreakFollower: Math.round((strategyMix.streakFollower / total) * numUsers),
  };

  let created = 0;
  for (const [strategy, count] of Object.entries(counts)) {
    for (let i = 0; i < count && created < numUsers; i++) {
      users.push(new SimUser(strategy));
      created++;
    }
  }
  while (created < numUsers) {
    users.push(new SimUser('Random'));
    created++;
  }

  return users;
}
