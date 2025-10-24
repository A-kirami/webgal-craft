import { Channel, invoke } from '@tauri-apps/api/core'

/**
 * 启动静态文件服务器
 *
 * @param host - 服务器主机地址
 * @param port - 服务器端口号
 * @returns 服务器URL
 * @throws 当服务器启动失败时抛出异常
 */
async function startServer(host: string, port: number): Promise<string> {
  try {
    // 创建消息通道
    const channel = new Channel<string>()

    channel.onmessage = async (message) => {
      // logger.debug(message)
    }

    return await invoke<string>('start_server', {
      host,
      port,
      onMessage: channel,
    })
  } catch (error) {
    throw new Error(`启动服务器失败: ${error}`)
  }
}

/**
 * 添加静态站点
 *
 * @param path - 静态文件目录路径
 * @returns 站点的唯一标识哈希值
 * @throws 当添加站点失败时抛出异常
 */
async function addStaticSite(path: string): Promise<string> {
  try {
    return await invoke<string>('add_static_site', { path })
  } catch (error) {
    throw new Error(`添加静态站点失败: ${error}`)
  }
}

/**
 * 移除静态站点
 *
 * @param path - 静态文件目录路径
 * @returns 无返回值
 * @throws 当移除站点失败时抛出异常
 */
async function removeStaticSite(path: string): Promise<void> {
  try {
    await invoke<void>('remove_static_site', { path })
  } catch (error) {
    throw new Error(`移除静态站点失败: ${error}`)
  }
}

/**
 * 广播消息到所有连接的 WebSocket 客户端
 *
 * @param message - 要广播的消息内容
 * @throws 当广播失败时抛出异常
 */
async function broadcastMessage(message: string): Promise<void> {
  try {
    await invoke<void>('broadcast_message', { message })
  } catch (error) {
    throw new Error(`广播消息失败: ${error}`)
  }
}

/**
 * 向指定的 WebSocket 客户端发送单播消息
 *
 * @param clientAddr - 客户端地址，格式为 "127.0.0.1:8080"
 * @param message - 要发送的消息内容
 * @throws 当发送失败或客户端不存在时抛出异常
 */
async function unicastMessage(clientAddr: string, message: string): Promise<void> {
  try {
    await invoke<void>('unicast_message', { clientAddr, message })
  } catch (error) {
    throw new Error(`发送单播消息失败: ${error}`)
  }
}

/**
 * 获取所有已连接的 WebSocket 客户端地址列表
 *
 * @returns 客户端地址列表
 * @throws 当获取客户端列表失败时抛出异常
 */
async function getConnectedClients(): Promise<string[]> {
  try {
    return await invoke<string[]>('get_connected_clients')
  } catch (error) {
    throw new Error(`获取已连接客户端列表失败: ${error}`)
  }
}

/**
 * 服务器命令对象，提供与后端通信的服务器相关命令调用功能
 */
export const serverCmds = {
  startServer,
  addStaticSite,
  removeStaticSite,
  broadcastMessage,
  unicastMessage,
  getConnectedClients,
}
