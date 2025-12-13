export interface SettlementBatch {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  status: 'active' | 'settled';
  createdAt: string;
  settledAt?: string;
  totalSlots: number;
  totalAmount: number;
}

export interface SettlementPairing {
  id: string;
  batchId: string;
  creditorPlayer: string;
  debtorPlayer: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
}

export interface SettlementTransaction {
  id: string;
  pairingId: string;
  batchId: string;
  creditorPlayer: string;
  debtorPlayer: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
  notes?: string;
}

export interface SettlementPairingResult {
  pairings: SettlementPairing[];
  summary: {
    totalCreditors: number;
    totalDebtors: number;
    totalAmount: number;
    averageCreditorLoad: number;
    averageDebtorLoad: number;
  };
}

export interface BatchSlotInfo {
  slotId: string;
  player: string;
  claimedBy: string;
  amount: number;
  date: string;
  status: string;
}

