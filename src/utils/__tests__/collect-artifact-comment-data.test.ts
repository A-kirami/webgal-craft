/* eslint-disable camelcase */
import { describe, expect, it, vi } from 'vitest'

import collectArtifactCommentData from '../../../scripts/collectArtifactCommentData.js'

interface ArtifactFixture {
  id: number
  name: string
  size_in_bytes: number
  workflow_run: {
    id: number
  }
}

interface JobStepFixture {
  name: string
  conclusion?: string | null
}

interface JobFixture {
  name: string
  status?: string
  conclusion?: string | null
  html_url: string
  steps?: JobStepFixture[]
}

const workflowRunId = 42
const sha = 'abcdef0123456789'
const workflowContext = {
  repo: {
    owner: 'project',
    repo: 'webgal-craft',
  },
  payload: {
    workflow_run: {
      id: workflowRunId,
    },
  },
}
const windowsArtifact: ArtifactFixture = {
  id: 1,
  name: 'webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0',
  size_in_bytes: 10 * 1024 ** 2,
  workflow_run: { id: workflowRunId },
}
const androidArtifact: ArtifactFixture = {
  id: 2,
  name: 'webgal-craft-v1.2.3-android-arm64-pr-12-abcdef0',
  size_in_bytes: 20 * 1024 ** 2,
  workflow_run: { id: workflowRunId },
}
const successfulBuildSteps: JobStepFixture[] = [
  { name: 'Build app', conclusion: 'success' },
  { name: 'Upload build artifacts', conclusion: 'success' },
]

function jobUrl(jobId: number) {
  return `https://github.com/project/webgal-craft/runs/${workflowRunId}/jobs/${jobId}`
}

function createGithubClient({
  artifacts = [],
  jobs = [],
}: {
  artifacts?: ArtifactFixture[]
  jobs?: JobFixture[]
} = {}) {
  const listWorkflowRunArtifacts = vi.fn().mockResolvedValue({
    data: {
      artifacts,
    },
  })
  const paginate = vi.fn().mockResolvedValue(jobs)

  return {
    github: {
      rest: {
        actions: {
          listWorkflowRunArtifacts,
          listJobsForWorkflowRun: Symbol('listJobsForWorkflowRun'),
        },
      },
      paginate,
    },
    paginate,
  }
}

interface CollectOptions {
  github: ReturnType<typeof createGithubClient>['github']
  wait?: (milliseconds: number) => Promise<void>
  jobsApiSyncDelayMs?: number
  jobsApiSyncMaxAttempts?: number
}

function collectForTest({
  github,
  wait,
  jobsApiSyncDelayMs,
  jobsApiSyncMaxAttempts,
}: CollectOptions) {
  return collectArtifactCommentData({
    github,
    context: workflowContext,
    sha,
    wait,
    jobsApiSyncDelayMs,
    jobsApiSyncMaxAttempts,
  })
}

describe('collectArtifactCommentData', () => {
  it('汇总 artifact 并归一化构建失败与上传失败的 job', async () => {
    const { github } = createGithubClient({
      artifacts: [windowsArtifact, androidArtifact],
      jobs: [
        {
          name: 'windows-x64',
          conclusion: 'success',
          html_url: jobUrl(100),
          steps: successfulBuildSteps,
        },
        {
          name: 'linux-x64',
          conclusion: 'failure',
          html_url: jobUrl(101),
          steps: [
            { name: 'Build app', conclusion: 'failure' },
          ],
        },
        {
          name: 'macos-x64',
          conclusion: 'success',
          html_url: jobUrl(102),
          steps: successfulBuildSteps,
        },
        {
          name: 'android-arm64',
          conclusion: 'success',
          html_url: jobUrl(103),
          steps: successfulBuildSteps,
        },
      ],
    })

    const result = await collectForTest({
      github,
      jobsApiSyncMaxAttempts: 1,
    })

    expect(result).toEqual({
      artifacts: [windowsArtifact, androidArtifact],
      sha,
      totalPlatformJobCount: 4,
      failedJobs: [
        {
          platform: 'linux-x64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: jobUrl(101),
        },
        {
          platform: 'macos-x64',
          failedStep: 'Upload build artifacts',
          conclusion: 'failure',
          jobUrl: jobUrl(102),
        },
      ],
    })
  })

  it('忽略非平台 job，并保留未知失败步骤的兜底文案', async () => {
    const { github } = createGithubClient({
      jobs: [
        {
          name: 'setup',
          conclusion: 'failure',
          html_url: jobUrl(99),
          steps: [
            { name: 'Checkout', conclusion: 'failure' },
          ],
        },
        {
          name: 'macos-arm64',
          conclusion: 'failure',
          html_url: jobUrl(103),
          steps: [],
        },
      ],
    })

    const result = await collectForTest({
      github,
      jobsApiSyncMaxAttempts: 1,
    })

    expect(result.failedJobs).toEqual([
      {
        platform: 'macos-arm64',
        failedStep: 'Unknown step',
        conclusion: 'failure',
        jobUrl: jobUrl(103),
      },
    ])
    expect(result.totalPlatformJobCount).toBe(1)
  })

  it('忽略未成功且非失败的平台 job 缺失 artifact', async () => {
    const { github } = createGithubClient({
      jobs: [
        {
          name: 'linux-x64',
          conclusion: 'skipped',
          html_url: jobUrl(104),
          steps: [
            { name: 'Build app', conclusion: 'skipped' },
          ],
        },
        {
          name: 'macos-x64',
          conclusion: 'neutral',
          html_url: jobUrl(105),
          steps: [
            { name: 'Build app', conclusion: 'neutral' },
          ],
        },
      ],
    })

    const result = await collectForTest({
      github,
      jobsApiSyncMaxAttempts: 1,
    })

    expect(result.failedJobs).toEqual([])
    expect(result.totalPlatformJobCount).toBe(2)
  })

  it('等待平台 job 结论同步后再判断构建异常', async () => {
    const { github, paginate } = createGithubClient({
      artifacts: [windowsArtifact],
    })
    paginate
      .mockResolvedValueOnce([
        {
          name: 'windows-x64',
          status: 'completed',
          conclusion: undefined,
          html_url: jobUrl(100),
          steps: successfulBuildSteps,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'windows-x64',
          status: 'completed',
          conclusion: 'success',
          html_url: jobUrl(100),
          steps: successfulBuildSteps,
        },
      ])
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await collectForTest({
      github,
      wait,
      jobsApiSyncDelayMs: 1,
      jobsApiSyncMaxAttempts: 2,
    })

    expect(paginate).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(1)
    expect(result.failedJobs).toEqual([])
  })

  it('重试耗尽后仍保留未知平台 job 状态', async () => {
    const { github, paginate } = createGithubClient({
      artifacts: [windowsArtifact],
      jobs: [
        {
          name: 'windows-x64',
          status: 'completed',
          conclusion: undefined,
          html_url: jobUrl(100),
          steps: successfulBuildSteps,
        },
      ],
    })
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await collectForTest({
      github,
      wait,
      jobsApiSyncDelayMs: 1,
      jobsApiSyncMaxAttempts: 2,
    })

    expect(paginate).toHaveBeenCalledTimes(2)
    expect(result.failedJobs).toEqual([
      {
        platform: 'windows-x64',
        failedStep: 'Unknown step',
        conclusion: 'unknown',
        jobUrl: jobUrl(100),
      },
    ])
  })
})
