// Создано скриптом сборки спрайтов 3D-котика. Не редактировать вручную.
import type { ImageSourcePropType } from 'react-native';

export type KittenClip = 'walk' | 'run' | 'jump' | 'idleF' | 'sitF' | 'sleepF' | 'callF' | 'turn';

export type ClipInfo = { frames: number; fps: number; cols: number; rows: number; src: ImageSourcePropType };

export const KITTEN_SPRITES = {
  cellW: 507,
  cellH: 535,
  /** пикселей листа на метр мира (для скорости шагов без «скольжения») */
  pxPerM: 581.528,
  /** где в ячейке центр тела по x и линия пола по y */
  anchorX: 251.61,
  floorY: 528.42,
  /** высота котика (стоя) на листе, px */
  catH: 340,
  /** на листе котик смотрит влево */
  clips: {
    walk: { frames: 24, fps: 30, cols: 8, rows: 3, src: require('../../assets/kitten/walk.webp') },
    run: { frames: 16, fps: 30, cols: 8, rows: 2, src: require('../../assets/kitten/run.webp') },
    jump: { frames: 40, fps: 30, cols: 8, rows: 5, src: require('../../assets/kitten/jump.webp') },
    idleF: { frames: 20, fps: 10, cols: 8, rows: 3, src: require('../../assets/kitten/idleF.webp') },
    sitF: { frames: 24, fps: 12, cols: 8, rows: 3, src: require('../../assets/kitten/sitF.webp') },
    sleepF: { frames: 20, fps: 6.667, cols: 8, rows: 3, src: require('../../assets/kitten/sleepF.webp') },
    callF: { frames: 24, fps: 15, cols: 8, rows: 3, src: require('../../assets/kitten/callF.webp') },
    turn: { frames: 8, fps: 24, cols: 8, rows: 1, src: require('../../assets/kitten/turn.webp') },
  } as Record<KittenClip, ClipInfo>,
};

export const KITTEN_STILL: ImageSourcePropType = require('../../assets/kitten/still.webp');
export const KITTEN_STILL_RATIO = 0.7639;
