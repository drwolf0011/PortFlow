import express from "express";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // KIS API Proxy for Real Server
  app.use(
    "/api/kis/real",
    createProxyMiddleware({
      target: "https://openapi.koreainvestment.com:9443",
      changeOrigin: true,
      secure: false,
      proxyTimeout: 60000,
      timeout: 60000,
      pathRewrite: {
        "^/api/kis/real": "",
      },
      on: {
        proxyReq: (proxyReq, req) => {
          console.log(`[Proxy-Real] Request: ${req.method} ${req.url}`);
          
          // 1. KIS 필수 헤더 값 추출
          const auth = req.headers['authorization'];
          const appkey = req.headers['appkey'];
          const appsecret = req.headers['appsecret'];
          const custtype = req.headers['custtype'];
          const contentType = req.headers['content-type'];
          const trId = (req.headers['trid'] || req.headers['tr_id']) as string;

          // 2. 모든 기존 헤더 제거 (클라우드/브라우저 노이즈 완전 제거)
          const currentHeaders = proxyReq.getHeaders();
          Object.keys(currentHeaders).forEach(key => {
            // Host 헤더는 프록시 엔진이 대상 서버를 찾는 데 필요하므로 유지
            if (key.toLowerCase() !== 'host') {
              proxyReq.removeHeader(key);
            }
          });

          // 3. KIS 필수 헤더만 선별적으로 재주입
          if (auth) proxyReq.setHeader('authorization', auth);
          if (appkey) proxyReq.setHeader('appkey', appkey);
          if (appsecret) proxyReq.setHeader('appsecret', appsecret);
          if (custtype) proxyReq.setHeader('custtype', custtype);
          if (contentType) proxyReq.setHeader('content-type', contentType);
          if (trId) proxyReq.setHeader('tr_id', trId);
          
          // 4. 표준 API 클라이언트 헤더 설정
          proxyReq.setHeader('accept', 'application/json');
          proxyReq.setHeader('User-Agent', 'KIS-API-Client/1.0');
          proxyReq.setHeader('Connection', 'close');
        },
        proxyRes: (proxyRes, req, res) => {
          proxyRes.headers["Access-Control-Allow-Origin"] = "*";
          proxyRes.headers["Access-Control-Allow-Headers"] = "*";
          proxyRes.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        },
        error: (err, req, res) => {
          console.error(`[Proxy-Real] Error:`, err.message);
          const response = res as any;
          if (response.headersSent === false && typeof response.status === 'function') {
            response.status(502).json({ error: "Proxy Error", message: err.message });
          }
        }
      },
    })
  );

  // KIS API Proxy for Virtual Server
  app.use(
    "/api/kis/virtual",
    createProxyMiddleware({
      target: "https://openapivts.koreainvestment.com:29443",
      changeOrigin: true,
      secure: false,
      proxyTimeout: 60000,
      timeout: 60000,
      pathRewrite: {
        "^/api/kis/virtual": "",
      },
      on: {
        proxyReq: (proxyReq, req) => {
          console.log(`[Proxy-Virtual] Request: ${req.method} ${req.url}`);
          
          // 1. KIS 필수 헤더 값 추출
          const auth = req.headers['authorization'];
          const appkey = req.headers['appkey'];
          const appsecret = req.headers['appsecret'];
          const custtype = req.headers['custtype'];
          const contentType = req.headers['content-type'];
          const trId = (req.headers['trid'] || req.headers['tr_id']) as string;

          // 2. 모든 기존 헤더 제거 (클라우드/브라우저 노이즈 완전 제거)
          const currentHeaders = proxyReq.getHeaders();
          Object.keys(currentHeaders).forEach(key => {
            if (key.toLowerCase() !== 'host') {
              proxyReq.removeHeader(key);
            }
          });

          // 3. KIS 필수 헤더만 선별적으로 재주입
          if (auth) proxyReq.setHeader('authorization', auth);
          if (appkey) proxyReq.setHeader('appkey', appkey);
          if (appsecret) proxyReq.setHeader('appsecret', appsecret);
          if (custtype) proxyReq.setHeader('custtype', custtype);
          if (contentType) proxyReq.setHeader('content-type', contentType);
          if (trId) proxyReq.setHeader('tr_id', trId);
          
          // 4. 표준 API 클라이언트 헤더 설정
          proxyReq.setHeader('accept', 'application/json');
          proxyReq.setHeader('User-Agent', 'KIS-API-Client/1.0');
          proxyReq.setHeader('Connection', 'close');
          
          console.log(`[Proxy-Virtual] Final Outgoing Headers:`, JSON.stringify(proxyReq.getHeaders()));
        },
        proxyRes: (proxyRes, req, res) => {
          proxyRes.headers["Access-Control-Allow-Origin"] = "*";
          proxyRes.headers["Access-Control-Allow-Headers"] = "*";
          proxyRes.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        },
        error: (err, req, res) => {
          console.error(`[Proxy-Virtual] Error:`, err.message);
          const response = res as any;
          if (response.headersSent === false && typeof response.status === 'function') {
            response.status(502).json({ error: "Proxy Error", message: err.message });
          }
        }
      },
    })
  );

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
