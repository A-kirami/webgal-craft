import { defineStore } from 'pinia'

import { serverCmds } from '~/commands/server'

function buildServeUrl(siteId: string, serverUrl: string): string {
  return new URL(`game/${siteId}/`, serverUrl).href
}

export const usePreviewRuntimeStore = defineStore('previewRuntime', () => {
  let serverUrl: string | undefined
  let pendingServerStart: Promise<string | undefined> | undefined

  const serveUrls = reactive(new Map<string, string>())
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

  async function registerServeUrl(path: string, currentServerUrl: string): Promise<string | undefined> {
    const cachedServeUrl = serveUrls.get(path)
    if (cachedServeUrl) {
      return cachedServeUrl
    }

    const pendingRegistration = pendingRegistrations.get(path)
    if (pendingRegistration) {
      return await pendingRegistration
    }

    const registrationTask = (async () => {
      try {
        const siteId = await serverCmds.addStaticSite(path)
        const serveUrl = buildServeUrl(siteId, currentServerUrl)
        serveUrls.set(path, serveUrl)
        return serveUrl
      } catch (error) {
        logger.error(`注册静态站点失败: ${path} - ${error}`)
        return
      }
    })()

    pendingRegistrations.set(path, registrationTask)

    try {
      return await registrationTask
    } finally {
      pendingRegistrations.delete(path)
    }
  }

  async function ensureServeUrl(path: string): Promise<string | undefined> {
    if (!path) {
      return undefined
    }

    const currentServerUrl = await ensureServer()
    if (!currentServerUrl) {
      return undefined
    }

    return await registerServeUrl(path, currentServerUrl)
  }

  async function ensureServeUrls(paths: string[]): Promise<void> {
    const normalizedPaths = [...new Set(paths.filter(Boolean))]

    if (normalizedPaths.length === 0) {
      return
    }

    const currentServerUrl = await ensureServer()
    if (!currentServerUrl) {
      return
    }

    await Promise.all(
      normalizedPaths.map(path => registerServeUrl(path, currentServerUrl)),
    )
  }

  return $$({
    getServeUrl,
    ensureServeUrl,
    ensureServeUrls,
  })
})
