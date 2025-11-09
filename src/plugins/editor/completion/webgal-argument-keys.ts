import * as monaco from 'monaco-editor'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

interface ICompletionInfo {
  key: string
  detail: string
  simplified?: boolean
}

export function getArgKeyCompletions(range: monaco.IRange, command: commandType): monaco.languages.CompletionItem[] {
  const argKeyCompletion = argKeyCompletionMap.get(command) || []
  return argKeyCompletion.map(item => ({
    label: item.key,
    insertText: item.key + (item.simplified ? '' : '='),
    detail: item.detail,
    kind: monaco.languages.CompletionItemKind.Function,
    range,
  }))
}

const argKeyCompletionMap = new Map<commandType, ICompletionInfo[]>([
  [commandType.say, [
    { key: 'when', detail: '条件执行' },
    { key: 'notend', detail: '继续播放下一段', simplified: true },
    { key: 'concat', detail: '接续上一段对话', simplified: true },
    // { key: 'speaker', detail: '说话者' }, // 拟弃用
    // { key: 'clear', detail: '清除对话', simplified: true }, // 拟弃用
    { key: 'vocal', detail: '语音文件路径' },
    { key: 'fontSize', detail: '字体大小' },
    { key: 'left', detail: '属于左侧立绘', simplified: true },
    { key: 'right', detail: '属于右侧立绘', simplified: true },
    { key: 'center', detail: '属于中间立绘', simplified: true },
    { key: 'figureId', detail: '自由立绘ID' },
  ]],
  [commandType.changeBg, [
    { key: 'when', detail: '条件执行' },
    { key: 'continue', detail: '继续执行下一句', simplified: true },
    { key: 'next', detail: '同步执行下一句', simplified: true },
    { key: 'transform', detail: '设置变换' },
    { key: 'enter', detail: '设置入场动画' },
    { key: 'exit', detail: '设置退场动画' },
    { key: 'duration', detail: '动画持续时间（毫秒）' },
    { key: 'ease', detail: '动画缓动类型' },
    { key: 'unlockname', detail: '解锁CG名称' },
    { key: 'series', detail: 'CG所属系列' },
  ]],
  [commandType.changeFigure, [
    { key: 'when', detail: '条件执行' },
    { key: 'continue', detail: '继续执行下一句', simplified: true },
    { key: 'next', detail: '同步执行下一句', simplified: true },
    { key: 'transform', detail: '设置变换' },
    { key: 'enter', detail: '设置入场动画' },
    { key: 'exit', detail: '设置退场动画' },
    { key: 'duration', detail: '动画持续时间（毫秒）' },
    { key: 'ease', detail: '动画缓动类型' },
    { key: 'id', detail: '立绘ID' },
    { key: 'zIndex', detail: '图层次序' },
    // { key: 'clear', detail: '关闭立绘' }, // 拟弃用
    // { key: 'none', detail: '关闭立绘' }, // 拟弃用
    { key: 'animationFlag', detail: '动画标志' },
    { key: 'mouthOpen', detail: '立绘张嘴差分' },
    { key: 'mouthHalfOpen', detail: '立绘半张嘴差分' },
    { key: 'mouthClose', detail: '立绘闭嘴差分' },
    { key: 'eyesOpen', detail: '立绘睁眼差分' },
    { key: 'eyesClose', detail: '立绘闭眼差分' },
    { key: 'motion', detail: 'Live2D/Spine动作' },
    { key: 'expression', detail: 'Live2D表情' },
    { key: 'bounds', detail: 'Live2D边界拓展' },
    { key: 'blink', detail: 'Live2D眨眼参数' },
    { key: 'focus', detail: 'Live2D注视参数' },
  ]],
  [commandType.bgm, [
    { key: 'when', detail: '条件执行' },
    { key: 'volume', detail: '音量大小（0-100）' },
    { key: 'enter', detail: '淡入时长（毫秒）' },
    { key: 'unlockname', detail: '解锁BGM名称' },
    { key: 'series', detail: 'BGM所属系列' },
  ]],
  [commandType.video, [
    { key: 'when', detail: '条件执行' },
    { key: 'skipOff', detail: '禁止跳过' },
  ]],
  [commandType.pixi, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.pixiInit, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.intro, [
    { key: 'when', detail: '条件执行' },
    { key: 'fontSize', detail: '字体大小' },
    { key: 'fontColor', detail: '字体颜色' },
    { key: 'backgroundColor', detail: '背景颜色' },
    { key: 'backgroundImage', detail: '背景图片' },
    { key: 'animation', detail: '每行文字入场动画' },
    { key: 'delayTime', detail: '每行文字入场延迟时间' },
    { key: 'hold', detail: '播放完毕后停留', simplified: true },
    { key: 'userForward', detail: '用户点击显示文字', simplified: true },
  ]],
  [commandType.miniAvatar, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.changeScene, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.choose, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.end, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.setComplexAnimation, [
    { key: 'when', detail: '条件执行' },
    { key: 'continue', detail: '继续执行下一句', simplified: true },
    { key: 'next', detail: '同步执行下一句', simplified: true },
    { key: 'target', detail: '动画作用目标' },
    { key: 'duration', detail: '动画持续时间（毫秒）' },
  ]],
  [commandType.label, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.jumpLabel, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.setVar, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.callScene, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.showVars, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.unlockCg, [
    { key: 'when', detail: '条件执行' },
    { key: 'name', detail: '解锁CG名称' },
    { key: 'series', detail: 'CG所属系列' },
  ]],
  [commandType.unlockBgm, [
    { key: 'when', detail: '条件执行' },
    { key: 'name', detail: '解锁BGM名称' },
    { key: 'series', detail: 'BGM所属系列' },
  ]],
  [commandType.filmMode, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.setTextbox, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.setAnimation, [
    { key: 'when', detail: '条件执行' },
    { key: 'continue', detail: '继续执行下一句', simplified: true },
    { key: 'next', detail: '同步执行下一句', simplified: true },
    { key: 'target', detail: '动画作用目标' },
    { key: 'writeDefault', detail: '补充默认值', simplified: true },
    { key: 'keep', detail: '跨语句动画', simplified: true },
  ]],
  [commandType.playEffect, [
    { key: 'when', detail: '条件执行' },
    { key: 'id', detail: '音效ID' },
  ]],
  [commandType.setTempAnimation, [
    { key: 'when', detail: '条件执行' },
    { key: 'continue', detail: '继续执行下一句', simplified: true },
    { key: 'next', detail: '同步执行下一句', simplified: true },
    { key: 'target', detail: '动画作用目标' },
    { key: 'writeDefault', detail: '补充默认值', simplified: true },
    { key: 'keep', detail: '跨语句动画', simplified: true },
  ]],
  [commandType.setTransform, [
    { key: 'when', detail: '条件执行' },
    { key: 'continue', detail: '继续执行下一句', simplified: true },
    { key: 'next', detail: '同步执行下一句', simplified: true },
    { key: 'target', detail: '动画作用目标' },
    { key: 'duration', detail: '动画持续时间（毫秒）' },
    { key: 'ease', detail: '动画缓动类型' },
    { key: 'writeDefault', detail: '补充默认值', simplified: true },
    { key: 'keep', detail: '跨语句动画', simplified: true },
  ]],
  [commandType.setTransition, [
    { key: 'when', detail: '条件执行' },
    { key: 'target', detail: '过渡作用目标' },
    { key: 'enter', detail: '入场动画' },
    { key: 'exit', detail: '退场动画' },
  ]],
  [commandType.getUserInput, [
    { key: 'when', detail: '条件执行' },
    { key: 'title', detail: '设置标题' },
    { key: 'buttonText', detail: '设置按钮文字' },
    { key: 'defaultValue', detail: '设置默认值' },
  ]],
  [commandType.applyStyle, [
    { key: 'when', detail: '条件执行' },
  ]],
  [commandType.wait, [
    { key: 'when', detail: '条件执行' },
  ]],
])
