import { expect } from '@esm-bundle/chai';

describe('Edison Lite Orchestrator Webhook', () => {
  let orchestratorHandler;

  before(() => {
    // Simplified orchestrator handler for testing
    orchestratorHandler = {
      getBuildType(jobName) {
        const mapping = {
          'Test / Automated tests': 'test-lite',
          'Deploy / Deploy to Cloudflare': 'deploy-lite-branch',
          'Cleanup / Delete assets': 'cleanup-lite-branch',
        };

        return mapping[jobName] || 'unknown';
      },

      validateWorkflowJobEvent(event) {
        return event.workflow_job
               && ['in_progress', 'completed'].includes(event.action)
               && ['Test / Automated tests', 'Deploy / Deploy to Cloudflare', 'Cleanup / Delete assets'].includes(event.workflow_job.name);
      },

      extractSiteInfo(event) {
        const { workflow_job, repository } = event;

        return {
          owner: repository.owner.login,
          repo: repository.name,
          branch: workflow_job.head_branch,
          isTag: workflow_job.head_branch.startsWith('refs/tags/'),
          runId: workflow_job.run_id,
          jobId: workflow_job.id,
          htmlUrl: workflow_job.html_url,
        };
      },
    };
  });

  it('should map job names to build types correctly', () => {
    expect(orchestratorHandler.getBuildType('Test / Automated tests')).to.equal('test-lite');
    expect(orchestratorHandler.getBuildType('Deploy / Deploy to Cloudflare')).to.equal('deploy-lite-branch');
    expect(orchestratorHandler.getBuildType('Cleanup / Delete assets')).to.equal('cleanup-lite-branch');
    expect(orchestratorHandler.getBuildType('Unknown Job')).to.equal('unknown');
  });

  it('should validate workflow job events correctly', () => {
    const validEvent = {
      action: 'in_progress',
      workflow_job: {
        name: 'Test / Automated tests',
        id: 123,
        run_id: 456,
        head_branch: 'main',
      },
      repository: {
        owner: { login: 'quratulain25' },
        name: 'test-repo',
      },
      sender: { login: 'testuser' },
    };

    expect(orchestratorHandler.validateWorkflowJobEvent(validEvent)).to.be.true;

    const invalidEvent = {
      action: 'queued',
      workflow_job: {
        name: 'Test / Automated tests',
      },
    };

    expect(orchestratorHandler.validateWorkflowJobEvent(invalidEvent)).to.be.false;
  });

  it('should extract site info from event correctly', () => {
    const event = {
      workflow_job: {
        name: 'Test / Automated tests',
        id: 123,
        run_id: 456,
        head_branch: 'main',
        html_url: 'https://github.com/quratulain25/test-repo/actions/runs/456/job/123',
      },
      repository: {
        owner: { login: 'quratulain25' },
        name: 'test-repo',
      },
    };

    const siteInfo = orchestratorHandler.extractSiteInfo(event);

    expect(siteInfo.owner).to.equal('quratulain25');
    expect(siteInfo.repo).to.equal('test-repo');
    expect(siteInfo.branch).to.equal('main');
    expect(siteInfo.runId).to.equal(456);
    expect(siteInfo.jobId).to.equal(123);
    expect(siteInfo.isTag).to.be.false;
  });

  it('should detect git tags correctly', () => {
    const event = {
      workflow_job: {
        head_branch: 'refs/tags/v1.0.0',
        id: 123,
        run_id: 456,
      },
      repository: {
        owner: { login: 'quratulain25' },
        name: 'test-repo',
      },
    };

    const siteInfo = orchestratorHandler.extractSiteInfo(event);
    expect(siteInfo.isTag).to.be.true;
  });

  it('should ignore unsupported job names', () => {
    const event = {
      action: 'in_progress',
      workflow_job: {
        name: 'Some Other Job',
        id: 123,
      },
    };

    expect(orchestratorHandler.validateWorkflowJobEvent(event)).to.be.false;
  });

  it('should ignore unsupported actions', () => {
    const event = {
      action: 'queued',
      workflow_job: {
        name: 'Test / Automated tests',
        id: 123,
      },
    };

    expect(orchestratorHandler.validateWorkflowJobEvent(event)).to.be.false;
  });
});
