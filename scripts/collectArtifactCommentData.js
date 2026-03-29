// @ts-check
/* eslint-disable camelcase */

const artifactPlatformPattern = /(?<platform>(?<os>windows|macos|linux)-(?<arch>[a-z0-9]+))(?:-|$)/
const platformJobPattern = /^(windows|macos|linux)-[a-z0-9]+$/
const failedStepConclusions = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure'])

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
  return steps?.find(step => step.conclusion && failedStepConclusions.has(step.conclusion))?.name ?? 'Unknown step'
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
  if (job.conclusion !== 'success') {
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
 * @param {{
 *   github: {
 *     rest: {
 *       actions: {
 *         listWorkflowRunArtifacts: (input: {owner: string, repo: string, run_id: number}) => Promise<{data: {artifacts: {id:number, name: string, size_in_bytes: number, workflow_run: {id:number}}[]}}>,
 *         listJobsForWorkflowRun: unknown,
 *       }
 *     },
 *     paginate: (route: unknown, input: {owner: string, repo: string, run_id: number, per_page: number}) => Promise<{name: string, conclusion?: string | null, html_url: string, steps?: {name: string, conclusion?: string | null}[]}[]>,
 *   },
 *   context: {
 *     repo: {owner: string, repo: string},
 *     payload: {workflow_run: {id: number}},
 *   },
 *   sha: string,
 * }} options
 */
async function collectArtifactCommentData({ github, context, sha }) {
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
  const artifacts = artifactsResponse.data.artifacts
  const uploadedPlatforms = getUploadedPlatforms(artifacts)
  const platformJobs = jobs.filter(job => platformJobPattern.test(job.name))
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
