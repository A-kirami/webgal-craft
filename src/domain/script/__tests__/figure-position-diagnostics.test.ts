import { describe, expect, it } from 'vitest'

import { findUnsupportedFigurePositionReferences } from '~/domain/script/figure-position-diagnostics'
import { parseSentence } from '~/domain/script/parser'

describe('findUnsupportedFigurePositionReferences', () => {
  it('识别 say 和 changeFigure 的扩展位置 flag', () => {
    expect(findUnsupportedFigurePositionReferences(parseSentence('Alice: hello -left13;')!)).toEqual([
      { fieldKey: 'figureId', value: 'left13' },
    ])
    expect(findUnsupportedFigurePositionReferences(parseSentence('changeFigure: hero.png -right14;')!)).toEqual([
      { fieldKey: 'position', value: 'right14' },
    ])
  })

  it('识别动画和效果目标中的扩展立绘 target ID', () => {
    expect(findUnsupportedFigurePositionReferences(parseSentence('setAnimation: bounce -target=fig-left14;')!)).toEqual([
      { fieldKey: 'target', value: 'fig-left14' },
    ])
    expect(findUnsupportedFigurePositionReferences(parseSentence('setTransform: {} -target=fig-right13;')!)).toEqual([
      { fieldKey: 'target', value: 'fig-right13' },
    ])
  })

  it('不误报旧位置和非目标参数', () => {
    expect(findUnsupportedFigurePositionReferences(parseSentence('changeFigure: hero.png -left;')!)).toEqual([])
    expect(findUnsupportedFigurePositionReferences(parseSentence('setAnimation: bounce -target=fig-left -id=fig-right14;')!)).toEqual([])
  })
})
