/* eslint-disable camelcase */
import { afterEach, describe, expect, it } from 'vitest'

import createArtifactComment from '../../../scripts/formatArtifactComment.js'

describe('createArtifactComment', () => {
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

    const comment = createArtifactComment(
      [
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
      'abcdef0123456789',
    )

    expect(comment).toContain('| 🪟 windows-x64 |')
    expect(comment).toContain('| 🍎 macos-arm64 |')
    expect(comment).toContain('[webgal-craft-v1.2.3-windows-x64-pr-12-abcdef0](https://github.com/project/webgal-craft/actions/runs/42/artifacts/1)')
    expect(comment).toContain('[webgal-craft-v1.2.3-macos-arm64-commit-fedcba9](https://github.com/project/webgal-craft/actions/runs/42/artifacts/2)')
    expect(comment).toContain(String.raw`\**从提交 abcdef0123456789 构建*`)
  })
})
