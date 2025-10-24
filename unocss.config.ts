import { presetWind4 } from '@unocss/preset-wind4'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { presetAnimations } from 'unocss-preset-animations'
import { presetShadcn } from 'unocss-preset-shadcn'

export default defineConfig({
  presets: [
    presetWind4({
      preflights: {
        reset: true,
      },
    }),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetTypography(),
    presetAnimations(),
    presetShadcn(
      {
        color: 'zinc',
      },
      {
        componentLibrary: 'reka',
      },
    ),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        '(components|src)/**/*.{js,ts}',
      ],
    },
  },
  theme: {
    animation: {
      keyframes: {
        shimmer: '{100%{transform:translateX(25%);opacity:0}}',
      },
      durations: {
        shimmer: '2.5s',
      },
      timingFns: {
        shimmer: 'ease-out',
      },
      counts: {
        shimmer: 'infinite',
      },
    },
  },
})
