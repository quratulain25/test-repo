/**
 * Site-specific worker template
 * This worker handles the actual site content and logic
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // Check if this request comes from the platform worker
      const isPlatformRequest = request.headers.get('X-Edison-Lite-Platform') === 'true';
      const siteInfo = request.headers.get('X-Edison-Lite-Site');

      // Load edison.yml configuration from KV
      const config = await loadEdisonConfig(siteInfo, env);

      // Handle the request based on the site configuration
      return await handleSiteRequest(request, config, env);
    } catch (error) {
      console.error('Site worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Load edison.yml configuration from KV storage
 */
async function loadEdisonConfig(siteInfo, env) {
  if (!siteInfo) {
    return {};
  }

  const [owner, repo, branch] = siteInfo.split('/');
  const branchKey = branch.replace(/\//g, '-');

  try {
    const configData = await env.EDISON_METADATA.get(`edison-metadata:${branchKey}`);
    return configData ? JSON.parse(configData) : {};
  } catch (error) {
    console.error('Error loading edison config:', error);
    return {};
  }
}

/**
 * Handle site-specific request
 */
async function handleSiteRequest(request, config, env) {
  const url = new URL(request.url);

  // Handle different types of content based on configuration
  if (url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.')) {
    return await handlePageRequest(request, config, env);
  }
  return await handleAssetRequest(request, config, env);
}

/**
 * Handle page requests (HTML)
 */
async function handlePageRequest(request, config, env) {
  // This would integrate with Franklin/Helix for content delivery
  // For now, return a basic response

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edison Lite Site</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Edison Lite 3.0 - Site Worker</h1>
        <div class="info">
            <h3>Site Information</h3>
            <p><strong>URL:</strong> ${request.url}</p>
            <p><strong>Site Info:</strong> ${request.headers.get('X-Edison-Lite-Site') || 'Not available'}</p>
            <p><strong>Platform Request:</strong> ${request.headers.get('X-Edison-Lite-Platform') === 'true' ? 'Yes' : 'No'}</p>
        </div>
        <div class="info">
            <h3>Configuration</h3>
            <pre>${JSON.stringify(config, null, 2)}</pre>
        </div>
        <p>This is a preview environment powered by Edison Lite 3.0 and Cloudflare Workers.</p>
    </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Edison-Lite-Worker': 'site-worker',
    },
  });
}

/**
 * Handle asset requests (CSS, JS, images, etc.)
 */
async function handleAssetRequest(request, config, env) {
  // For assets, we might want to proxy to the original source or CDN
  // This is a simplified implementation

  const url = new URL(request.url);

  // Try to serve from the original Franklin/Helix source
  // This would be configured based on the edison.yml settings
  const franklinUrl = `https://main--${config.repo || 'repo'}--${config.owner || 'owner'}.hlx.page${url.pathname}`;

  try {
    const response = await fetch(franklinUrl);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    return new Response('Asset not found', { status: 404 });
  }
}
