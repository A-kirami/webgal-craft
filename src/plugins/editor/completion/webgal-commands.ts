import * as monaco from 'monaco-editor'

interface ICompletionInfo {
  commandRaw: string
  detail: string
}

export function getCommandCompletions(range: monaco.IRange): monaco.languages.CompletionItem[] {
  return commandCompletion.map(item => ({
    label: item.commandRaw,
    insertText: item.commandRaw + ':',
    detail: item.detail,
    kind: monaco.languages.CompletionItemKind.Function,
    range,
  }))
}

const commandCompletion: ICompletionInfo[] = [
  // { commandRaw: 'say', detail: '对话' }, // 暂时不需要这个
  { commandRaw: 'changeBg', detail: '设置背景' },
  { commandRaw: 'changeFigure', detail: '设置立绘' },
  { commandRaw: 'bgm', detail: '设置背景音乐' },
  { commandRaw: 'playVideo', detail: '播放视频' },
  { commandRaw: 'pixiPerform', detail: '添加特效' },
  { commandRaw: 'pixiInit', detail: '初始化特效/清除特效' },
  { commandRaw: 'intro', detail: '全屏文字' },
  { commandRaw: 'miniAvatar', detail: '设置小头像' },
  { commandRaw: 'changeScene', detail: '切换场景' },
  { commandRaw: 'choose', detail: '显示选项' },
  { commandRaw: 'end', detail: '结束游戏' },
  { commandRaw: 'setComplexAnimation', detail: '设置复杂动画' },
  { commandRaw: 'label', detail: '设置标签' },
  { commandRaw: 'jumpLabel', detail: '跳转至标签' },
  { commandRaw: 'setVar', detail: '设置变量' },
  { commandRaw: 'callScene', detail: '调用场景' },
  { commandRaw: 'showVars', detail: '显示变量' },
  { commandRaw: 'unlockCg', detail: '解锁CG' },
  { commandRaw: 'unlockBgm', detail: '解锁BGM' },
  { commandRaw: 'filmMode', detail: '设置电影模式' },
  { commandRaw: 'setTextbox', detail: '设置对话框' },
  { commandRaw: 'setAnimation', detail: '设置动画' },
  { commandRaw: 'playEffect', detail: '播放音效' },
  { commandRaw: 'setTempAnimation', detail: '设置临时动画' },
  { commandRaw: 'setTransform', detail: '设置变换' },
  { commandRaw: 'setTransition', detail: '设置过渡' },
  { commandRaw: 'getUserInput', detail: '获取用户输入' },
  { commandRaw: 'applyStyle', detail: '应用样式' },
  { commandRaw: 'wait', detail: '等待' },
]
