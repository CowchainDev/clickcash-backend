import { Injectable } from '@nestjs/common';

const SLOT_INTERVAL = 10000; // 10 seconds
const MIN_TIME_TO_EXPIRY = 10000;
const SETTLING_THRESHOLD = 3000;

@Injectable()
export class SlotsService {
  getUpcomingSlots(nowMs: number, count: number): number[] {
    const slots: number[] = [];
    let t = Math.ceil(nowMs / SLOT_INTERVAL) * SLOT_INTERVAL;
    while (slots.length < count) {
      if (t - nowMs >= MIN_TIME_TO_EXPIRY) slots.push(t);
      t += SLOT_INTERVAL;
    }
    return slots;
  }

  getSlotLabel(slotMs: number, nowMs: number): string {
    const sec = Math.round((slotMs - nowMs) / 1000);
    return `+${sec}s`;
  }

  isSettling(slotMs: number, nowMs: number): boolean {
    return slotMs - nowMs < SETTLING_THRESHOLD;
  }

  isExpired(slotMs: number, nowMs: number): boolean {
    return nowMs >= slotMs;
  }
}
