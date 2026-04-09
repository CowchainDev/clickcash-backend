// ── Simulation Types ──

export interface SimTick {
  rawPrice: number;
  emaPrice: number;
  timestamp: number; // ms
}

export interface SimCell {
  low: number;
  high: number;
}

export interface SimBet {
  id: string;
  userId: string;
  cell: SimCell;
  cellSide: 'up' | 'down' | 'center';
  slotMs: number;
  stake: number;
  multiplier: number;
  potentialPayout: number;
  placedPrice: number;
  placedAt: number; // sim time ms
  status: 'active' | 'won' | 'lost';
  settlementPrice?: number;
  settledAt?: number;
}

export interface SimUserState {
  id: string;
  balance: number;
  sessionLoss: number;
  lastBetMs: number;
  strategyName: string;
  betCount: number;
  winCount: number;
  totalStaked: number;
  totalWon: number;
}

export interface BacktestTick {
  simTimeMs: number;
  emaPrice: number;
  platformPnl: number;
  exposure: number;
  activeBets: number;
  totalBets: number;
  totalWon: number;
  totalLost: number;
  winRate: number;
  avgMultiplier: number;
  liabilityUp: number;
  liabilityDown: number;
  totalStaked: number;
  totalPaidOut: number;
  usersActive: number;
  avgUserBalance: number;
  killSwitchActive: boolean;
}

export interface BacktestConfig {
  startTime: number; // ms
  endTime: number;   // ms
  numUsers: number;
  speedMultiplier: number;
  strategyMix: {
    random: number;
    centerBiased: number;
    edgeChaser: number;
    streakFollower: number;
  };
}

export interface MultiplierResult {
  x: number;
  blocked: boolean;
}

export interface ActivityEvent {
  id: number;
  simTimeMs: number;
  type: 'bet_placed' | 'bet_won' | 'bet_lost' | 'user_quit' | 'user_joined' | 'user_broke' | 'user_tilt' | 'user_break' | 'kill_switch';
  userId: string;
  strategy: string;
  details: string;
  amount?: number;
  pnlImpact?: number; // positive = platform earns, negative = platform pays
}

export type CellSide = 'up' | 'down' | 'center';
export type DirectionStatus = 'normal' | 'pressured' | 'crushed' | 'blocked';
