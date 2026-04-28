import { Channel, invoke } from '@tauri-apps/api/core'

import { AppError } from '~/types/errors'
import { safeInvoke } from '~/utils/invoke'

import type { StaticSiteConfig } from '~/types/server'

async function startServer(host: string, port: number): Promise<string> {
  try {
    const channel = new Channel<string>()
    channel.onmessage = () => undefined

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

function broadcastMessage(message: string): Promise<void> {
  return safeInvoke('broadcast_message', { message })
}

function unicastMessage(clientAddr: string, message: string): Promise<void> {
  return safeInvoke('unicast_message', { clientAddr, message })
}

function getConnectedClients(): Promise<string[]> {
  return safeInvoke('get_connected_clients')
}

export const serverCmds = {
  startServer,
  addStaticSite,
  updateSiteEngine,
  updateSiteTemplate,
  broadcastMessage,
  unicastMessage,
  getConnectedClients,
}
