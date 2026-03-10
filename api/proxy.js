// Vercel HTTP Proxy - Enhanced Version
// Supports: 
// 1. x-target-url header (for API calls)
// 2. URL path format: /https://target.com (for browsing)

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  // Get target URL - check multiple sources
  let targetUrl = req.headers['x-target-url'];
  
  // Extract from URL path: /https://example.com → https://example.com
  const url = new URL(req.url, 'https://' + req.headers['host']);
  const path = url.pathname;
  
  console.log('[Proxy] Received path:', path);

  if (path && path !== '/') {
    // Remove leading slash
    let cleanPath = path.substring(1);
    
    // Decode if encoded
    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch (e) {}
    
    // Fix: ensure protocol has double slashes
    // Handle cases like: https:/example.com → https://example.com
    cleanPath = cleanPath.replace(/^http:\/+/, 'https://');
    cleanPath = cleanPath.replace(/^https:\/+/, 'https://');
    
    targetUrl = cleanPath;
  }

  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing target URL',
      usage: {
        header: 'x-target-url: https://api.openai.com/v1',
        url: '/https://api.openai.com/v1/chat/completions',
        browse: 'https://vercel-proxy-tan-rho.vercel.app/https://google.com'
      }
    });
  }

  // Ensure targetUrl has protocol
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  console.log('[Proxy] Target URL:', targetUrl);

  try {
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

    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    
    // Handle redirect - convert back to proxy format
    if (response.redirected) {
      const newUrl = new URL(response.url);
      const proxyUrl = '/https://' + newUrl.hostname + newUrl.pathname;
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

    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(502).json({ 
      error: 'Proxy Error', 
      message: error.message,
      target: targetUrl
    });
  }
}
