import * as monaco from 'monaco-editor'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { getI18nLocale, i18n } from '~/plugins/i18n'

interface CompletionInfo {
  key: string
  detail: string
  simplified?: boolean
}

const { t } = i18n.global

let cachedLocale: string | undefined
let cachedArgKeyMap: Map<commandType, CompletionInfo[]> | undefined

function buildArgKeyCompletionMap(): Map<commandType, CompletionInfo[]> {
  const currentLocale = getI18nLocale()
  if (cachedLocale === currentLocale && cachedArgKeyMap) {
    return cachedArgKeyMap
  }

  const map = new Map<commandType, CompletionInfo[]>([
    [commandType.say, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'notend', detail: t('edit.completion.arguments.notend'), simplified: true },
      { key: 'concat', detail: t('edit.completion.arguments.concat'), simplified: true },
      { key: 'vocal', detail: t('edit.completion.arguments.vocal') },
      { key: 'fontSize', detail: t('edit.completion.arguments.fontSize') },
      { key: 'left', detail: t('edit.completion.arguments.left'), simplified: true },
      { key: 'right', detail: t('edit.completion.arguments.right'), simplified: true },
      { key: 'center', detail: t('edit.completion.arguments.center'), simplified: true },
      { key: 'figureId', detail: t('edit.completion.arguments.figureId') },
    ]],
    [commandType.changeBg, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'continue', detail: t('edit.completion.arguments.continue'), simplified: true },
      { key: 'next', detail: t('edit.completion.arguments.next'), simplified: true },
      { key: 'transform', detail: t('edit.completion.arguments.transform') },
      { key: 'enter', detail: t('edit.completion.arguments.enter') },
      { key: 'exit', detail: t('edit.completion.arguments.exit') },
      { key: 'duration', detail: t('edit.completion.arguments.duration') },
      { key: 'ease', detail: t('edit.completion.arguments.ease') },
      { key: 'unlockname', detail: t('edit.completion.arguments.unlockName', { type: 'CG' }) },
      { key: 'series', detail: t('edit.completion.arguments.unlockSeries', { type: 'CG' }) },
    ]],
    [commandType.changeFigure, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'continue', detail: t('edit.completion.arguments.continue'), simplified: true },
      { key: 'next', detail: t('edit.completion.arguments.next'), simplified: true },
      { key: 'transform', detail: t('edit.completion.arguments.transform') },
      { key: 'enter', detail: t('edit.completion.arguments.enter') },
      { key: 'exit', detail: t('edit.completion.arguments.exit') },
      { key: 'duration', detail: t('edit.completion.arguments.duration') },
      { key: 'ease', detail: t('edit.completion.arguments.ease') },
      { key: 'id', detail: t('edit.completion.arguments.figureId') },
      { key: 'zIndex', detail: t('edit.completion.arguments.zIndex') },
      { key: 'animationFlag', detail: t('edit.completion.arguments.animationFlag') },
      { key: 'mouthOpen', detail: t('edit.completion.arguments.mouthOpen') },
      { key: 'mouthHalfOpen', detail: t('edit.completion.arguments.mouthHalfOpen') },
      { key: 'mouthClose', detail: t('edit.completion.arguments.mouthClose') },
      { key: 'eyesOpen', detail: t('edit.completion.arguments.eyesOpen') },
      { key: 'eyesClose', detail: t('edit.completion.arguments.eyesClose') },
      { key: 'motion', detail: t('edit.completion.arguments.motion') },
      { key: 'expression', detail: t('edit.completion.arguments.expression') },
      { key: 'bounds', detail: t('edit.completion.arguments.bounds') },
      { key: 'blink', detail: t('edit.completion.arguments.blink') },
      { key: 'focus', detail: t('edit.completion.arguments.focus') },
    ]],
    [commandType.bgm, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'volume', detail: t('edit.completion.arguments.volume') },
      { key: 'enter', detail: t('edit.completion.arguments.enter') },
      { key: 'unlockname', detail: t('edit.completion.arguments.unlockName', { type: 'BGM' }) },
      { key: 'series', detail: t('edit.completion.arguments.unlockSeries', { type: 'BGM' }) },
    ]],
    [commandType.video, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'skipOff', detail: t('edit.completion.arguments.skipOff') },
    ]],
    [commandType.pixi, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.pixiInit, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.intro, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'fontSize', detail: t('edit.completion.arguments.fontSize') },
      { key: 'fontColor', detail: t('edit.completion.arguments.fontColor') },
      { key: 'backgroundColor', detail: t('edit.completion.arguments.backgroundColor') },
      { key: 'backgroundImage', detail: t('edit.completion.arguments.backgroundImage') },
      { key: 'animation', detail: t('edit.completion.arguments.animation') },
      { key: 'delayTime', detail: t('edit.completion.arguments.delayTime') },
      { key: 'hold', detail: t('edit.completion.arguments.hold'), simplified: true },
      { key: 'userForward', detail: t('edit.completion.arguments.userForward'), simplified: true },
    ]],
    [commandType.miniAvatar, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.changeScene, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.choose, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.end, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.setComplexAnimation, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'continue', detail: t('edit.completion.arguments.continue'), simplified: true },
      { key: 'next', detail: t('edit.completion.arguments.next'), simplified: true },
      { key: 'target', detail: t('edit.completion.arguments.animationTarget') },
      { key: 'duration', detail: t('edit.completion.arguments.duration') },
    ]],
    [commandType.label, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.jumpLabel, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.setVar, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.callScene, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.showVars, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.unlockCg, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'name', detail: t('edit.completion.arguments.unlockName', { type: 'CG' }) },
      { key: 'series', detail: t('edit.completion.arguments.unlockSeries', { type: 'CG' }) },
    ]],
    [commandType.unlockBgm, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'name', detail: t('edit.completion.arguments.unlockName', { type: 'BGM' }) },
      { key: 'series', detail: t('edit.completion.arguments.unlockSeries', { type: 'BGM' }) },
    ]],
    [commandType.filmMode, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.setTextbox, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.setAnimation, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'continue', detail: t('edit.completion.arguments.continue'), simplified: true },
      { key: 'next', detail: t('edit.completion.arguments.next'), simplified: true },
      { key: 'target', detail: t('edit.completion.arguments.animationTarget') },
      { key: 'writeDefault', detail: t('edit.completion.arguments.writeDefault'), simplified: true },
      { key: 'keep', detail: t('edit.completion.arguments.keep'), simplified: true },
    ]],
    [commandType.playEffect, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'id', detail: t('edit.completion.arguments.soundEffectId') },
    ]],
    [commandType.setTempAnimation, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'continue', detail: t('edit.completion.arguments.continue'), simplified: true },
      { key: 'next', detail: t('edit.completion.arguments.next'), simplified: true },
      { key: 'target', detail: t('edit.completion.arguments.animationTarget') },
      { key: 'writeDefault', detail: t('edit.completion.arguments.writeDefault'), simplified: true },
      { key: 'keep', detail: t('edit.completion.arguments.keep'), simplified: true },
    ]],
    [commandType.setTransform, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'continue', detail: t('edit.completion.arguments.continue'), simplified: true },
      { key: 'next', detail: t('edit.completion.arguments.next'), simplified: true },
      { key: 'target', detail: t('edit.completion.arguments.animationTarget') },
      { key: 'duration', detail: t('edit.completion.arguments.duration') },
      { key: 'ease', detail: t('edit.completion.arguments.ease') },
      { key: 'writeDefault', detail: t('edit.completion.arguments.writeDefault'), simplified: true },
      { key: 'keep', detail: t('edit.completion.arguments.keep'), simplified: true },
    ]],
    [commandType.setTransition, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'target', detail: t('edit.completion.arguments.transitionTarget') },
      { key: 'enter', detail: t('edit.completion.arguments.enter') },
      { key: 'exit', detail: t('edit.completion.arguments.exit') },
    ]],
    [commandType.getUserInput, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
      { key: 'title', detail: t('edit.completion.arguments.title') },
      { key: 'buttonText', detail: t('edit.completion.arguments.buttonText') },
      { key: 'defaultValue', detail: t('edit.completion.arguments.defaultValue') },
    ]],
    [commandType.applyStyle, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
    [commandType.wait, [
      { key: 'when', detail: t('edit.completion.arguments.when') },
    ]],
  ])

  cachedLocale = currentLocale
  cachedArgKeyMap = map
  return map
}

export function getArgKeyCompletions(range: monaco.IRange, command: commandType): monaco.languages.CompletionItem[] {
  const argKeyCompletion = buildArgKeyCompletionMap().get(command) || []
  return argKeyCompletion.map(item => ({
    label: item.key,
    insertText: item.key + (item.simplified ? '' : '='),
    detail: item.detail,
    kind: monaco.languages.CompletionItemKind.Function,
    range,
  }))
}
