
export enum AssetType {
  STOCK = '주식',
  BOND = '채권',
  PENSION = '연금',
  CASH = '현금'
}

export enum TransactionType {
  BUY = '매수',
  SELL = '매도'
}

export interface Account {
  id: string;
  institution: string;
  accountNumber: string;
  nickname: string;
  color?: string;
  isHidden?: boolean; // 계좌 숨기기 상태
}

export interface Transaction {
  id: string;
  assetId?: string;
  accountId?: string; // 연결된 계좌 ID
  date: string;
  type: TransactionType;
  assetType: AssetType; // 추가: 거래되는 자산의 종류
  institution: string;
  name: string;
  quantity: number;
  price: number;
  currency: 'KRW' | 'USD';
  exchangeRate: number;
}

export interface Asset {
  id: string;
  accountId?: string; // 연결된 계좌 ID
  name: string;
  ticker?: string;
  type: AssetType;
  institution: string;
  quantity: number;
  purchasePrice: number;
  purchasePriceKRW?: number; // Added: 원화 환산 평균 매수 단가 (환율 반영)
  currentPrice: number;
  currency: 'KRW' | 'USD';
}

export interface PerformancePoint {
  date: string;
  value: number;
}

export interface AIAnalysis {
  marketTrend: string;
  rebalancingStrategy: string;
  recommendations: {
    ticker: string;
    reason: string;
    targetWeight: number;
  }[];
  sources: { title: string; uri: string }[];
}

// --- AI Strategy Types (Moved from geminiService) ---

export interface ExecutionPlanItem {
  assetName: string;
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  estimatedPrice: number;
  totalAmount: number;
  reason: string;
  isNew?: boolean;
}

export interface ExecutionGroup {
  institution: string;
  accountName: string;
  isPension: boolean;
  items: ExecutionPlanItem[];
}

export interface RebalancingStrategy {
  name: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  predictedReturnRate: number;
  rationale: string;
  targetSectorAllocation: string;
  executionGroups: ExecutionGroup[]; 
}

export interface SavedStrategy {
  id: string;
  createdAt: number;
  strategy: RebalancingStrategy;
}

// --- Sync & App Data ---

export interface SyncConfig {
  apiKey: string;
  binId: string;
  lastSynced: string;
  lastSyncedDataTimestamp?: number; // Added for version control
  autoSync: boolean;
}

export interface AppData {
  assets: Asset[];
  transactions: Transaction[];
  accounts: Account[];
  user: any;
  history: {date: string, value: number}[];
  lastUpdated: string;
  exchangeRate: number;
  timestamp: number;
  savedStrategies?: SavedStrategy[];
}
