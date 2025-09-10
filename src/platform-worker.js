/**
 * Edison Lite Platform Worker
 *
 * This is the central entry worker that handles:
 * - CSP configuration
 * - Redirects
 * - Proxying to site-specific workers
 * - Fallback to legacy Edison Lite S3
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { hostname } = url;

    try {
      // Extract site information from hostname or path
      const siteInfo = await extractSiteInfo(url, env);

      if (!siteInfo) {
        return new Response('Site not found', { status: 404 });
      }

      // Check if site-specific worker exists
      const workerExists = await checkWorkerExists(siteInfo, env);

      if (workerExists) {
        // Route to site-specific worker
        return await routeToSiteWorker(request, siteInfo, env);
      }
      // Fallback to legacy Edison Lite S3
      return await fallbackToLegacy(request, siteInfo, env);
    } catch (error) {
      console.error('Platform worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Extract site information from URL
 */
async function extractSiteInfo(url, env) {
  // Parse hostname to extract owner, repo, branch
  // Format: branch--repo--owner.domain.com or similar
  const parts = url.hostname.split('.');
  const sitePart = parts[0];

  if (!sitePart.includes('--')) {
    return null;
  }

  const [branch, repo, owner] = sitePart.split('--');

  return {
    owner,
    repo,
    branch,
    workerName: `edison-lite-${owner}-${repo}-${branch.replace(/\//g, '-')}`,
  };
}

/**
 * Check if site-specific worker exists by looking up metadata in KV
 */
async function checkWorkerExists(siteInfo, env) {
  try {
    const metadata = await env.EDISON_METADATA.get(`edison-metadata:${siteInfo.branch.replace(/\//g, '-')}`);
    return metadata !== null;
  } catch (error) {
    console.error('Error checking worker existence:', error);
    return false;
  }
}

/**
 * Route request to site-specific worker
 */
async function routeToSiteWorker(request, siteInfo, env) {
  // Create the worker URL
  const workerUrl = `https://${siteInfo.workerName}.workers.dev`;

  // Forward the request to the site-specific worker
  const modifiedRequest = new Request(request.url.replace(request.url.split('/')[2], `${siteInfo.workerName}.workers.dev`), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  // Add Edison Lite headers
  modifiedRequest.headers.set('X-Edison-Lite-Platform', 'true');
  modifiedRequest.headers.set('X-Edison-Lite-Site', `${siteInfo.owner}/${siteInfo.repo}/${siteInfo.branch}`);

  // Apply CSP and security headers
  const response = await fetch(modifiedRequest);
  return addSecurityHeaders(response);
}

/**
 * Fallback to legacy Edison Lite S3
 */
async function fallbackToLegacy(request, siteInfo, env) {
  const legacyUrl = env.LEGACY_S3_FALLBACK_URL || 'https://legacy-edison-lite.s3.amazonaws.com';
  const fallbackUrl = `${legacyUrl}/${siteInfo.owner}/${siteInfo.repo}/${siteInfo.branch}${new URL(request.url).pathname}`;

  const fallbackRequest = new Request(fallbackUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const response = await fetch(fallbackRequest);
  return addSecurityHeaders(response);
}

/**
 * Add security headers including CSP
 */
function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);

  // Content Security Policy
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://www.google-analytics.com",
    "frame-ancestors 'none'",
  ].join('; '));

  // Other security headers
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Edison-Lite-Version', '3.0');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
