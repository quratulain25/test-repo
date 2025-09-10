/**
 * Branch deletion handler
 * Handles cleanup of instance records when branches are deleted
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const event = await request.json();

      // Check if this is a delete event
      if (event.action !== 'deleted' || event.ref_type !== 'branch') {
        return new Response('Not a branch deletion event', { status: 400 });
      }

      return await handleBranchDeletion(event, env);
    } catch (error) {
      console.error('Branch deletion handler error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Handle branch deletion event
 */
async function handleBranchDeletion(event, env) {
  const { ref, repository } = event;

  const siteInfo = {
    owner: repository.owner.login,
    repo: repository.name,
    branch: ref,
  };

  const instanceId = `${siteInfo.owner}/${siteInfo.repo}/${siteInfo.branch}`;

  try {
    // Load the instance to check if it has Workflow Job ID/Run ID attributes
    const instance = await loadInstance(instanceId, env);

    if (!instance) {
      return new Response('Instance not found', { status: 404 });
    }

    // Only delete Edison Lite instances with Workflow Job ID/Run ID attributes
    if (!instance.workflowJobId || !instance.runId) {
      console.log(`Skipping deletion of instance ${instanceId} - missing workflow attributes`);
      return new Response('Instance not eligible for deletion', { status: 200 });
    }

    // Delete the instance from DynamoDB/Franklin Data
    await deleteInstance(instanceId, env);

    console.log(`Successfully deleted instance: ${instanceId}`);
    return new Response('Instance deleted', { status: 200 });
  } catch (error) {
    console.error('Error handling branch deletion:', error);
    return new Response('Error processing deletion', { status: 500 });
  }
}

/**
 * Load instance from Franklin Data
 */
async function loadInstance(instanceId, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  try {
    const response = await fetch(`${franklinDataUrl}/api/instances/${encodeURIComponent(instanceId)}`);

    if (response.ok) {
      return await response.json();
    }

    return null;
  } catch (error) {
    console.error('Error loading instance:', error);
    return null;
  }
}

/**
 * Delete instance from Franklin Data
 */
async function deleteInstance(instanceId, env) {
  const franklinDataUrl = env.FRANKLIN_ORCHESTRATOR_URL;

  const response = await fetch(`${franklinDataUrl}/api/instances/${encodeURIComponent(instanceId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete instance: ${response.statusText}`);
  }
}
