-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('ACTIVE', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "address" TEXT,
    "nickname" TEXT,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 1000,
    "sessionLoss" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastBetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cellLow" DECIMAL(18,2) NOT NULL,
    "cellHigh" DECIMAL(18,2) NOT NULL,
    "cellSide" TEXT NOT NULL,
    "slotTimestamp" TIMESTAMP(3) NOT NULL,
    "stake" DECIMAL(18,2) NOT NULL,
    "multiplier" DECIMAL(8,2) NOT NULL,
    "potentialPayout" DECIMAL(18,2) NOT NULL,
    "placedPrice" DECIMAL(18,2) NOT NULL,
    "settlementPrice" DECIMAL(18,2),
    "status" "BetStatus" NOT NULL DEFAULT 'ACTIVE',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotInventory" (
    "id" TEXT NOT NULL,
    "slotTimestamp" TIMESTAMP(3) NOT NULL,
    "liabilityUp" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "liabilityDown" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "liabilityCenter" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CellLiability" (
    "id" TEXT NOT NULL,
    "cellKey" TEXT NOT NULL,
    "liability" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CellLiability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigmaHistory" (
    "id" TEXT NOT NULL,
    "sigma10s" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigmaHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE INDEX "Bet_userId_status_idx" ON "Bet"("userId", "status");

-- CreateIndex
CREATE INDEX "Bet_slotTimestamp_status_idx" ON "Bet"("slotTimestamp", "status");

-- CreateIndex
CREATE INDEX "Bet_status_idx" ON "Bet"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SlotInventory_slotTimestamp_key" ON "SlotInventory"("slotTimestamp");

-- CreateIndex
CREATE INDEX "SlotInventory_slotTimestamp_idx" ON "SlotInventory"("slotTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "CellLiability_cellKey_key" ON "CellLiability"("cellKey");

-- CreateIndex
CREATE INDEX "CellLiability_cellKey_idx" ON "CellLiability"("cellKey");

-- CreateIndex
CREATE INDEX "SigmaHistory_recordedAt_idx" ON "SigmaHistory"("recordedAt");

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
