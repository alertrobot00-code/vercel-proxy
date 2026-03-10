# Vercel HTTP Proxy

一個簡單既 HTTP Proxy，部署上 Vercel 用於绕过地區限制。

## 部署

```bash
cd vercel-proxy
vercel deploy --prod
```

## 使用方法

### 1. 安裝 Browser Extension
下載其中一個extension來添加自定義header：
- **Requestly**: https://requestly.io/
- **ModHeader**: https://modheader.com/

### 2. 設定 Extension

**Requestly:**
1. New Rule → Modify Headers
2. Name: "Proxy Header"
3. Add Header:
   - Name: `x-target-url`
   - Value: `https://api.openai.com/v1/chat/completions`

**ModHeader:**
1. Add Request Header
2. Name: `x-target-url`
3. Value: `https://api.openai.com/v1/chat/completions`

### 3. 設定 Browser Proxy (可選)

如果想用傳統既 HTTP Proxy mode，可以配合 SwitchyOmega：

**SwitchyOmega Setup:**
1. 新建 Profile → HTTP Proxy
2. Proxy Server: `your-vercel-url.vercel.app`
3. 然後用上面既 extension 來添加 x-target-url header

## 示例

### OpenAI API
- x-target-url: `https://api.openai.com/v1/chat/completions`

### Claude API
- x-target-url: `https://api.anthropic.com/v1/messages`

### Google Gemini
- x-target-url: `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent`

## 注意

- Vercel Serverless 有 10MB response limit
- 只支持 HTTP/HTTPS
- 需要瀏覽器extension配合
