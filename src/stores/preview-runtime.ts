import { defineStore } from 'pinia'

import { serverCmds } from '~/commands/server'

import type { StaticSiteConfig } from '~/types/server'

function buildServeUrl(siteId: string, serverUrl: string): string {
  return new URL(`game/${siteId}/`, serverUrl).href
}

function buildSiteSignature(config: StaticSiteConfig): string {
  return JSON.stringify([
    config.projectPath,
    config.enginePath ?? '',
    config.templatePath ?? '',
  ])
}

export const usePreviewRuntimeStore = defineStore('previewRuntime', () => {
  // 非响应式内部状态：服务器 URL 和启动任务无需触发 UI 更新
  let serverUrl: string | undefined
  let pendingServerStart: Promise<string | undefined> | undefined

  const serveUrls = reactive(new Map<string, string>())
  const siteSignatures = reactive(new Map<string, string>())
  const pendingRegistrations = new Map<string, Promise<string | undefined>>()

  async function ensureServer(): Promise<string | undefined> {
    if (serverUrl) {
      return serverUrl
    }

    if (pendingServerStart) {
      return await pendingServerStart
    }

    const startTask = (async () => {
      try {
        serverUrl = await serverCmds.startServer('127.0.0.1', 8899)
        return serverUrl
      } catch (error) {
        logger.error(`服务器启动失败: ${error}`)
        return
      }
    })()

    pendingServerStart = startTask

    try {
      return await startTask
    } finally {
      if (pendingServerStart === startTask) {
        pendingServerStart = undefined
      }
    }
  }

  function getServeUrl(path: string): string | undefined {
    if (!path) {
      return undefined
    }

    return serveUrls.get(path)
  }

  async function registerServeUrl(
    site: StaticSiteConfig,
    currentServerUrl: string,
  ): Promise<string | undefined> {
    const signature = buildSiteSignature(site)
    const cachedServeUrl = serveUrls.get(site.projectPath)
    if (cachedServeUrl && siteSignatures.get(site.projectPath) === signature) {
      return cachedServeUrl
    }

    const pendingRegistration = pendingRegistrations.get(signature)
    if (pendingRegistration) {
      return await pendingRegistration
    }

    const registrationTask = (async () => {
      try {
        const siteId = await serverCmds.addStaticSite(site)
        const serveUrl = buildServeUrl(siteId, currentServerUrl)
        serveUrls.set(site.projectPath, serveUrl)
        siteSignatures.set(site.projectPath, signature)
        return serveUrl
      } catch (error) {
        logger.error(`注册静态站点失败: ${site.projectPath} - ${error}`)
        return
      }
    })()

    pendingRegistrations.set(signature, registrationTask)

    try {
      return await registrationTask
    } finally {
      pendingRegistrations.delete(signature)
    }
  }

  async function ensureServeUrl(site: StaticSiteConfig): Promise<string | undefined> {
    if (!site.projectPath) {
      return undefined
    }

    const currentServerUrl = await ensureServer()
    if (!currentServerUrl) {
      return undefined
    }

    return await registerServeUrl(site, currentServerUrl)
  }

  async function ensureServeUrls(sites: StaticSiteConfig[]): Promise<void> {
    const uniqueSites = [...new Map(
      sites
        .filter(site => !!site.projectPath)
        .map(site => [buildSiteSignature(site), site]),
    ).values()]

    if (uniqueSites.length === 0) {
      return
    }

    const currentServerUrl = await ensureServer()
    if (!currentServerUrl) {
      return
    }

    await Promise.all(
      uniqueSites.map(site => registerServeUrl(site, currentServerUrl)),
    )
  }

  return $$({
    getServeUrl,
    ensureServeUrl,
    ensureServeUrls,
  })
})
