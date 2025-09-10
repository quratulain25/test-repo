# Edison Lite 3.0 - Cloudflare Workers Architecture

This repository implements the enhanced Edison Lite architecture that enables sites to deploy full-stack frameworks seamlessly using Cloudflare Workers.

## Architecture Overview

Edison Lite 3.0 centralizes all customizations (CSP, redirects, proxies) within a single **platform worker**, which routes requests to appropriate **site-specific workers**. Each branch gets its own dedicated worker for complete isolation.

### Key Components

1. **Platform Worker** (`src/platform-worker.js`)
   - Central entry point for all requests
   - Handles CSP configuration, redirects, and security headers
   - Routes requests to site-specific workers
   - Falls back to legacy Edison Lite S3 for backwards compatibility

2. **Site-specific Workers** (`src/site-worker.js`)
   - Handle actual site content and logic
   - Load configuration from KV storage
   - Branch-specific deployment with naming convention: `edison-lite-{owner}-{repo}-{branch}`

3. **Franklin Orchestrator Integration** (`src/orchestrator-webhook.js`)
   - Handles GitHub Actions workflow job events
   - Creates/updates build records in Franklin Data
   - Manages instance lifecycle (create/update/delete)

4. **Branch Cleanup Handler** (`src/branch-cleanup.js`)
   - Automatically deletes instance records when branches are deleted
   - Only processes Edison Lite instances with Workflow Job ID/Run ID attributes

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/edison-lite-ci.yaml`) implements three main jobs:

### Test Job (`Test / Automated tests`)
- Runs linting and automated tests
- Build type: `test-lite`

### Deploy Job (`Deploy / Deploy to Cloudflare`)
- Deploys branch-specific workers to Cloudflare
- Stores edison.yml metadata in KV storage
- Uses OIDC for secure authentication
- Build type: `deploy-lite-branch`

### Cleanup Job (`Cleanup / Delete assets`)
- Triggered on branch deletion
- Removes workers and KV metadata
- Build type: `cleanup-lite-branch`

## Configuration

### Edison Configuration (`edison.yml`)
Site-specific configuration including:
- Repository metadata
- Worker settings
- Security policies (CSP)
- Franklin/Helix integration
- Legacy fallback settings

### Wrangler Configuration (`wrangler.toml`)
Cloudflare Workers deployment configuration:
- Environment settings (production, staging)
- KV namespace bindings
- Worker naming and routing

## Event Processing

The system processes GitHub Actions workflow job events:

1. **"in_progress" action**: Creates build record with "running" status
2. **"completed" action**: Updates build record with success/failure status
3. **Sends Franklin Data events**: `franklin-data-{build-type}-{started/succeeded/failed}`

## URL Structure

Sites are accessed using the pattern:
```
https://{branch}--{repo}--{owner}.edison-lite-domain.com
```

## Environment Variables

Required secrets for GitHub Actions:
- `CLOUDFLARE_API_TOKEN`: Cloudflare API authentication
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account identifier
- `CLOUDFLARE_KV_NAMESPACE_ID`: KV storage namespace

## Development

### Setup
```bash
npm install
```

### Testing
```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

### Linting
```bash
npm run lint       # Run linter
npm run lint:js    # JavaScript only
npm run lint:css   # CSS only
```

### Local Development
```bash
npm run dev        # Start local development server
```

### Deployment
```bash
npm run deploy:platform  # Deploy platform worker
npm run deploy:site      # Deploy site worker
```

## Backwards Compatibility

Edison Lite 3.0 maintains backwards compatibility with legacy Edison Lite S3 deployments. When a site-specific worker is not found, the platform worker automatically falls back to the S3-based system.

## Testing

The project includes comprehensive tests for:
- Platform worker routing logic
- Orchestrator webhook event processing
- Configuration validation
- Branch cleanup handling

Tests are located in `test/edison-lite/` and integrate with the existing Franklin test infrastructure.

## Monitoring and Events

Build records are automatically created in Franklin Data with the following information:
- Build type (test-lite, deploy-lite-branch, cleanup-lite-branch)
- Status (running, success, failure)
- GitHub metadata (run ID, job ID, HTML URL)
- Author NTID (looked up via GitHub username)

Events are streamed to Franklin Orchestrator for real-time monitoring and integration with the broader Edison ecosystem.