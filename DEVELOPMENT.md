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
    - **Proxy-based CORS & Security Bypass**: 클라우드 환경의 보안 필터(언더바 헤더 삭제 등) 및 KIS WAF(웹 방화벽)를 우회하기 위해 전용 Express 프록시를 사용합니다.
    - **Strict Header Whitelist**: KIS API 규격에 맞지 않는 모든 부가 헤더(클라우드 추적 헤더 등)를 프록시 단계에서 강제 제거하여 500 에러를 방지합니다.
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

- **KIS API 안정화 (CORS & WAF 우회)**: 클라우드 환경에서 KIS API 호출 시 발생하는 500 에러 및 HTML 리다이렉트 문제를 해결하기 위해 프록시 서버에 '엄격한 헤더 화이트리스트'와 'User-Agent 최적화'를 적용했습니다.
- **언더바 헤더 복구**: 클라우드 보안 장비가 `tr_id` 헤더를 삭제하는 문제를 해결하기 위해 프론트엔드에서 `trid`로 보내고 백엔드 프록시에서 `tr_id`로 복구하는 메커니즘을 구현했습니다.
- **KIS API 키 영구 저장**: 설정에서 입력한 KIS App Key/Secret을 사용자 프로필에 저장하여 앱 재실행 시 다시 입력할 필요가 없도록 개선했습니다.
- **시세 조회 효율화**: Gemini AI 호출 시 청크 사이즈를 20으로 확대하고, Ticker 우선 조회 및 로컬 캐싱을 도입하여 API 비용과 대기 시간을 대폭 단축했습니다.
- **데이터 정합성 강화**: 거래 등록 시 자산 ID 할당 로직을 수정하여 신규 자산과 기존 자산이 섞이거나 누락되는 문제를 해결했습니다.
- **펀드 시세 처리**: 국내 펀드(표준코드 사용)의 경우 KIS API 호출 시 오류가 발생하지 않도록 필터링하고, Gemini AI가 처리하도록 로직을 분리했습니다.
- **UI 가독성**: 자산 수정 및 거래 입력 화면에서 Ticker와 거래소 필드를 한 줄에 배치하여 공간 효율성을 높였습니다.

---

## 5. 📋 향후 과제 (Future Roadmap)

1.  **보안 강화 (Security)**:
    - **API Key Proxying**: 현재 클라이언트에서 프록시로 Key를 전달하는 방식을 서버측 세션/DB 저장 방식으로 전환하여 클라이언트 노출을 완전히 차단해야 합니다.
    - PIN 번호의 단방향 해시(bcrypt) 처리가 필요합니다.
2.  **KIS 연동 고도화**:
    - **AppSecret 검증**: 일부 사용자의 AppSecret이 표준 규격보다 길게 입력되는 현상(340자)에 대한 예외 처리 또는 가이드가 필요합니다.
    - **토큰 갱신 자동화**: 만료된 접근 토큰을 백그라운드에서 자동으로 갱신하는 로직을 강화해야 합니다.
3.  **성능 최적화 (Performance)**:
    - 거래 내역이 방대해질 경우를 대비해 자산 재계산 로직을 Web Worker로 분리하는 것을 검토 중입니다.
3.  **데이터 무결성**:
    - 매도 시 보유 수량 체크를 강화하여 음수 잔고 발생을 원천 차단하는 로직이 필요합니다.
4.  **고급 분석**:
    - 자산별 배당금 추적 및 배당 캘린더 기능을 추가할 예정입니다.

---

## 7. 💻 외부 개발 환경 이전 (VSCode Migration)

AI Studio에서 로컬 개발 환경(VSCode)으로 이전하여 개발을 이어가려면 다음 단계를 따르십시오.

### A. 프로젝트 다운로드 및 설정
1. **소스 코드 복사**: AI Studio의 모든 파일을 로컬 디렉토리로 복사합니다.
2. **의존성 설치**: 터미널에서 `npm install`을 실행합니다.
3. **환경 변수 설정**: `.env` 파일을 생성하고 필요한 API Key들을 설정합니다.
   ```env
   VITE_GEMINI_API_KEY=your_gemini_key
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_key
   ```

### B. 로컬 실행
- **Full-Stack 실행**: `npm run dev`를 실행하면 `server.ts`가 구동되며, Express 서버와 Vite가 동시에 실행됩니다.
- **KIS API 프록시**: 로컬 서버(`localhost:3000`)를 통해 KIS API 호출 시 CORS 문제 없이 실시간 시세를 확인할 수 있습니다.

### C. 하이브리드 앱 빌드 (Capacitor)
1. **빌드**: `npm run build`
2. **동기화**: `npx cap sync`
3. **실행**: `npx cap open android` 또는 `npx cap open ios`

---

## 🚀 8. 향후 발전 방향 (Future Roadmap)

1. **Backend 고도화**:
   - 현재 `server.ts`는 단순 프록시 역할만 수행합니다. 향후 사용자 인증(JWT), API Key 암호화 저장, 대량 데이터 집계 로직을 서버로 이전하여 보안과 성능을 강화해야 합니다.
2. **실제 주문 기능 연동**:
   - KIS API의 주문 엔드포인트를 연동하여 AI가 제안한 리밸런싱 전략을 앱 내에서 즉시 실행할 수 있는 기능을 구현합니다.
3. **커뮤니티 및 소셜**:
   - 익명화된 포트폴리오 수익률 랭킹이나 투자 전략 공유 기능을 추가하여 사용자 참여를 유도합니다.
4. **고급 자산군 지원**:
   - 부동산(공시지가 연동), 가상자산(Upbit/Bithumb API), 실물 자산(금, 시계 등)에 대한 통합 관리 기능을 강화합니다.
