/* eslint-disable camelcase */
import { afterEach, describe, expect, it } from 'vitest'

import createArtifactComment from '../../../scripts/formatArtifactComment.js'

describe('createArtifactComment 构建产物注释', () => {
  const originalRepository = process.env.GITHUB_REPOSITORY

  afterEach(() => {
    if (originalRepository === undefined) {
      delete process.env.GITHUB_REPOSITORY
      return
    }

    process.env.GITHUB_REPOSITORY = originalRepository
  })

  it('新产物命名格式下仍能正确解析平台与链接', () => {
    process.env.GITHUB_REPOSITORY = 'project/webgal-craft'

    const comment = createArtifactComment({
      artifacts: [
        {
          id: 1,
          name: 'webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0',
          size_in_bytes: 10 * 1024 ** 2,
          workflow_run: { id: 42 },
        },
        {
          id: 2,
          name: 'webgal-craft-v1.2.3-macos-arm64-commit-fedcba9',
          size_in_bytes: 20 * 1024 ** 2,
          workflow_run: { id: 42 },
        },
      ],
      sha: 'abcdef0123456789',
      failedJobs: [],
    })

    expect(comment).toContain('| 🪟 windows-x64 |')
    expect(comment).toContain('| 🍎 macos-arm64 |')
    expect(comment).toContain('[webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0](https://github.com/project/webgal-craft/actions/runs/42/artifacts/1)')
    expect(comment).toContain('[webgal-craft-v1.2.3-macos-arm64-commit-fedcba9](https://github.com/project/webgal-craft/actions/runs/42/artifacts/2)')
    expect(comment).toContain(String.raw`\**从提交 abcdef0123456789 构建*`)
    expect(comment).not.toContain('以下构建任务出现异常')
  })

  it('存在异常时先展示工件表再展示失败 job 表，并让失败阶段文本直接链接到 job', () => {
    process.env.GITHUB_REPOSITORY = 'project/webgal-craft'

    const comment = createArtifactComment({
      artifacts: [
        {
          id: 1,
          name: 'webgal-craft-v1.2.3-macos-arm64-pr-12-abcdef0',
          size_in_bytes: 20 * 1024 ** 2,
          workflow_run: { id: 42 },
        },
        {
          id: 2,
          name: 'webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0',
          size_in_bytes: 10 * 1024 ** 2,
          workflow_run: { id: 42 },
        },
      ],
      sha: 'abcdef0123456789',
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

    expect(comment).toContain('构建存在异常')
    expect(comment).toContain('| 🍎 macos-arm64 |')
    expect(comment).toContain('| 🪟 windows-x64 |')
    expect(comment).toContain('| 平台 | 失败阶段 | 结果 |')
    expect(comment).toContain('[Build app](https://github.com/project/webgal-craft/runs/42/jobs/101)')
    expect(comment).toContain('[Upload build artifacts](https://github.com/project/webgal-craft/runs/42/jobs/102)')
    expect(comment).toContain('| 🐧 linux-x64 | [Build app](https://github.com/project/webgal-craft/runs/42/jobs/101) | failure |')
    expect(comment).toContain('| 🍎 macos-x64 | [Upload build artifacts](https://github.com/project/webgal-craft/runs/42/jobs/102) | failure |')
    expect(comment).not.toContain('应用已经准备就绪')
    expect(comment.indexOf('| 平台 | 文件 | 大小 |')).toBeLessThan(comment.indexOf('| 平台 | 失败阶段 | 结果 |'))
  })

  it('没有可用构建工件但存在失败 job 时仍展示失败 job 表', () => {
    process.env.GITHUB_REPOSITORY = 'project/webgal-craft'

    const comment = createArtifactComment({
      artifacts: [],
      sha: 'abcdef0123456789',
      totalPlatformJobCount: 2,
      failedJobs: [
        {
          platform: 'linux-x64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/101',
        },
      ],
    })

    expect(comment).toContain('构建存在异常')
    expect(comment).toContain('当前没有可下载的构建工件')
    expect(comment).toContain('| 平台 | 失败阶段 | 结果 |')
    expect(comment).toContain('[Build app](https://github.com/project/webgal-craft/runs/42/jobs/101)')
    expect(comment).not.toContain('| 平台 | 文件 | 大小 |')
    expect(comment).toContain(String.raw`\**从提交 abcdef0123456789 构建*`)
  })

  it('全部平台任务都在同一阶段失败时仅展示摘要', () => {
    process.env.GITHUB_REPOSITORY = 'project/webgal-craft'

    const comment = createArtifactComment({
      artifacts: [],
      sha: 'abcdef0123456789',
      totalPlatformJobCount: 4,
      failedJobs: [
        {
          platform: 'linux-x64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/101',
        },
        {
          platform: 'macos-arm64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/102',
        },
        {
          platform: 'macos-x64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/103',
        },
        {
          platform: 'windows-x64',
          failedStep: 'Build app',
          conclusion: 'failure',
          jobUrl: 'https://github.com/project/webgal-craft/runs/42/jobs/104',
        },
      ],
    })

    expect(comment).toContain('当前没有可下载的构建工件')
    expect(comment).toContain('4 / 4 个构建任务失败')
    expect(comment).toContain('失败阶段：`Build app`')
    expect(comment).not.toContain('| 平台 | 失败阶段 | 结果 |')
    expect(comment).not.toContain('[Build app](https://github.com/project/webgal-craft/runs/42/jobs/101)')
  })
})
