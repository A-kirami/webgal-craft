import { describe, expect, it } from 'vitest'

import {
  applyMove,
  applyRotate,
  applyScale,
  canvasPointToStagePoint,
  computeTransformFrame,
  resolveSizeLabelPlacement,
} from '../geometry'

import type { ReferenceBox } from '~/types/editorPreviewProtocol'

const referenceBox: ReferenceBox = {
  originX: 640,
  originY: 360,
  width: 200,
  height: 100,
  anchorX: 0.5,
  anchorY: 0.5,
  stageWidth: 1280,
  stageHeight: 720,
}

function pointAtDegree(degree: number): { x: number, y: number } {
  const radian = (degree * Math.PI) / 180
  return {
    x: Math.cos(radian),
    y: Math.sin(radian),
  }
}

describe('geometry', () => {
  it('变换框计算会把原点与锚点作为变换原点处理', () => {
    expect(computeTransformFrame({
      box: referenceBox,
      canvasSize: { width: 1280, height: 720 },
      transform: {
        position: { x: 20, y: -10 },
        scale: { x: 1.5, y: 2 },
        rotation: 0.25,
      },
    })).toEqual({
      anchorX: 0.5,
      anchorY: 0.5,
      height: 200,
      left: 510,
      originX: 660,
      originY: 350,
      rotation: 0.25,
      scaleX: 1,
      scaleY: 1,
      top: 250,
      width: 300,
    })
  })

  it('变换框计算在负缩放时仍覆盖翻转后的视觉区域', () => {
    expect(computeTransformFrame({
      box: {
        ...referenceBox,
        anchorX: 0.25,
        anchorY: 0.3,
      },
      canvasSize: { width: 1280, height: 720 },
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: -1.5, y: -2 },
        rotation: 0,
      },
    })).toEqual({
      anchorX: 0.75,
      anchorY: 0.7,
      height: 200,
      left: 415,
      originX: 640,
      originY: 360,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      top: 220,
      width: 300,
    })
  })

  it('拖动会把舞台坐标增量写入位置', () => {
    expect(applyMove({
      delta: { x: 12, y: -8 },
      startTransform: {
        position: { x: 20, y: 10 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })).toEqual({
      position: { x: 32, y: 2 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    })
  })

  it('按住 Shift 旋转时会吸附到 15 度整数倍', () => {
    const result = applyRotate({
      baseTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0.02,
      },
      center: { x: 640, y: 360 },
      currentPointer: { x: 640, y: 460 },
      previousPointer: { x: 740, y: 360 },
      rawRotation: 0.02,
      shiftKey: true,
    })

    expect(result.transform.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('旋转增量跨过角度边界后会继续累加角度', () => {
    const baseTransform = {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: (219 * Math.PI) / 180,
    }

    const result = applyRotate({
      baseTransform,
      center: { x: 0, y: 0 },
      currentPointer: pointAtDegree(-179),
      previousPointer: pointAtDegree(179),
      rawRotation: baseTransform.rotation,
      shiftKey: false,
    })

    expect(result.rawRotation).toBeCloseTo((221 * Math.PI) / 180)
    expect(result.transform.rotation).toBeCloseTo((221 * Math.PI) / 180)
  })

  it('反向旋转增量跨过角度边界后会继续递减角度', () => {
    const baseTransform = {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: (-219 * Math.PI) / 180,
    }

    const result = applyRotate({
      baseTransform,
      center: { x: 0, y: 0 },
      currentPointer: pointAtDegree(179),
      previousPointer: pointAtDegree(-179),
      rawRotation: baseTransform.rotation,
      shiftKey: false,
    })

    expect(result.rawRotation).toBeCloseTo((-221 * Math.PI) / 180)
    expect(result.transform.rotation).toBeCloseTo((-221 * Math.PI) / 180)
  })

  it('角点等比缩放会固定对角点并补偿位置', () => {
    const result = applyScale({
      box: referenceBox,
      handle: 'se',
      keepRatio: true,
      pointerDelta: { x: 100, y: 0 },
      startTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })

    expect(result.scale.x).toBeCloseTo(1.4)
    expect(result.scale.y).toBeCloseTo(1.4)
    expect(result.position.x).toBeCloseTo(40)
    expect(result.position.y).toBeCloseTo(20)
  })

  it('角点等比缩放接近 1 时不会因主轴切换跳到放大值', () => {
    const result = applyScale({
      box: referenceBox,
      handle: 'se',
      keepRatio: true,
      pointerDelta: { x: -4, y: 6 },
      startTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })

    expect(result.scale.x).toBeLessThanOrEqual(1)
    expect(result.scale.x).toBeCloseTo(1)
    expect(result.scale.y).toBeCloseTo(result.scale.x)
  })

  it('边线缩放只修改对应轴并固定对边', () => {
    const result = applyScale({
      box: referenceBox,
      handle: 'e',
      keepRatio: false,
      pointerDelta: { x: 60, y: 20 },
      startTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })

    expect(result.scale.x).toBeCloseTo(1.3)
    expect(result.scale.y).toBeCloseTo(1)
    expect(result.position.x).toBeCloseTo(30)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('边线等比缩放会按拖拽轴同步另一轴并固定对边中心', () => {
    const result = applyScale({
      box: referenceBox,
      handle: 'e',
      keepRatio: true,
      pointerDelta: { x: 60, y: 20 },
      startTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })

    expect(result.scale.x).toBeCloseTo(1.3)
    expect(result.scale.y).toBeCloseTo(1.3)
    expect(result.position.x).toBeCloseTo(30)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('边线缩放允许从正向拖过零点变成负值', () => {
    const result = applyScale({
      box: referenceBox,
      handle: 'e',
      keepRatio: false,
      pointerDelta: { x: -220, y: 0 },
      startTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })

    expect(result.scale.x).toBeCloseTo(-0.1)
    expect(result.scale.y).toBeCloseTo(1)
    expect(result.position.x).toBeCloseTo(-110)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('负缩放拖拽到比例 1 附近时不会被夹回正向最小值', () => {
    const result = applyScale({
      box: referenceBox,
      handle: 'e',
      keepRatio: false,
      pointerDelta: { x: 20, y: 0 },
      startTransform: {
        position: { x: 0, y: 0 },
        scale: { x: -1, y: 1 },
        rotation: 0,
      },
    })

    expect(result.scale.x).toBeCloseTo(-0.9)
    expect(result.scale.y).toBeCloseTo(1)
    expect(result.position.x).toBeCloseTo(10)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('视口缩放不会改变舞台坐标系中的拖拽增量', () => {
    const frame = computeTransformFrame({
      box: referenceBox,
      canvasSize: { width: 640, height: 360 },
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })

    expect(canvasPointToStagePoint({ x: 20, y: 10 }, frame)).toEqual({ x: 40, y: 20 })
  })

  it('尺寸标签在未旋转时居中贴在底边并保持水平', () => {
    const placement = resolveSizeLabelPlacement({
      anchorX: 0.5,
      anchorY: 0.5,
      height: 100,
      left: 100,
      originX: 200,
      originY: 150,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      top: 100,
      width: 200,
    }, 8)

    expect(placement).toEqual({
      rotation: 0,
      x: 200,
      y: 208,
    })
  })
})
