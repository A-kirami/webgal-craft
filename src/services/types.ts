export interface GameMetadata {
  name: string // 从配置文件获取
  icon: string // 图标路径固定为 icons/favicon.ico
  cover: string // 从配置文件获取，拼接得到封面路径
}

export interface EngineMetadata {
  name: string // 从配置文件获取
  icon: string // 图标路径固定为 icons/favicon.ico
  description: string // 从配置文件获取
}

export class GameError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'GameError'
  }
}
