
export enum AssetType {
  STOCK = '주식',
  FUND = '펀드',
  ETF = 'ETF',
  GOLD = '금',
  CASH = '현금'
}

export enum TransactionType {
  BUY = '매수',
  SELL = '매도'
}

export enum AccountType {
  GENERAL = '종합(위탁)',
  ISA = 'ISA(중개형)',
  PENSION = '개인연금',
  IRP = '퇴직연금(IRP)',
  DC = '퇴직연금(DC)'
}

export interface Account {
  id: string;
  institution: string;
  accountNumber: string;
  nickname: string;
  type: AccountType; // Added: 계좌 유형
  color?: string;
  isHidden?: boolean; 
}

export interface Transaction {
  id: string;
  assetId?: string;
  accountId?: string; 
  date: string;
  type: TransactionType;
  assetType: AssetType; 
  institution: string;
  name: string;
  quantity: number;
  price: number;
  currency: 'KRW' | 'USD';
  exchangeRate: number;
}

export interface Asset {
  id: string;
  accountId?: string; 
  name: string;
  ticker?: string;
  type: AssetType;
  institution: string;
  quantity: number;
  purchasePrice: number;
  purchasePriceKRW?: number; 
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

export interface UserProfile {
  name: string;
  id: string;
  cloudSync?: {
    apiKey: string;
    binId: string;
  };
  investmentGoal?: string; // 예: "노후 자금 마련", "5년 내 주택 구입"
  goalPrompt?: string;     // AI가 생성한 상세 지침 프롬프트
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
  lastSyncedDataTimestamp?: number; 
  autoSync: boolean;
}

export interface AppData {
  assets: Asset[];
  transactions: Transaction[];
  accounts: Account[];
  user: UserProfile | null;
  history: {date: string, value: number}[];
  lastUpdated: string;
  exchangeRate: number;
  timestamp: number;
  savedStrategies?: SavedStrategy[];
}
