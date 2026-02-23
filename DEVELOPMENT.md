
# PortFlow Development Documentation

**PortFlow**는 React(v19), TypeScript, Tailwind CSS를 기반으로 한 하이브리드 자산 관리 어플리케이션입니다. 
웹(PWA) 및 앱(Android/iOS via Capacitor) 환경을 모두 지원하며, Google Gemini AI와 한국투자증권(KIS) API를 활용합니다.

---

## 1. 🏗 아키텍처 및 기술 스택 (Architecture)

### Tech Stack
- **Core**: React 19, TypeScript, Vite (assumed via esm.sh imports)
- **Styling**: Tailwind CSS (Typography, Forms, Aspect-Ratio plugins included)
- **State Management**: React Context + LocalStorage Persistence (상용화 시 Zustand/Recoil로 마이그레이션 권장)
- **Routing**: React Router DOM v7 (HashRouter 사용)
- **AI Engine**: Google Gemini API (`@google/genai` SDK)
- **Financial Data**: 한국투자증권(KIS) OpenAPI
- **Hybrid Native**: Capacitor v8 (Native Http, Haptics)
- **Cloud Storage**: Supabase (PostgreSQL) - JSONBin.io는 레거시 마이그레이션 용도로만 유지

### 디렉토리 구조 (Directory Structure)
```
/
├── public/                  # 정적 리소스 (Icons, Manifest, SW)
├── src/
│   ├── components/          # UI 컴포넌트
│   │   ├── AccountManager.tsx         # 계좌 CRUD 및 숨김 처리
│   │   ├── AIAdvisor.tsx              # AI 진단, 전략 생성, 백테스팅
│   │   ├── AnalyticsView.tsx          # 지역/통화별 자산 성장 그래프
│   │   ├── AssetList.tsx              # 보유 자산 목록 및 필터링
│   │   ├── AssetSparkline.tsx         # 자산 스파크라인 차트
│   │   ├── AuthScreen.tsx             # PIN 인증 및 로컬/클라우드 분기 (Supabase 연동)
│   │   ├── Dashboard.tsx              # 메인 요약, 파이차트, 리스크 분석
│   │   ├── EnrichmentModal.tsx        # Ticker/Exchange 누락 데이터 AI 보정
│   │   ├── InstitutionConnector.tsx   # 증권사 연동 설정
│   │   ├── ManualAssetEntry.tsx       # 수동 자산 입력 폼
│   │   ├── ManualTransactionEntry.tsx # 수동 거래 내역 입력 폼
│   │   ├── TransactionHistory.tsx     # 거래 내역 조회
│   │   └── DeleteConfirmModal.tsx     # 삭제 확인 모달
│   ├── services/            # 외부 API 연동 계층
│   │   ├── geminiService.ts      # AI 로직 (시세 추정, 진단, RequestQueue)
│   │   ├── kisService.ts         # 증권사 API (Native/Web 분기 처리)
│   │   └── storageService.ts     # 클라우드 동기화 (Supabase 연동 및 JSONBin 마이그레이션)
│   ├── utils/               # 유틸리티
│   │   └── mobile.ts             # 햅틱 피드백 (Navigator.vibrate)
│   ├── types.ts             # 전역 타입 정의 (Core Data Model)
│   ├── constants.ts         # 환경 변수 및 상수
│   ├── App.tsx              # 전역 상태 관리 및 라우팅 진입점
│   └── index.tsx            # React Mount & SW Registration
├── capacitor.config.ts      # 하이브리드 앱 설정
├── sw.js                    # Service Worker (PWA 캐싱)
└── ...
```

---

## 2. 💾 데이터 모델 및 저장소 (Data Model)

앱은 **LocalStorage**를 Primary DB로 사용하며, **Supabase**를 백업/동기화 용도로 사용합니다.

### A. LocalStorage Keys
개발 중 데이터 초기화가 필요할 때 다음 키를 확인하세요.
- `portflow_assets`: 보유 자산 목록 (`Asset[]`)
- `portflow_transactions`: 거래 내역 (`Transaction[]`)
- `portflow_accounts`: 계좌 목록 (`Account[]`)
- `portflow_user`: 사용자 프로필 (`UserProfile`)
- `portflow_sync_config`: 클라우드 연동 설정 (`SyncConfig`)
- `portflow_kis_config`: 한국투자증권 API 설정 (`KisConfig`)
- `portflow_saved_strategies`: 저장된 AI 투자 전략 (`SavedStrategy[]`)

### B. 주요 엔티티 관계 (Entity Relationships)
1.  **Account (1) : Asset (N) / Transaction (N)**
    - `Asset`과 `Transaction`은 `accountId` 필드를 통해 특정 계좌에 종속됩니다.
    - `accountId`가 없는 자산은 '미지정(직접 입력)' 자산으로 취급됩니다.
    - 계좌의 `type` (ISA, IRP 등) 및 `isHidden` 속성은 자산의 세제 혜택 분석 및 UI 노출 로직에 영향을 줍니다.

2.  **Transaction vs Asset (동기화 로직)**
    - **Transaction(거래 내역)**은 불변의 기록(Log)입니다.
    - **Asset(자산)**은 거래 내역의 집계 결과(State)입니다.
    - `App.tsx`의 `recalculateAssets` 함수가 거래 내역(`transactions`)을 순회하며 자산의 `quantity`(수량)와 `purchasePrice`(평단가)를 재계산합니다.

3.  **SavedStrategy (AI 전략 저장)**
    - 사용자가 생성한 AI 진단 및 리밸런싱 전략을 저장하여 나중에 다시 볼 수 있도록 지원합니다.

---

## 3. 🌐 외부 서비스 연동 가이드 (Services)

### A. 클라우드 동기화 (`storageService.ts`)
- **Supabase (PostgreSQL)**: 사용자 정보, 계좌, 자산, 거래 내역, 포트폴리오 히스토리, 저장된 전략을 관계형 데이터베이스에 저장합니다.
- **동기화 전략**: `timestamp` (updated_at)를 비교하여 더 최신 데이터가 있는 쪽으로 덮어씁니다 (Last Write Wins).
- **레거시 마이그레이션**: 기존 JSONBin 사용자를 위해 `loadFromLegacyBin` 함수를 제공하여 Supabase로 데이터를 이전할 수 있도록 지원합니다.

### B. 한국투자증권 (KIS) API (`kisService.ts`)
이 앱은 **하이브리드 환경**에 따라 다른 통신 방식을 사용합니다.

1.  **Native App (Android/iOS)**:
    - `CapacitorHttp` 플러그인을 사용하여 네이티브 레벨에서 요청을 보냅니다.
    - **CORS 제약을 받지 않으므로** 프록시 서버 없이 KIS API를 직접 호출합니다.
    
2.  **Web Browser**:
    - 브라우저 보안 정책(CORS)으로 인해 KIS API 직접 호출이 불가능합니다.
    - **필수**: 로컬 개발 시 `http-proxy-middleware`를 사용하는 Node.js 프록시 서버가 `localhost:3000`에서 실행되어야 합니다.
    - **Fallback**: 프록시가 없거나 호출 실패 시 `FALLBACK_MOCK` 데이터를 반환하거나, Gemini AI를 통한 추정가 모드로 자동 전환됩니다.

### C. Google Gemini AI (`geminiService.ts`)
- **RequestQueue**: API Rate Limit(429) 방지를 위해 요청을 큐에 담아 순차 처리합니다.
- **Enrichment**: 종목명만 입력된 자산에 대해 AI가 `Ticker`와 `Exchange` 코드를 자동으로 찾아줍니다.
- **Thinking Config**: 복잡한 포트폴리오 리밸런싱 전략 수립 시 `thinkingBudget`을 할당하여 추론 능력을 강화했습니다.

---

## 4. ⚠️ 상용화 개발 시 유의사항 (Critical Checkpoints)

### 1. 보안 (Security)
- **API Key 관리**: 현재 소스코드나 `localStorage`에 API Key가 저장되는 구조입니다. 상용화 시 반드시 **Backend Server**를 구축하여 클라이언트에서 Key를 감춰야 합니다.
- **PIN 암호화**: `user.pin`이 평문으로 저장됩니다. `bcrypt` 등을 사용하여 해시값으로 저장해야 합니다.

### 2. 성능 최적화 (Performance)
- **대량 데이터 처리**: 거래 내역이 수천 건을 넘어가면 `recalculateAssets` 함수가 메인 스레드를 차단할 수 있습니다. **Web Worker**로 로직을 분리해야 합니다.
- **불필요한 렌더링**: `App.tsx`가 거대해지고 있습니다. Context API를 분리(AssetContext, UserContext 등)하여 리렌더링 범위를 줄여야 합니다.

### 3. 데이터 무결성
- **매도 로직**: 현재 보유 수량보다 많은 수량을 매도하는 경우에 대한 방어 로직이 UI 레벨에만 있습니다. 로직 레벨(`recalculateAssets`)에서도 음수 잔고를 방지하거나 경고하는 처리가 필요합니다.
- **환율**: 거래 시점의 환율(`exchangeRate`)을 `Transaction`에 영구 저장하고 있지만, 현재가 평가 시에는 실시간 환율을 적용해야 합니다. 이 두 가지 환율의 적용 시점을 혼동하지 않도록 주의하세요.

### 4. 배포 (Deployment)
- **Web**: Vercel/Netlify 배포 시 `server.js` (프록시)는 함께 배포되지 않습니다. Next.js API Routes나 Vercel Functions를 사용하여 프록시 기능을 포팅해야 합니다.
- **Android**: `AndroidManifest.xml`에서 인터넷 권한 및 `cleartextTrafficPermitted="true"` (로컬 프록시 테스트용) 설정을 확인하세요.

---

## 5. 로컬 개발 프록시 서버 (Proxy Server)
웹 브라우저에서 KIS API 테스트를 위해 프로젝트 루트에 `proxy-server.js`를 생성하고 실행하십시오.

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());
app.use('/', createProxyMiddleware({
    target: 'https://openapi.koreainvestment.com:9443', // 실전투자 URL
    changeOrigin: true,
    onProxyRes: function (proxyRes) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Headers'] = '*';
    }
}));
app.listen(3000, () => console.log('Proxy running on port 3000'));
```

실행: `node proxy-server.js`

---

## 6. 📋 시급한 TODO 리스트 (Prioritized Action Items)

### 🚨 최우선 과제: 보안 (Security)
가장 치명적인 위험을 초래할 수 있으므로 상용화 전 반드시 해결해야 합니다.
1. **API Key 은닉 (Backend 도입)**
   - **현황:** Gemini API Key, KIS API Key, Supabase Key 등이 클라이언트(소스코드 또는 LocalStorage)에 노출되어 있습니다.
   - **조치:** 별도의 Backend Server(또는 Serverless Function)를 구축하여 클라이언트에서 API Key를 직접 참조하지 않도록 프록시/은닉 처리해야 합니다.
2. **사용자 PIN 암호화**
   - **현황:** `user.pin`이 평문(Plaintext)으로 데이터베이스 및 로컬에 저장되고 있습니다.
   - **조치:** `bcrypt` 등의 단방향 암호화 알고리즘을 적용하여 해시값으로 저장하고 검증하도록 수정해야 합니다.

### ⚡️ 차순위 과제: 성능 최적화 (Performance)
앱의 사용성이 저하되는 것을 막기 위한 구조적 개선입니다.
3. **대량 데이터 처리 분리 (Web Worker)**
   - **현황:** 거래 내역이 수천 건 이상 누적될 경우, `recalculateAssets` 함수가 메인 스레드를 차단하여 UI 멈춤(프리징) 현상이 발생할 수 있습니다.
   - **조치:** 무거운 자산 재계산 로직을 **Web Worker**로 분리하여 백그라운드에서 처리하도록 개선해야 합니다.
4. **전역 상태 분리 (Context API / 전역 상태 관리 라이브러리)**
   - **현황:** `App.tsx`가 너무 거대해지고 모든 상태를 쥐고 있어, 상태 하나가 변할 때마다 불필요한 리렌더링이 광범위하게 발생합니다.
   - **조치:** `AssetContext`, `UserContext` 등으로 Context를 쪼개거나, Zustand/Recoil 같은 상태 관리 라이브러리를 도입하여 리렌더링 범위를 최소화해야 합니다.

### 🛡️ 3순위 과제: 데이터 무결성 (Data Integrity)
정확한 자산 관리를 위한 로직 보강입니다.
5. **매도 로직 방어 코드 추가**
   - **현황:** 보유 수량보다 많은 수량을 매도하는 것을 막는 방어 로직이 UI 레벨에만 존재합니다.
   - **조치:** 코어 로직인 `recalculateAssets` 내부에서도 음수 잔고가 발생하지 않도록 검증하고 예외 처리(경고)하는 로직을 추가해야 합니다.
6. **환율 적용 시점 명확화**
   - **현황:** 거래 당시의 환율(`Transaction`에 저장)과 현재 자산 가치 평가 시의 실시간 환율이 혼용될 여지가 있습니다.
   - **조치:** 평가 금액 계산 로직에서 이 두 환율의 적용 시점과 기준을 명확히 분리하여 계산 오류를 방지해야 합니다.

### 🚀 4순위 과제: 배포 환경 구성 (Deployment)
실제 운영 환경에 맞춘 인프라 작업입니다.
7. **Web 배포용 KIS 프록시 서버 구축**
   - **현황:** 로컬 개발용 `proxy-server.js`는 Vercel이나 Netlify 같은 정적 호스팅 환경에 배포되지 않습니다.
   - **조치:** Vercel Serverless Functions 또는 Next.js API Routes 등을 활용하여 운영 환경용 KIS API 프록시를 구축해야 합니다.
8. **Android 네이티브 설정 점검**
   - **조치:** `AndroidManifest.xml`에서 인터넷 권한이 제대로 설정되어 있는지 확인하고, 상용 배포 시 보안을 위해 로컬 테스트용이었던 `cleartextTrafficPermitted="true"` 설정을 제거하거나 조정해야 합니다.
