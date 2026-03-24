import { createPinia, setActivePinia } from 'pinia'
import { beforeEach } from 'vitest'

// 每个测试前初始化独立的 Pinia 实例，确保 store 状态不会跨测试泄漏
beforeEach(() => {
  setActivePinia(createPinia())
})
