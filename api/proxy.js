// Vercel HTTP Proxy
// Usage: Set x-target-url header to the target URL
// Browser Extension: Use "Requestly" or "ModHeader" to add header

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  // Get target URL from header
  let targetUrl = req.headers['x-target-url'];

  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing x-target-url header',
      usage: 'Set header: x-target-url: https://api.openai.com/v1/chat/completions'
    });
  }

  // Ensure targetUrl has protocol
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    // Build headers (filter out hop-by-hop headers)
    const headers = {};
    const hopByHopHeaders = [
      'connection', 'keep-alive', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailers',
      'transfer-encoding', 'upgrade', 'host',
      'x-target-url', 'x-vercel-proxy' // Remove our custom headers
    ];
    
    for (const [key, value] of Object.entries(req.headers)) {
      if (!hopByHopHeaders.includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // Remove encoding for clean proxy
    delete headers['accept-encoding'];

    console.log(`[Proxy] ${req.method} ${targetUrl}`);

    // Make the request
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
    });

    // Get response
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.status(response.status);

    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error(`[Proxy] Error: ${error.message}`);
    res.status(502).json({ 
      error: 'Proxy Error', 
      message: error.message 
    });
  }
}
