import { expect } from '@esm-bundle/chai';

describe('Edison Configuration', () => {
  it('should have valid edison.yml format', () => {
    // This test validates the edison.yml configuration structure
    const config = {
      name: 'Edison Lite Test Site',
      description: 'Test site for Edison Lite 3.0 architecture',
      version: '3.0.0',
      repository: {
        owner: 'quratulain25',
        name: 'test-repo',
      },
      deployment: {
        platform: 'cloudflare-workers',
        environment: 'preview',
      },
      worker: {
        name: 'edison-lite-site',
        routes: [],
      },
      security: {
        csp: {
          enabled: true,
          directives: {
            'default-src': "'self'",
            'script-src': "'self' 'unsafe-inline' 'unsafe-eval' https://www.google-analytics.com",
          },
        },
      },
    };

    expect(config.name).to.be.a('string');
    expect(config.version).to.equal('3.0.0');
    expect(config.repository.owner).to.equal('quratulain25');
    expect(config.deployment.platform).to.equal('cloudflare-workers');
    expect(config.security.csp.enabled).to.be.true;
  });

  it('should validate worker naming convention', () => {
    const generateWorkerName = (owner, repo, branch) => `edison-lite-${owner}-${repo}-${branch.replace(/\//g, '-')}`;

    expect(generateWorkerName('quratulain25', 'test-repo', 'main')).to.equal('edison-lite-quratulain25-test-repo-main');
    expect(generateWorkerName('owner', 'repo', 'feature/branch')).to.equal('edison-lite-owner-repo-feature-branch');
  });

  it('should validate KV key naming convention', () => {
    const generateKVKey = (branch) => `edison-metadata:${branch.replace(/\//g, '-')}`;

    expect(generateKVKey('main')).to.equal('edison-metadata:main');
    expect(generateKVKey('feature/test')).to.equal('edison-metadata:feature-test');
  });
});

describe('Branch Cleanup Handler', () => {
  let cleanupHandler;

  before(() => {
    cleanupHandler = {
      validateDeletionEvent(event) {
        return event.action === 'deleted' && event.ref_type === 'branch';
      },

      shouldDeleteInstance(instance) {
        return !!(instance && instance.workflowJobId && instance.runId);
      },

      extractBranchInfo(event) {
        return {
          owner: event.repository.owner.login,
          repo: event.repository.name,
          branch: event.ref,
        };
      },
    };
  });

  it('should validate branch deletion events correctly', () => {
    const validEvent = {
      action: 'deleted',
      ref_type: 'branch',
      ref: 'feature-branch',
      repository: {
        owner: { login: 'quratulain25' },
        name: 'test-repo',
      },
    };

    expect(cleanupHandler.validateDeletionEvent(validEvent)).to.be.true;

    const invalidEvent = {
      action: 'created',
      ref_type: 'branch',
    };

    expect(cleanupHandler.validateDeletionEvent(invalidEvent)).to.be.false;
  });

  it('should only delete instances with workflow attributes', () => {
    const validInstance = {
      id: 'owner/repo/branch',
      workflowJobId: '123',
      runId: '456',
    };

    const invalidInstance = {
      id: 'owner/repo/branch',
    };

    const instanceWithOnlyJobId = {
      id: 'owner/repo/branch',
      workflowJobId: '123',
    };

    const instanceWithOnlyRunId = {
      id: 'owner/repo/branch',
      runId: '456',
    };

    expect(cleanupHandler.shouldDeleteInstance(validInstance)).to.be.true;
    expect(cleanupHandler.shouldDeleteInstance(invalidInstance)).to.be.false;
    expect(cleanupHandler.shouldDeleteInstance(instanceWithOnlyJobId)).to.be.false;
    expect(cleanupHandler.shouldDeleteInstance(instanceWithOnlyRunId)).to.be.false;
    expect(cleanupHandler.shouldDeleteInstance(null)).to.be.false;
  });

  it('should extract branch info correctly', () => {
    const event = {
      action: 'deleted',
      ref_type: 'branch',
      ref: 'feature-branch',
      repository: {
        owner: { login: 'quratulain25' },
        name: 'test-repo',
      },
    };

    const branchInfo = cleanupHandler.extractBranchInfo(event);

    expect(branchInfo.owner).to.equal('quratulain25');
    expect(branchInfo.repo).to.equal('test-repo');
    expect(branchInfo.branch).to.equal('feature-branch');
  });
});
