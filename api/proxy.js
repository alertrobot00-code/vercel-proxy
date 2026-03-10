// Vercel HTTP Proxy - Enhanced Version with HTML Rewriting
// Supports: 
// 1. x-target-url header (for API calls)
// 2. ?url= query parameter
// 3. URL path format: /https://target.com (for browsing)
// 4. HTML Rewriting for relative links

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  // Get target URL from multiple sources
  let targetUrl = req.headers['x-target-url'];
  
  // Check query parameter: ?url=https://...
  const urlQuery = req.query.url;
  if (urlQuery) {
    targetUrl = Array.isArray(urlQuery) ? urlQuery[0] : urlQuery;
  }
  
  // Extract from URL path: /https://example.com → https://example.com
  if (!targetUrl) {
    const url = new URL(req.url, 'https://' + req.headers['host']);
    const path = url.pathname;
    
    if (path && path !== '/') {
      let cleanPath = path.substring(1);
      try {
        cleanPath = decodeURIComponent(cleanPath);
      } catch (e) {}
      
      // Fix: ensure protocol has double slashes
      cleanPath = cleanPath.replace(/^http:\/+/, 'https://');
      cleanPath = cleanPath.replace(/^https:\/+/, 'https://');
      
      targetUrl = cleanPath;
    }
  }

  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing target URL',
      usage: {
        header: 'x-target-url: https://api.openai.com/v1',
        query: '?url=https://api.openai.com/v1',
        path: '/https://api.openai.com/v1/chat/completions'
      }
    });
  }

  // Ensure targetUrl has protocol
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const targetObj = new URL(targetUrl);
    const proxyBase = 'https://' + req.headers['host'];

    // Build headers
    const headers = {};
    const hopByHopHeaders = [
      'connection', 'keep-alive', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailers',
      'transfer-encoding', 'upgrade', 'host',
      'x-target-url', 'x-vercel-proxy'
    ];
    
    for (const [key, value] of Object.entries(req.headers)) {
      if (!hopByHopHeaders.includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // Force uncompressed response
    headers['Accept-Encoding'] = 'identity';
    
    // Remove referer to avoid blocking
    delete headers['referer'];

    console.log('[Proxy] Target:', targetUrl);

    // Make the request
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'follow'
    });

    // Get response
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'text/html';
    let body = Buffer.from(buffer);

    // HTML Rewriting - Convert relative links to proxy format
    const contentTypeLower = contentType.toLowerCase();
    if (contentTypeLower.includes('text/html')) {
      let html = body.toString('utf-8');
      
      // Extract base URL for resolving relative paths
      const baseUrl = targetObj.origin;
      
      // Rewrite relative URLs in href/src attributes
      // Match: href="/path", src="/path", action="/path", data-url="/path"
      const attributePatterns = [
        { pattern: /href=["']([^"']+)["']/g, attribute: 'href' },
        { pattern: /src=["']([^"']+)["']/g, attribute: 'src' },
        { pattern: /action=["']([^"']+)["']/g, attribute: 'action' },
        { pattern: /data-url=["']([^"']+)["']/g, attribute: 'data-url' },
        { pattern: /data-src=["']([^"']+)["']/g, attribute: 'data-src' },
        { pattern: /data-href=["']([^"']+)["']/g, attribute: 'data-href' },
      ];

      for (const { pattern, attribute } of attributePatterns) {
        html = html.replace(pattern, (match, url) => {
          // Skip if already absolute URL pointing to different domain
          if (url.startsWith('http') && !url.startsWith(targetObj.origin)) {
            // Rewrite external absolute URLs too
            const encodedUrl = encodeURIComponent(url);
            return `${attribute}="${proxyBase}/?url=${encodedUrl}"`;
          }
          // Skip javascript: URLs
          if (url.startsWith('javascript:') || url.startsWith('data:')) {
            return match;
          }
          // Convert relative URL to proxy format
          const fullUrl = url.startsWith('/') ? baseUrl + url : baseUrl + '/' + url;
          const encodedUrl = encodeURIComponent(fullUrl);
          return `${attribute}="${proxyBase}/?url=${encodedUrl}"`;
        });
      }

      // Also rewrite location.href and window.location in inline scripts (basic)
      // This is limited but helps with some SPA routing
      html = html.replace(/(location\.href\s*=\s*["'])([^"']+)(["'])/g, (match, prefix, url, suffix) => {
        if (url.startsWith('http') && !url.startsWith(targetObj.origin)) {
          const encodedUrl = encodeURIComponent(url);
          return `${prefix}${proxyBase}/?url=${encodedUrl}${suffix}`;
        }
        if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('#')) {
          const fullUrl = baseUrl + '/' + url;
          const encodedUrl = encodeURIComponent(fullUrl);
          return `${prefix}${proxyBase}/?url=${encodedUrl}${suffix}`;
        }
        if (url.startsWith('/')) {
          const fullUrl = baseUrl + url;
          const encodedUrl = encodeURIComponent(fullUrl);
          return `${prefix}${proxyBase}/?url=${encodedUrl}${suffix}`;
        }
        return match;
      });

      body = Buffer.from(html, 'utf-8');
    }

    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    
    // Handle redirect - convert back to proxy format
    if (response.redirected) {
      const newUrl = new URL(response.url);
      const proxyUrl = '/?url=' + encodeURIComponent(newUrl.origin + newUrl.pathname + newUrl.search);
      res.setHeader('Location', proxyUrl);
    }
    
    res.status(response.status);

    // Copy other headers (except hop-by-hop)
    response.headers.forEach((value, key) => {
      if (!hopByHopHeaders.includes(key.toLowerCase()) && 
          !['content-type', 'location', 'access-control-allow-origin', 'content-encoding'].includes(key.toLowerCase())) {
        try {
          res.setHeader(key, value);
        } catch (e) {}
      }
    });

    res.send(body);

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(502).json({ 
      error: 'Proxy Error', 
      message: error.message,
      target: targetUrl
    });
  }
}
