import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateUser(sessionId: string) {
    let user = await this.prisma.user.findUnique({ where: { id: sessionId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: sessionId,
          balance: 1000,
          sessionLoss: 0,
        },
      });
      this.logger.log(`New user created: ${sessionId} with $1000 balance`);
    }

    return user;
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? Number(user.balance) : 0;
  }

  async deductBalance(userId: string, amount: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || Number(user.balance) < amount) return false;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: { decrement: amount },
        lastBetAt: new Date(),
      },
    });
    return true;
  }

  async creditBalance(userId: string, amount: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });
  }

  async addSessionLoss(userId: string, amount: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionLoss: { increment: amount } },
    });
  }

  async getSessionLoss(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? Number(user.sessionLoss) : 0;
  }

  async getLastBetTime(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.lastBetAt ? user.lastBetAt.getTime() : 0;
  }
}
