// @ts-check
/* eslint-disable camelcase */

/** @type {Record<string, string>} */
const platformIcon = {
  windows: '🪟',
  macos: '🍎',
  linux: '🐧',
  unknown: '❔',
}

/**
 * @param {string} name
 */
function getArtifactPlatform(name) {
  const match = /(?<platform>(?<os>windows|macos|linux)-(?<arch>[a-z0-9]+))(?:-|$)/.exec(name)
  if (!match?.groups) {
    return {
      icon: platformIcon.unknown,
      label: 'unknown',
    }
  }

  return {
    icon: platformIcon[match.groups.os] || platformIcon.unknown,
    label: match.groups.platform,
  }
}

/**
 * @param {Object} param0
 * @param {number} param0.id
 * @param {string} param0.name
 * @param {number} param0.size_in_bytes
 * @param {{id:number}} param0.workflow_run
 */
function createMarkdownTableRow({ id, name, size_in_bytes, workflow_run }) {
  const platform = getArtifactPlatform(name)
  const url = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${workflow_run.id}/artifacts/${id}`
  const fileSize = Number.parseFloat((size_in_bytes / 1024 ** 2).toFixed(2))
  return `| ${platform.icon} ${platform.label} | [${name}](${url}) | ${fileSize} MB |`
}

function createMarkdownTableHeader() {
  return ['| 平台 | 文件 | 大小 |', '| --- | --- | --- |']
}

/**
 * @param {{platform: string, failedStep: string, conclusion: string, jobUrl: string}} failedJob
 */
function createFailedJobTableRow({ platform, failedStep, conclusion, jobUrl }) {
  const platformInfo = getArtifactPlatform(platform)
  return `| ${platformInfo.icon} ${platformInfo.label} | [${failedStep}](${jobUrl}) | ${conclusion} |`
}

function createFailedJobTableHeader() {
  return ['| 平台 | 失败阶段 | 结果 |', '| --- | --- | --- |']
}

/**
 * @param {{failedStep: string}[]} failedJobs
 */
function getUniqueFailedSteps(failedJobs) {
  return [...new Set(failedJobs.map(failedJob => failedJob.failedStep))]
}

/**
 * @param {{
 *   artifacts: {id:number, name: string, size_in_bytes: number, workflow_run: {id:number}}[],
 *   sha: string,
 *   totalPlatformJobCount?: number,
 *   failedJobs?: {platform: string, failedStep: string, conclusion: string, jobUrl: string}[]
 * }} options
 */
function createArtifactComment({ artifacts, sha, totalPlatformJobCount = 0, failedJobs = [] }) {
  if (failedJobs.length === 0 && artifacts.length > 0) {
    const tableHeader = createMarkdownTableHeader()
    const tableBody = artifacts
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(artifact => createMarkdownTableRow(artifact))

    return [
      '### 📦️ 此 PR 构建的应用已经准备就绪',
      '',
      ...tableHeader,
      ...tableBody,
      '',
      String.raw`\**从提交 ${sha} 构建*`,
    ].join('\n')
  }

  const failedJobTableHeader = createFailedJobTableHeader()
  const failedJobTableBody = failedJobs
    .toSorted((a, b) => a.platform.localeCompare(b.platform))
    .map(failedJob => createFailedJobTableRow(failedJob))
  const uniqueFailedSteps = getUniqueFailedSteps(failedJobs)
  const isAllPlatformJobsFailed = totalPlatformJobCount > 0 && failedJobs.length === totalPlatformJobCount
  const isSingleFailureStep = uniqueFailedSteps.length === 1

  if (failedJobs.length === 0) {
    return [
      '### ⚠️ 此 PR 构建已完成，但没有可用的构建工件',
      '',
      'CI 的上传工件阶段可能失败，因此这次没有可下载的构建产物。请检查 Build workflow 的 artifact 上传日志。',
      '',
      String.raw`\**从提交 ${sha} 构建*`,
    ].join('\n')
  }

  if (artifacts.length === 0) {
    if (isAllPlatformJobsFailed && isSingleFailureStep) {
      return [
        '### ⚠️ 此 PR 构建存在异常',
        '',
        '当前没有可下载的构建工件。',
        '',
        `${failedJobs.length} / ${totalPlatformJobCount} 个构建任务失败。`,
        `失败阶段：\`${uniqueFailedSteps[0]}\``,
        '',
        String.raw`\**从提交 ${sha} 构建*`,
      ].join('\n')
    }

    return [
      '### ⚠️ 此 PR 构建存在异常',
      '',
      '当前没有可下载的构建工件。',
      '',
      '以下构建任务出现异常：',
      '',
      ...failedJobTableHeader,
      ...failedJobTableBody,
      '',
      String.raw`\**从提交 ${sha} 构建*`,
    ].join('\n')
  }

  const tableHeader = createMarkdownTableHeader()
  const tableBody = artifacts
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map(artifact => createMarkdownTableRow(artifact))

  return [
    '### ⚠️ 此 PR 构建存在异常',
    '',
    '以下工件仍可下载：',
    '',
    ...tableHeader,
    ...tableBody,
    '',
    '以下构建任务出现异常：',
    '',
    ...failedJobTableHeader,
    ...failedJobTableBody,
    '',
    String.raw`\**从提交 ${sha} 构建*`,
  ].join('\n')
}

export default createArtifactComment
