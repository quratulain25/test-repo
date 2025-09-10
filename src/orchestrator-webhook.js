/**
 * Franklin Orchestrator Webhook Handler
 *
 * This module handles GitHub Actions workflow job events and creates/updates
 * build records in Franklin Data
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const event = await request.json();

      // Verify this is a workflow job event
      if (!event.workflow_job) {
        return new Response('Not a workflow job event', { status: 400 });
      }

      // Process the workflow job event
      return await processWorkflowJobEvent(event, env);
    } catch (error) {
      console.error('Webhook handler error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Process GitHub Actions workflow job events
 */
async function processWorkflowJobEvent(event, env) {
  const {
    action, workflow_job, repository, sender,
  } = event;

  // Only process specific actions
  if (!['in_progress', 'completed'].includes(action)) {
    return new Response('Action ignored', { status: 200 });
  }

  // Only process Edison Lite jobs
  const jobName = workflow_job.name;
  const supportedJobs = [
    'Test / Automated tests',
    'Deploy / Deploy to Cloudflare',
    'Cleanup / Delete assets',
  ];

  if (!supportedJobs.includes(jobName)) {
    return new Response('Job ignored', { status: 200 });
  }

  // Extract site information
  const siteInfo = {
    owner: repository.owner.login,
    repo: repository.name,
    branch: workflow_job.head_branch,
    isTag: workflow_job.head_branch.startsWith('refs/tags/'),
    runId: workflow_job.run_id,
    jobId: workflow_job.id,
    htmlUrl: workflow_job.html_url,
  };

  // Determine build type
  const buildType = getBuildType(jobName);

  if (action === 'in_progress') {
    return await handleJobInProgress(siteInfo, buildType, workflow_job, sender, env);
  } if (action === 'completed') {
    return await handleJobCompleted(siteInfo, buildType, workflow_job, sender, env);
  }

  return new Response('OK', { status: 200 });
}

/**
 * Map job names to build types
 */
function getBuildType(jobName) {
  const mapping = {
    'Test / Automated tests': 'test-lite',
    'Deploy / Deploy to Cloudflare': 'deploy-lite-branch',
    'Cleanup / Delete assets': 'cleanup-lite-branch',
  };

  return mapping[jobName] || 'unknown';
}

/**
 * Handle job in progress action
 */
async function handleJobInProgress(siteInfo, buildType, workflowJob, sender, env) {
  try {
    // Ensure instance exists
    await ensureInstanceExists(siteInfo, env);

    // Lookup author by GitHub username
    const authorNtid = await lookupAuthorNtid(sender.login, env);

    // Create build record
    const buildRecord = {
      id: workflowJob.id,
      instanceId: `${siteInfo.owner}/${siteInfo.repo}/${siteInfo.branch}`,
      buildType,
      status: 'running',
      runId: siteInfo.runId,
      jobId: siteInfo.jobId,
      htmlUrl: siteInfo.htmlUrl,
      authorNtid,
      startedAt: workflowJob.started_at,
      createdAt: new Date().toISOString(),
    };

    // Save to Franklin Data
    await saveBuildRecord(buildRecord, env);

    // Send event
    await sendFranklinDataEvent(`franklin-data-${buildType}-started`, buildRecord, env);

    return new Response('Build record created', { status: 201 });
  } catch (error) {
    console.error('Error handling job in progress:', error);
    return new Response('Error processing job', { status: 500 });
  }
}

/**
 * Handle job completed action
 */
async function handleJobCompleted(siteInfo, buildType, workflowJob, sender, env) {
  try {
    // Load existing build record
    const buildRecord = await loadBuildRecord(workflowJob.id, env);

    if (!buildRecord) {
      console.error('Build record not found for job:', workflowJob.id);
      return new Response('Build record not found', { status: 404 });
    }

    // Update build record with completion status
    buildRecord.status = workflowJob.conclusion === 'success' ? 'success' : 'failure';
    buildRecord.conclusion = workflowJob.conclusion;
    buildRecord.completedAt = workflowJob.completed_at;
    buildRecord.updatedAt = new Date().toISOString();

    // Save updated record
    await saveBuildRecord(buildRecord, env);

    // Send event
    const eventType = buildRecord.status === 'success' ? 'succeeded' : 'failed';
    await sendFranklinDataEvent(`franklin-data-${buildType}-${eventType}`, buildRecord, env);

    return new Response('Build record updated', { status: 200 });
  } catch (error) {
    console.error('Error handling job completed:', error);
    return new Response('Error processing job', { status: 500 });
  }
}

/**
 * Ensure instance record exists in Franklin Data
 */
async function ensureInstanceExists(siteInfo, env) {
  const instanceId = `${siteInfo.owner}/${siteInfo.repo}/${siteInfo.branch}`;

  // Check if instance exists
  const existingInstance = await loadInstance(instanceId, env);

  if (!existingInstance) {
    // Create new instance
    const instance = {
      id: instanceId,
      owner: siteInfo.owner,
      repo: siteInfo.repo,
      branch: siteInfo.branch,
      isLive: siteInfo.isTag,
      workflowJobId: siteInfo.jobId,
      runId: siteInfo.runId,
      createdAt: new Date().toISOString(),
    };

    await saveInstance(instance, env);
  }
}

/**
 * Lookup author NTID by GitHub username
 */
async function lookupAuthorNtid(ghUsername, env) {
  try {
    // This would query Franklin Data users table
    // For now, return the GitHub username as fallback
    const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;
    const response = await fetch(`${franklinDataUrl}/api/users/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gh_username: ghUsername }),
    });

    if (response.ok) {
      const user = await response.json();
      return user.ntid || ghUsername;
    }
  } catch (error) {
    console.error('Error looking up author NTID:', error);
  }

  return ghUsername; // Fallback
}

/**
 * Save build record to Franklin Data
 */
async function saveBuildRecord(buildRecord, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  const response = await fetch(`${franklinDataUrl}/api/builds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRecord),
  });

  if (!response.ok) {
    throw new Error(`Failed to save build record: ${response.statusText}`);
  }
}

/**
 * Load build record from Franklin Data
 */
async function loadBuildRecord(jobId, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  const response = await fetch(`${franklinDataUrl}/api/builds/${jobId}`);

  if (response.ok) {
    return await response.json();
  }

  return null;
}

/**
 * Save instance to Franklin Data
 */
async function saveInstance(instance, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  const response = await fetch(`${franklinDataUrl}/api/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(instance),
  });

  if (!response.ok) {
    throw new Error(`Failed to save instance: ${response.statusText}`);
  }
}

/**
 * Load instance from Franklin Data
 */
async function loadInstance(instanceId, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  const response = await fetch(`${franklinDataUrl}/api/instances/${encodeURIComponent(instanceId)}`);

  if (response.ok) {
    return await response.json();
  }

  return null;
}

/**
 * Send Franklin Data event
 */
async function sendFranklinDataEvent(eventType, buildRecord, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  const eventPayload = {
    type: eventType,
    timestamp: new Date().toISOString(),
    data: buildRecord,
  };

  try {
    await fetch(`${franklinDataUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
    });
  } catch (error) {
    console.error('Error sending Franklin Data event:', error);
  }
}
