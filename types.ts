
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
  type: AccountType;
  color?: string;
  isHidden?: boolean; 
}

export interface Transaction {
  id: string;
  assetId?: string;
  accountId?: string; 
  managementType?: AccountType;
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
  managementType?: AccountType;
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

export interface UserProfile {
  name: string;
  id: string;
  pin: string;
  dataBinId: string; // 개인 데이터 저장소 ID
  investmentGoal?: string;
  goalPrompt?: string;
}

// 중앙 사용자 디렉토리 저장 구조
export interface UsersRegistry {
  users: UserProfile[];
}

export interface DiagnosisResponse {
  currentDiagnosis: string;
  marketConditions: string;
  sources: { title: string; uri: string }[];
}

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
  type: 'DIAGNOSIS' | 'STRATEGY';
  name: string;
  diagnosis?: DiagnosisResponse;
  strategy?: RebalancingStrategy;
}

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
