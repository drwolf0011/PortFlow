# PortFlow Development Documentation

**PortFlow**는 React(v19), TypeScript, Tailwind CSS를 기반으로 한 하이브리드 자산 관리 어플리케이션입니다. 
웹(PWA) 및 앱(Android/iOS via Capacitor) 환경을 모두 지원하며, Google Gemini AI와 한국투자증권(KIS) API를 활용하여 실시간 자산 관리 및 AI 기반의 포트폴리오 진단을 제공합니다.

---

## 1. 🏗 아키텍처 및 기술 스택 (Architecture)

### Tech Stack
- **Core**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4 (@import "tailwindcss")
- **State Management**: React Hooks (useState, useMemo, useCallback) + LocalStorage Persistence
- **Routing**: React Router DOM v7 (HashRouter)
- **AI Engine**: Google Gemini API (`@google/genai` SDK) - Gemini 3 Flash Preview 모델 사용
- **Financial Data**: 한국투자증권(KIS) OpenAPI (국내/해외 주식 실시간 시세)
- **Hybrid Native**: Capacitor v8 (Native Http, Haptics)
- **Cloud Storage**: Supabase (PostgreSQL) - 사용자별 데이터 독립 저장 및 동기화

### 주요 설계 원칙
- **Hybrid Price Update**: 한국투자증권(KIS) API와 Gemini AI를 혼합하여 사용합니다. 상장 주식/ETF는 KIS를 우선하고, 펀드나 기타 자산은 AI가 웹 검색을 통해 시세를 추정합니다.
- **Offline First**: 모든 데이터는 `LocalStorage`에 먼저 저장되며, 네트워크 연결 시 Supabase와 양방향 동기화됩니다.
- **Atomic Sync**: `localUpdateTimestamp`를 기반으로 클라우드와 로컬 데이터 중 더 최신인 것을 선택하여 데이터 일관성을 유지합니다.

---

## 2. 💾 데이터 모델 및 저장소 (Data Model)

### A. LocalStorage Keys
- `portflow_assets`: 보유 자산 목록 (`Asset[]`)
- `portflow_transactions`: 거래 내역 (`Transaction[]`)
- `portflow_accounts`: 계좌 목록 (`Account[]`)
- `portflow_user`: 사용자 프로필 (`UserProfile`) - KIS API Key 포함
- `portflow_sync_config`: 클라우드 연동 설정 (`SyncConfig`)
- `portflow_kis_config`: KIS API 연동 상태 및 서버 타입 (`KisConfig`)
- `PRICE_CACHE`: Gemini AI를 통해 조회된 시세 캐시 (30분 TTL)

### B. 주요 엔티티 및 관계
1.  **Transaction (Log) & Asset (State)**:
    - `recalculateAssets` 로직이 모든 거래 내역을 순회하며 자산의 수량과 평단가를 계산합니다.
    - 자산 ID(`assetId`)는 거래 내역과 자산을 연결하는 핵심 키이며, 신규 자산 등록 시 랜덤 ID가 생성되어 중복을 방지합니다.
2.  **UserProfile**:
    - 사용자의 투자 성향, PIN, 클라우드 설정 외에도 **KIS API Key/Secret**을 저장하여 재접속 시 자동 연동되도록 개선되었습니다.

---

## 3. 🌐 외부 서비스 연동 상세 (Services)

### A. 하이브리드 시세 갱신 로직 (`App.tsx` & `kisService.ts` & `geminiService.ts`)
- **KIS API (우선순위)**: 
    - 국내 주식(6자리 티커) 및 해외 주식(미국 거래소)에 대해 실시간 시세를 가져옵니다.
    - 브라우저 환경에서는 CORS 회피를 위해 `FALLBACK_MOCK` 데이터를 제공하거나 Gemini AI로 자동 전환됩니다.
- **Gemini AI (보완)**:
    - KIS에서 지원하지 않는 펀드, 비상장 주식, 기타 자산에 대해 Google Search 도구를 사용하여 최신 시세를 추정합니다.
    - **Batching**: 효율성을 위해 한 번에 최대 20개 종목을 묶어서 요청합니다.
    - **Caching**: 동일 종목에 대한 반복 요청을 줄이기 위해 30분 동안 유효한 로컬 캐시를 사용합니다.
- **Progress Tracking**: 시세 갱신 중 사용자가 진행 상황을 알 수 있도록 대시보드 상단에 실시간 상태(API 종류, 진행률)를 표시합니다.

### B. AI 포트폴리오 진단 (`AIAdvisor.tsx`)
- **전문가 페르소나**: "워런 버핏 스타일의 짐 사이먼스 같은 냉철한 PB" 페르소나를 적용하여 날카로운 분석을 제공합니다.
- **Market Briefing**: 대시보드에서 AI가 생성한 오늘의 시장 브리핑을 확인할 수 있습니다.

---

## 4. 🛠 최근 주요 개선 사항 (Recent Improvements)

- **KIS API 키 영구 저장**: 설정에서 입력한 KIS App Key/Secret을 사용자 프로필에 저장하여 앱 재실행 시 다시 입력할 필요가 없도록 개선했습니다.
- **시세 조회 효율화**: Gemini AI 호출 시 청크 사이즈를 20으로 확대하고, Ticker 우선 조회 및 로컬 캐싱을 도입하여 API 비용과 대기 시간을 대폭 단축했습니다.
- **데이터 정합성 강화**: 거래 등록 시 자산 ID 할당 로직을 수정하여 신규 자산과 기존 자산이 섞이거나 누락되는 문제를 해결했습니다.
- **펀드 시세 처리**: 국내 펀드(표준코드 사용)의 경우 KIS API 호출 시 오류가 발생하지 않도록 필터링하고, Gemini AI가 처리하도록 로직을 분리했습니다.
- **UI 가독성**: 자산 수정 및 거래 입력 화면에서 Ticker와 거래소 필드를 한 줄에 배치하여 공간 효율성을 높였습니다.

---

## 5. 📋 향후 과제 (Future Roadmap)

1.  **보안 강화 (Security)**:
    - 현재 클라이언트 측에 노출된 API Key들을 백엔드 프록시 서버로 이전해야 합니다.
    - PIN 번호의 단방향 해시(bcrypt) 처리가 필요합니다.
2.  **성능 최적화 (Performance)**:
    - 거래 내역이 방대해질 경우를 대비해 자산 재계산 로직을 Web Worker로 분리하는 것을 검토 중입니다.
3.  **데이터 무결성**:
    - 매도 시 보유 수량 체크를 강화하여 음수 잔고 발생을 원천 차단하는 로직이 필요합니다.
4.  **고급 분석**:
    - 자산별 배당금 추적 및 배당 캘린더 기능을 추가할 예정입니다.

---

## 💡 개발 팁
- **CORS 문제**: 브라우저에서 KIS API 테스트 시 `proxy-server.js`를 실행하거나, Capacitor Native 환경(에뮬레이터/실기기)에서 테스트하십시오.
- **Haptic**: 모바일 사용자 경험을 위해 주요 액션(저장, 새로고침 등)에 `triggerHaptic` 유틸리티가 적용되어 있습니다.
