-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "numUsers" INTEGER NOT NULL,
    "speedMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "totalBets" INTEGER NOT NULL DEFAULT 0,
    "totalWon" INTEGER NOT NULL DEFAULT 0,
    "totalLost" INTEGER NOT NULL DEFAULT 0,
    "totalStaked" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPaidOut" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "platformPnl" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "peakExposure" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "simTimeMs" BIGINT NOT NULL,
    "emaPrice" DECIMAL(18,2) NOT NULL,
    "platformPnl" DECIMAL(18,2) NOT NULL,
    "exposure" DECIMAL(18,2) NOT NULL,
    "activeBets" INTEGER NOT NULL,
    "totalBets" INTEGER NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "avgMultiplier" DOUBLE PRECISION NOT NULL,
    "liabilityUp" DECIMAL(18,2) NOT NULL,
    "liabilityDown" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestSnapshot_runId_simTimeMs_idx" ON "BacktestSnapshot"("runId", "simTimeMs");

-- AddForeignKey
ALTER TABLE "BacktestSnapshot" ADD CONSTRAINT "BacktestSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
