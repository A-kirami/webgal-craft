import { driver } from 'driver.js'

import 'driver.js/dist/driver.css'
import '~/styles/tour.css'

import type { AllowedButtons, Config, Driver, DriverHook, DriveStep, PopoverDOM } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

/** popover 类名同时被 tour.css 用作覆盖选择器，改名时两处必须同步 */
export const TOUR_POPOVER_CLASS = 'webgal-tour'

/** 首步没有「上一步」可走，不渲染置灰按钮 */
export const TOUR_FIRST_STEP_BUTTONS: AllowedButtons[] = ['next', 'close']

/** 等待目标元素出现的上限 */
const TOUR_WAIT_FOR_ELEMENT_MS = 3000

/**
 * 面板展开、语句折叠等布局变化后等待稳定的时长。高亮框按启动瞬间的矩形定位，
 * 布局动画没结束就启动会让高亮落在旧位置上。
 */
export const TOUR_LAYOUT_SETTLE_DELAY_MS = 300

/**
 * 高亮镂空圆角：模态框圆角 `rounded-lg` 在这里是 8px（`--radius-lg` = `--radius` = 0.5rem），
 * 引导在此之上放大 2px。tour.css 的卡片圆角用 `calc(var(--radius) + 2px)` 表达同一规则，
 * 改这里要同步改那边。
 */
const TOUR_STAGE_RADIUS = 10

export interface TourLabels {
  done: string
  next: string
  previous: string
  skip: string
}

/** 遮罩点击行为不在可覆盖范围内：全部引导统一为点击遮罩不关闭，由 createTourConfig 决定。 */
export type TourOverrides = Partial<Omit<Config, 'overlayClickBehavior'>>

export interface TourDriverOptions {
  labels: TourLabels
  onDestroyed?: DriverHook
  /** 展开在共享配置之后 */
  overrides?: TourOverrides
  steps: DriveStep[]
}

export function createTourLabels(t: I18nT): TourLabels {
  return {
    done: t('tour.common.done'),
    next: t('tour.common.next'),
    previous: t('tour.common.prev'),
    skip: t('tour.common.skip'),
  }
}

export function createTourConfig(options: TourDriverOptions): Config {
  const { labels, onDestroyed, overrides, steps } = options

  return {
    doneBtnText: labels.done,
    nextBtnText: labels.next,
    onDestroyed,
    /*
     * 高亮区域默认不吃点击：引导中点到真实按钮（如「创建游戏」）会弹窗顶掉引导，
     * 关掉弹窗后引导又得从头开始。需要用户动手尝试的步骤按步骤放开为 false。
     */
    disableActiveInteraction: true,
    // driver.js 没有独立的跳过按钮，复用关闭按钮承载「跳过」文案
    onPopoverRender: (popover: PopoverDOM) => {
      popover.closeButton.textContent = labels.skip
      popover.closeButton.setAttribute('aria-label', labels.skip)
      // 关闭按钮在 DOM 里排在导航按钮之前，移到末尾让 Tab 顺序变成「上一步 → 下一步 → 跳过」
      popover.wrapper.append(popover.closeButton)
      // driver.js 随后会把焦点交给弹窗里第一个可聚焦元素，等于默认聚焦「跳过」，
      // 一是按下回车就会跳过引导，二是按钮会一直挂着焦点环。
      // 把焦点交给 dialog 容器：读屏先播报标题与说明，用户 Tab 时才落到按钮上。
      queueMicrotask(() => {
        popover.wrapper.tabIndex = -1
        popover.wrapper.focus()
      })
    },
    overlayColor: '#000000',
    overlayOpacity: 0.5,
    /*
     * 引导是一次性的：完成或跳过后都不会再弹，也没有重新触发的入口。
     * 遮罩覆盖高亮区以外的整屏，误点一下就会永久丢掉后面的步骤，
     * 所以这里不吃遮罩点击，只保留卡片上的「跳过」与 Esc 两个显式出口。
     */
    overlayClickBehavior: () => {
      // 刻意留空
    },
    popoverClass: TOUR_POPOVER_CLASS,
    prevBtnText: labels.previous,
    showButtons: ['next', 'previous', 'close'],
    // 目标元素还没渲染时先等待，超时后跳过该步骤，避免引导卡死
    skipMissingElement: true,
    stagePadding: 6,
    stageRadius: TOUR_STAGE_RADIUS,
    steps,
    waitForElement: TOUR_WAIT_FOR_ELEMENT_MS,
    ...overrides,
  }
}

export function createTourDriver(options: TourDriverOptions): Driver {
  return driver(createTourConfig(options))
}
