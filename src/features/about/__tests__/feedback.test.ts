import { describe, expect, it } from 'vitest'

import {
  createBugReportUrl,
  formatAboutEnvironmentInfo,
} from '../feedback'

import type { AboutEnvironmentInfo } from '../feedback'

const environmentInfo: AboutEnvironmentInfo = {
  appVersion: '1.0.0-alpha.4-build.abc 123',
  architecture: 'aarch64',
  osVersion: '15.5 & newer',
  platform: 'macos',
}

describe('formatAboutEnvironmentInfo', () => {
  it('只生成固定三行版本和系统信息', () => {
    expect(formatAboutEnvironmentInfo(environmentInfo)).toBe([
      'WebGAL Craft: 1.0.0-alpha.4-build.abc 123',
      'Operating system: macos 15.5 & newer',
      'Architecture: aarch64',
    ].join('\n'))
  })
})

describe('createBugReportUrl', () => {
  it('选择错误报告模板并分别预填版本和运行环境', () => {
    const url = new URL(createBugReportUrl('https://github.com/A-kirami/webgal-craft', environmentInfo))

    expect(url.origin + url.pathname).toBe('https://github.com/A-kirami/webgal-craft/issues/new')
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    expect(url.searchParams.get('version')).toBe(environmentInfo.appVersion)
    expect(url.searchParams.get('context')).toBe([
      'Operating system: macos 15.5 & newer',
      'Architecture: aarch64',
    ].join('\n'))
    expect(url.searchParams.get('context')).not.toContain(environmentInfo.appVersion)
  })
})
