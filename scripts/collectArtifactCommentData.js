// @ts-check
/* eslint-disable camelcase */

const artifactPlatformPattern = /(?<platform>(?<os>windows|macos|linux)-(?<arch>[a-z0-9]+))(?:-|$)/
const platformJobPattern = /^(windows|macos|linux)-[a-z0-9]+$/
const failedJobConclusions = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure', 'action_required'])
const defaultJobsApiSyncDelayMs = 5000
const defaultJobsApiSyncMaxAttempts = 6

/**
 * @typedef {{id:number, name: string, size_in_bytes: number, workflow_run: {id:number}}} Artifact
 * @typedef {{name: string, conclusion?: string | null}} JobStep
 * @typedef {{name: string, conclusion?: string | null, html_url: string, steps?: JobStep[]}} WorkflowJob
 * @typedef {{artifacts: Artifact[], platformJobs: WorkflowJob[]}} ArtifactCommentSnapshot
 * @typedef {{
 *   rest: {
 *     actions: {
 *       listWorkflowRunArtifacts: (input: {owner: string, repo: string, run_id: number}) => Promise<{data: {artifacts: Artifact[]}}>,
 *       listJobsForWorkflowRun: unknown,
 *     }
 *   },
 *   paginate: (route: unknown, input: {owner: string, repo: string, run_id: number, per_page: number}) => Promise<WorkflowJob[]>,
 * }} GitHubActionsClient
 * @typedef {{repo: {owner: string, repo: string}, payload: {workflow_run: {id: number}}}} GitHubWorkflowContext
 */

/**
 * @param {{name: string}[]} artifacts
 * @returns {Set<string>}
 */
function getUploadedPlatforms(artifacts) {
  const uploadedPlatforms = new Set()

  for (const artifact of artifacts) {
    const platform = artifactPlatformPattern.exec(artifact.name)?.groups?.platform

    if (platform) {
      uploadedPlatforms.add(platform)
    }
  }

  return uploadedPlatforms
}

/**
 * @param {{conclusion?: string | null, name: string}[]} [steps]
 */
function getFailedStepName(steps) {
  return steps?.find(step => step.conclusion && failedJobConclusions.has(step.conclusion))?.name ?? 'Unknown step'
}

/**
 * @param {number} milliseconds
 */
function waitForMilliseconds(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

/**
 * @param {{
 *   name: string,
 *   conclusion?: string | null,
 *   html_url: string,
 *   steps?: {name: string, conclusion?: string | null}[]
 * }} job
 * @param {Set<string>} uploadedPlatforms
 * @returns {{platform: string, failedStep: string, conclusion: string, jobUrl: string} | undefined}
 */
function collectFailedJob(job, uploadedPlatforms) {
  if (!job.conclusion) {
    return {
      platform: job.name,
      failedStep: getFailedStepName(job.steps),
      conclusion: 'unknown',
      jobUrl: job.html_url,
    }
  }

  if (failedJobConclusions.has(job.conclusion)) {
    return {
      platform: job.name,
      failedStep: getFailedStepName(job.steps),
      conclusion: job.conclusion ?? 'unknown',
      jobUrl: job.html_url,
    }
  }

  if (!uploadedPlatforms.has(job.name)) {
    return {
      platform: job.name,
      failedStep: 'Upload build artifacts',
      conclusion: 'failure',
      jobUrl: job.html_url,
    }
  }
}

/**
 * @param {{name: string, conclusion?: string | null}[]} platformJobs
 */
function hasPendingJobConclusion(platformJobs) {
  return platformJobs.some(job => !job.conclusion)
}

/**
 * @param {{name: string, conclusion?: string | null}[]} platformJobs
 * @param {Set<string>} uploadedPlatforms
 */
function hasMissingSuccessfulPlatformArtifact(platformJobs, uploadedPlatforms) {
  return platformJobs.some(job => job.conclusion === 'success' && !uploadedPlatforms.has(job.name))
}

/**
 * @param {{name: string}[]} artifacts
 * @param {{name: string, conclusion?: string | null}[]} platformJobs
 */
function isArtifactCommentSnapshotSynced(artifacts, platformJobs) {
  const uploadedPlatforms = getUploadedPlatforms(artifacts)

  return !hasPendingJobConclusion(platformJobs)
    && !hasMissingSuccessfulPlatformArtifact(platformJobs, uploadedPlatforms)
}

/**
 * @param {{
 *   github: GitHubActionsClient,
 *   context: GitHubWorkflowContext,
 * }} options
 * @returns {Promise<ArtifactCommentSnapshot>}
 */
async function fetchArtifactCommentSnapshot({
  github,
  context,
}) {
  const artifactsResponse = await github.rest.actions.listWorkflowRunArtifacts({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: context.payload.workflow_run.id,
  })
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: context.payload.workflow_run.id,
    per_page: 100,
  })

  return {
    artifacts: artifactsResponse.data.artifacts,
    platformJobs: jobs.filter(job => platformJobPattern.test(job.name)),
  }
}

/**
 * @param {{
 *   github: GitHubActionsClient,
 *   context: GitHubWorkflowContext,
 *   wait: (milliseconds: number) => Promise<void>,
 *   jobsApiSyncDelayMs: number,
 *   jobsApiSyncMaxAttempts: number,
 *   attempt?: number,
 * }} options
 * @returns {Promise<ArtifactCommentSnapshot>}
 */
async function fetchSyncedArtifactCommentSnapshot({
  github,
  context,
  wait,
  jobsApiSyncDelayMs,
  jobsApiSyncMaxAttempts,
  attempt = 1,
}) {
  const snapshot = await fetchArtifactCommentSnapshot({ github, context })

  if (isArtifactCommentSnapshotSynced(snapshot.artifacts, snapshot.platformJobs) || attempt >= jobsApiSyncMaxAttempts) {
    return snapshot
  }

  await wait(jobsApiSyncDelayMs)

  return fetchSyncedArtifactCommentSnapshot({
    github,
    context,
    wait,
    jobsApiSyncDelayMs,
    jobsApiSyncMaxAttempts,
    attempt: attempt + 1,
  })
}

/**
 * @param {{
 *   github: GitHubActionsClient,
 *   context: GitHubWorkflowContext,
 *   sha: string,
 *   wait?: (milliseconds: number) => Promise<void>,
 *   jobsApiSyncDelayMs?: number,
 *   jobsApiSyncMaxAttempts?: number,
 * }} options
 */
async function collectArtifactCommentData({
  github,
  context,
  sha,
  wait = waitForMilliseconds,
  jobsApiSyncDelayMs = defaultJobsApiSyncDelayMs,
  jobsApiSyncMaxAttempts = defaultJobsApiSyncMaxAttempts,
}) {
  const maxAttempts = Math.max(1, jobsApiSyncMaxAttempts)
  const delayMs = Math.max(0, jobsApiSyncDelayMs)
  const { artifacts, platformJobs } = await fetchSyncedArtifactCommentSnapshot({
    github,
    context,
    wait,
    jobsApiSyncDelayMs: delayMs,
    jobsApiSyncMaxAttempts: maxAttempts,
  })

  const uploadedPlatforms = getUploadedPlatforms(artifacts)
  const failedJobs = platformJobs
    .flatMap((job) => {
      const failedJob = collectFailedJob(job, uploadedPlatforms)

      return failedJob ? [failedJob] : []
    })

  return {
    artifacts,
    sha,
    totalPlatformJobCount: platformJobs.length,
    failedJobs,
  }
}

export default collectArtifactCommentData
