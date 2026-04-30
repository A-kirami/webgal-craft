/**
 * 引擎显示标签格式化：`${name} ${version}`，没有版本时只返回名称。
 * 用于状态栏、模板/引擎选择器以及切换弹窗等所有需要展示引擎的位置。
 */
export function formatEngineLabel(engine: { name: string, version?: string }): string {
  return engine.version ? `${engine.name} ${engine.version}` : engine.name
}
