
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
- **Cloud Storage**: JSONBin.io (Simple JSON Storage)

### 디렉토리 구조 (Directory Structure)
```
/
├── public/                  # 정적 리소스 (Icons, Manifest, SW)
├── src/
│   ├── components/          # UI 컴포넌트
│   │   ├── AccountManager.tsx    # 계좌 CRUD 및 숨김 처리
│   │   ├── AIAdvisor.tsx         # AI 진단, 전략 생성, 백테스팅
│   │   ├── AnalyticsView.tsx     # 지역/통화별 자산 성장 그래프
│   │   ├── AssetList.tsx         # 보유 자산 목록 및 필터링
│   │   ├── AuthScreen.tsx        # PIN 인증 및 로컬/클라우드 분기
│   │   ├── Dashboard.tsx         # 메인 요약, 파이차트, 리스크 분석
│   │   ├── EnrichmentModal.tsx   # Ticker/Exchange 누락 데이터 AI 보정
│   │   ├── ... (Modals & Forms)
│   ├── services/            # 외부 API 연동 계층
│   │   ├── geminiService.ts      # AI 로직 (시세 추정, 진단, RequestQueue)
│   │   ├── kisService.ts         # 증권사 API (Native/Web 분기 처리)
│   │   └── storageService.ts     # 클라우드 동기화 (JSONBin)
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

앱은 **LocalStorage**를 Primary DB로 사용하며, **JSONBin**을 백업/동기화 용도로 사용합니다.

### A. LocalStorage Keys
개발 중 데이터 초기화가 필요할 때 다음 키를 확인하세요.
- `portflow_assets`: 보유 자산 목록 (`Asset[]`)
- `portflow_transactions`: 거래 내역 (`Transaction[]`)
- `portflow_accounts`: 계좌 목록 (`Account[]`)
- `portflow_user`: 사용자 프로필 (`UserProfile`)
- `portflow_sync_config`: 클라우드 연동 설정 (`SyncConfig`)
- `portflow_kis_config`: 한국투자증권 API 설정 (`KisConfig`)

### B. 주요 엔티티 관계 (Entity Relationships)
1.  **Account (1) : Asset (N)**
    - `Asset`은 `accountId` 필드를 통해 특정 계좌에 종속됩니다.
    - `accountId`가 없는 자산은 '미지정(직접 입력)' 자산으로 취급됩니다.
    - 계좌의 `type` (ISA, IRP 등)은 자산의 세제 혜택 분석 로직에 영향을 줍니다.

2.  **Transaction vs Asset (동기화 로직)**
    - **Transaction(거래 내역)**은 불변의 기록(Log)입니다.
    - **Asset(자산)**은 거래 내역의 집계 결과(State)입니다.
    - `App.tsx`의 `recalculateAssets` 함수가 거래 내역(`transactions`)을 순회하며 자산의 `quantity`(수량)와 `purchasePrice`(평단가)를 재계산합니다.
    - **주의**: 사용자가 자산 정보를 '수동 수정'할 수도 있으므로, 완전한 이벤트 소싱 방식은 아닙니다.

---

## 3. 🌐 외부 서비스 연동 가이드 (Services)

### A. 한국투자증권 (KIS) API (`kisService.ts`)
이 앱은 **하이브리드 환경**에 따라 다른 통신 방식을 사용합니다.

1.  **Native App (Android/iOS)**:
    - `CapacitorHttp` 플러그인을 사용하여 네이티브 레벨에서 요청을 보냅니다.
    - **CORS 제약을 받지 않으므로** 프록시 서버 없이 KIS API를 직접 호출합니다.
    
2.  **Web Browser**:
    - 브라우저 보안 정책(CORS)으로 인해 KIS API 직접 호출이 불가능합니다.
    - **필수**: 로컬 개발 시 `http-proxy-middleware`를 사용하는 Node.js 프록시 서버가 `localhost:3000`에서 실행되어야 합니다.
    - **Fallback**: 프록시가 없거나 호출 실패 시 `FALLBACK_MOCK` 데이터를 반환하거나, Gemini AI를 통한 추정가 모드로 자동 전환됩니다.

### B. Google Gemini AI (`geminiService.ts`)
- **RequestQueue**: API Rate Limit(429) 방지를 위해 요청을 큐에 담아 순차 처리합니다.
- **Enrichment**: 종목명만 입력된 자산에 대해 AI가 `Ticker`와 `Exchange` 코드를 자동으로 찾아줍니다.
- **Thinking Config**: 복잡한 포트폴리오 리밸런싱 전략 수립 시 `thinkingBudget`을 할당하여 추론 능력을 강화했습니다.

### C. 클라우드 동기화 (`storageService.ts`)
- **JSONBin.io**: 간단한 Key-Value 저장소 역할을 합니다.
- **동기화 전략**: `timestamp`를 비교하여 더 최신 데이터가 있는 쪽으로 덮어씁니다 (Last Write Wins).
- **충돌 처리**: `isSyncingRef`를 사용하여 중복 동기화 요청을 방지합니다.

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
