// Создано скриптом сборки спрайтов 3D-котика. Не редактировать вручную.
import type { ImageSourcePropType } from 'react-native';

export type KittenClip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'sleep' | 'call';

export type ClipInfo = { frames: number; fps: number; cols: number; rows: number; src: ImageSourcePropType };

export const KITTEN_SPRITES = {
  cellW: 447,
  cellH: 469,
  /** пикселей листа на метр мира (для скорости шагов без «скольжения») */
  pxPerM: 513.113,
  /** где в ячейке центр тела по x и линия пола по y */
  anchorX: 222.01,
  floorY: 466.25,
  /** высота котика (стоя) на листе, px */
  catH: 300,
  /** на листе котик смотрит влево */
  clips: {
    idle: { frames: 20, fps: 10, cols: 8, rows: 3, src: require('../../assets/kitten/idle.webp') },
    walk: { frames: 24, fps: 30, cols: 8, rows: 3, src: require('../../assets/kitten/walk.webp') },
    run: { frames: 16, fps: 30, cols: 8, rows: 2, src: require('../../assets/kitten/run.webp') },
    jump: { frames: 40, fps: 30, cols: 8, rows: 5, src: require('../../assets/kitten/jump.webp') },
    sit: { frames: 24, fps: 12, cols: 8, rows: 3, src: require('../../assets/kitten/sit.webp') },
    sleep: { frames: 20, fps: 6.667, cols: 8, rows: 3, src: require('../../assets/kitten/sleep.webp') },
    call: { frames: 24, fps: 15, cols: 8, rows: 3, src: require('../../assets/kitten/call.webp') },
  } as Record<KittenClip, ClipInfo>,
};

export const KITTEN_STILL: ImageSourcePropType = require('../../assets/kitten/still.webp');
export const KITTEN_STILL_RATIO = 0.7639;
