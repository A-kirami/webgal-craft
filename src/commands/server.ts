import { Channel, invoke } from '@tauri-apps/api/core'

import { AppError } from '~/types/errors'
import { safeInvoke } from '~/utils/invoke'

import type { StaticSiteConfig } from '~/types/server'

async function startServer(
  host: string,
  port: number,
  onMessage: (message: string) => void,
): Promise<string> {
  try {
    const channel = new Channel<string>()
    channel.onmessage = onMessage

    return await invoke<string>('start_server', {
      host,
      port,
      onMessage: channel,
    })
  } catch (error) {
    throw AppError.fromInvoke('start_server', error)
  }
}

function addStaticSite(config: StaticSiteConfig): Promise<string> {
  return safeInvoke('add_static_site', { ...config })
}

function updateSiteEngine(projectPath: string, newEnginePath?: string): Promise<void> {
  return safeInvoke('update_site_engine', { projectPath, newEnginePath })
}

function updateSiteTemplate(projectPath: string, newTemplatePath?: string): Promise<void> {
  return safeInvoke('update_site_template', { projectPath, newTemplatePath })
}

async function setActivePreviewSession(gameId?: string): Promise<void> {
  return safeInvoke<void>('set_active_preview_session', { gameId })
}

async function setEmbeddedPreviewLaunchId(embeddedLaunchId?: string): Promise<void> {
  return safeInvoke<void>('set_embedded_preview_launch_id', { embeddedLaunchId })
}

async function sendPreviewCommand(request: string): Promise<void> {
  return safeInvoke<void>('send_preview_command', { request })
}

export const serverCmds = {
  startServer,
  addStaticSite,
  updateSiteEngine,
  updateSiteTemplate,
  setActivePreviewSession,
  setEmbeddedPreviewLaunchId,
  sendPreviewCommand,
}
