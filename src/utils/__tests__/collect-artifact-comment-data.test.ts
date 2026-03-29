/* eslint-disable camelcase */
import { describe, expect, it, vi } from 'vitest'

import collectArtifactCommentData from '../../../scripts/collectArtifactCommentData.js'

describe('collectArtifactCommentData', () => {
  it('汇总 artifact 并归一化构建失败与上传失败的 job', async () => {
    const listWorkflowRunArtifacts = vi.fn().mockResolvedValue({
      data: {
        artifacts: [
          {
            id: 1,
            name: 'webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0',
            size_in_bytes: 10 * 1024 ** 2,
            workflow_run: { id: 42 },
          },
        ],
      },
    })
    const paginate = vi.fn().mockResolvedValue([
      {
        name: 'windows-x64',
        conclusion: 'success',
        html_url: 'https://github.com/project/webgal-craft/runs/42/jobs/100',
        steps: [
          { name: 'Build app', conclusion: 'success' },
          { name: 'Upload build artifacts', conclusion: 'success' },
        ],
      },
      {
        name: 'linux-x64',
        conclusion: 'failure',
        html_url: 'https://github.com/project/webgal-craft/runs/42/jobs/101',
        steps: [
          { name: 'Build app', conclusion: 'failure' },
        ],
      },
      {
        name: 'macos-x64',
        conclusion: 'success',
        html_url: 'https://github.com/project/webgal-craft/runs/42/jobs/102',
        steps: [
          { name: 'Build app', conclusion: 'success' },
          { name: 'Upload build artifacts', conclusion: 'success' },
        ],
      },
    ])

    const result = await collectArtifactCommentData({
      github: {
        rest: {
          actions: {
            listWorkflowRunArtifacts,
            listJobsForWorkflowRun: Symbol('listJobsForWorkflowRun'),
          },
        },
        paginate,
      },
      context: {
        repo: {
          owner: 'project',
          repo: 'webgal-craft',
        },
        payload: {
          workflow_run: {
            id: 42,
          },
        },
      },
      sha: 'abcdef0123456789',
    })

    expect(result).toEqual({
      artifacts: [
        {
          id: 1,
          name: 'webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0',
          size_in_bytes: 10 * 1024 ** 2,
          workflow_run: { id: 42 },
        },
      ],
      sha: 'abcdef0123456789',
      totalPlatformJobCount: 3,
      failedJobs: [
        {
          platform: 'linux-x64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/101',
        },
        {
          platform: 'macos-x64',
          failedStep: 'Upload build artifacts',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/102',
        },
      ],
    })
  })

  it('忽略非平台 job，并保留未知失败步骤的兜底文案', async () => {
    const listWorkflowRunArtifacts = vi.fn().mockResolvedValue({
      data: {
        artifacts: [],
      },
    })
    const paginate = vi.fn().mockResolvedValue([
      {
        name: 'setup',
        conclusion: 'failure',
        html_url: 'https://github.com/project/webgal-craft/runs/42/jobs/099',
        steps: [
          { name: 'Checkout', conclusion: 'failure' },
        ],
      },
      {
        name: 'macos-arm64',
        conclusion: 'failure',
        html_url: 'https://github.com/project/webgal-craft/runs/42/jobs/103',
        steps: [],
      },
    ])

    const result = await collectArtifactCommentData({
      github: {
        rest: {
          actions: {
            listWorkflowRunArtifacts,
            listJobsForWorkflowRun: Symbol('listJobsForWorkflowRun'),
          },
        },
        paginate,
      },
      context: {
        repo: {
          owner: 'project',
          repo: 'webgal-craft',
        },
        payload: {
          workflow_run: {
            id: 42,
          },
        },
      },
      sha: 'abcdef0123456789',
    })

    expect(result.failedJobs).toEqual([
      {
        platform: 'macos-arm64',
        failedStep: 'Unknown step',
        conclusion: 'failure',
        jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/103',
      },
    ])
    expect(result.totalPlatformJobCount).toBe(1)
  })
})
