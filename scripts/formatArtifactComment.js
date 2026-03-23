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
 * @param {{id:number, name: string, size_in_bytes: number, workflow_run: {id:number}}[]} artifacts
 * @param {string} sha
 */
function createArtifactComment(artifacts, sha) {
  const tableHeader = createMarkdownTableHeader()
  const tableBody = artifacts
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map(artifact => createMarkdownTableRow(artifact))
  const comment = [
    '### 📦️ 此 PR 构建的应用已经准备就绪',
    '',
    ...tableHeader,
    ...tableBody,
    '',
    String.raw`\**从提交 ${sha} 构建*`,
  ]
  return comment.join('\n')
}

export default createArtifactComment
