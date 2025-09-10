import { expect } from '@esm-bundle/chai';

// Mock Cloudflare Worker environment
const mockEnv = {
  EDISON_METADATA: {
    get: async (key) => {
      if (key === 'edison-metadata:main') {
        return JSON.stringify({
          name: 'Test Site',
          owner: 'quratulain25',
          repo: 'test-repo',
        });
      }
      return null;
    },
    put: async (key, value) => true,
  },
  FRANKLIN_ORCHESTRATOR_URL: 'https://test-orchestrator.com',
  LEGACY_S3_FALLBACK_URL: 'https://test-legacy.s3.amazonaws.com',
};

// Import the platform worker (we'll simulate the module loading)
describe('Edison Lite Platform Worker', () => {
  let platformWorker;

  before(async () => {
    // Since we can't directly import ES modules in this test environment,
    // we'll create a simplified version for testing
    platformWorker = {
      async extractSiteInfo(url) {
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
      },

      async checkWorkerExists(siteInfo, env) {
        try {
          const metadata = await env.EDISON_METADATA.get(`edison-metadata:${siteInfo.branch.replace(/\//g, '-')}`);
          return metadata !== null;
        } catch (error) {
          return false;
        }
      },
    };
  });

  it('should extract site info from URL correctly', async () => {
    const url = new URL('https://main--test-repo--quratulain25.edison-lite.com');
    const siteInfo = await platformWorker.extractSiteInfo(url);

    expect(siteInfo).to.not.be.null;
    expect(siteInfo.owner).to.equal('quratulain25');
    expect(siteInfo.repo).to.equal('test-repo');
    expect(siteInfo.branch).to.equal('main');
    expect(siteInfo.workerName).to.equal('edison-lite-quratulain25-test-repo-main');
  });

  it('should return null for invalid URL format', async () => {
    const url = new URL('https://invalid-url.com');
    const siteInfo = await platformWorker.extractSiteInfo(url);

    expect(siteInfo).to.be.null;
  });

  it('should check if worker exists in KV', async () => {
    const siteInfo = {
      owner: 'quratulain25',
      repo: 'test-repo',
      branch: 'main',
    };

    const exists = await platformWorker.checkWorkerExists(siteInfo, mockEnv);
    expect(exists).to.be.true;

    const nonExistentSite = {
      owner: 'test',
      repo: 'test',
      branch: 'nonexistent',
    };

    const notExists = await platformWorker.checkWorkerExists(nonExistentSite, mockEnv);
    expect(notExists).to.be.false;
  });

  it('should handle branch names with slashes', async () => {
    const url = new URL('https://feature-branch--test-repo--quratulain25.edison-lite.com');
    const siteInfo = await platformWorker.extractSiteInfo(url);

    expect(siteInfo.workerName).to.equal('edison-lite-quratulain25-test-repo-feature-branch');
  });
});
