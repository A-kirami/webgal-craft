import { Channel, invoke } from '@tauri-apps/api/core'

import { AppError } from '~/types/errors'
import { safeInvoke } from '~/utils/invoke'

/**
 * 启动静态文件服务器
 */
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

async function addStaticSite(path: string): Promise<string> {
  return safeInvoke<string>('add_static_site', { path })
}

async function broadcastMessage(message: string): Promise<void> {
  return safeInvoke<void>('broadcast_message', { message })
}

async function unicastMessage(clientAddr: string, message: string): Promise<void> {
  return safeInvoke<void>('unicast_message', { clientAddr, message })
}

async function getConnectedClients(): Promise<string[]> {
  return safeInvoke<string[]>('get_connected_clients')
}

export const serverCmds = {
  startServer,
  addStaticSite,
  broadcastMessage,
  unicastMessage,
  getConnectedClients,
}
