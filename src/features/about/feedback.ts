import { arch, platform, version as getOsVersion } from '@tauri-apps/plugin-os'

import type { Arch, Platform } from '@tauri-apps/plugin-os'

export interface AboutEnvironmentInfo {
  appVersion: string
  architecture: Arch
  osVersion: string
  platform: Platform
}

export function collectAboutEnvironmentInfo(appVersion: string): AboutEnvironmentInfo {
  return {
    appVersion,
    architecture: arch(),
    osVersion: getOsVersion(),
    platform: platform(),
  }
}

function formatRuntimeEnvironmentInfo(info: AboutEnvironmentInfo): string {
  return [
    `Operating system: ${info.platform} ${info.osVersion}`,
    `Architecture: ${info.architecture}`,
  ].join('\n')
}

export function formatAboutEnvironmentInfo(info: AboutEnvironmentInfo): string {
  return [
    `WebGAL Craft: ${info.appVersion}`,
    formatRuntimeEnvironmentInfo(info),
  ].join('\n')
}

export function createBugReportUrl(repositoryUrl: string, info: AboutEnvironmentInfo): string {
  const url = new URL(`${repositoryUrl}/issues/new`)
  url.searchParams.set('template', 'bug_report.yml')
  url.searchParams.set('version', info.appVersion)
  url.searchParams.set('context', formatRuntimeEnvironmentInfo(info))
  return url.toString()
}
