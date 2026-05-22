import { defineStore } from 'pinia'

import { serverCmds } from '~/commands/server'
import { usePreviewSyncStore } from '~/stores/preview-sync'

import type { AbsPath } from '~/domain/path'
import type { StaticSiteConfig } from '~/types/server'

interface RegisteredSite {
  signature: string
  serveUrl: string
}

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
  // 服务器 URL 与启动任务保持非响应式：UI 仅消费 serveUrls，避免无谓的依赖追踪
  let serverUrl: string | undefined
  let pendingServerStart: Promise<string | undefined> | undefined

  const registeredSites = reactive(new Map<string, RegisteredSite>())
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
        const previewSyncStore = usePreviewSyncStore()
        serverUrl = await serverCmds.startServer('127.0.0.1', 8899, (message) => {
          previewSyncStore.consumeHostEvent(message)
        })
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

  function getServeUrl(path: AbsPath): string | undefined {
    if (!path) {
      return undefined
    }

    return registeredSites.get(path)?.serveUrl
  }

  async function registerServeUrl(
    site: StaticSiteConfig,
    currentServerUrl: string,
  ): Promise<string | undefined> {
    const signature = buildSiteSignature(site)
    const cached = registeredSites.get(site.projectPath)
    if (cached?.signature === signature) {
      return cached.serveUrl
    }

    const pendingRegistration = pendingRegistrations.get(signature)
    if (pendingRegistration) {
      return await pendingRegistration
    }

    const registrationTask = (async () => {
      try {
        const siteId = await serverCmds.addStaticSite(site)
        const serveUrl = buildServeUrl(siteId, currentServerUrl)
        registeredSites.set(site.projectPath, { signature, serveUrl })
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

  async function setActivePreviewSession(gameId?: string): Promise<void> {
    await serverCmds.setActivePreviewSession(gameId)
  }

  async function setEmbeddedPreviewLaunchId(embeddedLaunchId?: string): Promise<void> {
    await serverCmds.setEmbeddedPreviewLaunchId(embeddedLaunchId)
  }

  return $$({
    getServeUrl,
    ensureServeUrl,
    ensureServeUrls,
    setActivePreviewSession,
    setEmbeddedPreviewLaunchId,
  })
})
