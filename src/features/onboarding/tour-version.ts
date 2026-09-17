/**
 * 新手引导的持久化契约：每个引导的 localStorage key 与当前版本号。
 * 引导内容大改时提升对应版本号，已完成旧版本的用户会重新触发。
 *
 * 独立成无依赖模块，便于集成测试准备「引导已完成」的种子数据时与运行时代码共用同一份定义。
 */
export const TOUR_PERSISTENCE = {
  editor: { storageKey: 'tour-editor-version', version: '1' },
  effectEditor: { storageKey: 'tour-effect-editor-version', version: '1' },
  engines: { storageKey: 'tour-engines-version', version: '1' },
  home: { storageKey: 'tour-home-version', version: '1' },
} as const

export interface TourPersistence {
  readonly storageKey: string
  readonly version: string
}
