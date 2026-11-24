import type { KittenClip } from './kittenSprites';

export type KittenMood = 'happy' | 'ok' | 'sad' | 'sleepy';

/** Что видно на экране в этот момент. */
export type KittenSnap = {
  clip: KittenClip;
  frame: number;
  /** Центр тела по x, в точках экрана */
  x: number;
  /** 1 — смотрит вправо, -1 — влево */
  dir: 1 | -1;
  /** 0…1 — насколько котик в воздухе (для тени) */
  air: number;
};

type ClipTiming = Record<KittenClip, { frames: number; fps: number }>;


/** Базовые действия; у сидячих есть вариант «лицом к экрану» (clip + 'F'). */
type BaseClip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'sleep' | 'call' | 'turn';
const FRONT: ReadonlySet<BaseClip> = new Set(['idle', 'sit', 'sleep', 'call']);
/** Какой лист показывать: стоя, сидя, во сне и мяукая котик всегда смотрит на нас. */
const shown = (c: BaseClip): KittenClip => (FRONT.has(c) ? (`${c}F` as KittenClip) : (c as KittenClip));

type Act = {
  clip: BaseClip;
  /** Сколько длится зацикленное действие, с */
  dur?: number;
  /** Один проход клипа и дальше по плану */
  once?: boolean;
  /** Цель по x для ходьбы и бега */
  target?: number;
  /** Для поворота: разворот обратно боком (кадры в обратном порядке) */
  back?: boolean;
  /** Что делать после поворота */
  then?: Act;
};

/** Скорость лап из анимации, м/с: с этой скоростью котик не «скользит» по полу. */
const SPEED: Partial<Record<BaseClip, number>> = { walk: 0.159, run: 0.281 };
/** Прыжок переносит котика вперёд на 0,3 м между кадрами отрыва и приземления. */
const JUMP = { dist: 0.3, from: 10, to: 28 };
/** Сколько касаний подряд нужно, чтобы котик подпрыгнул от радости. */
const TAPS_FOR_JUMP = 3;

type Weights = Partial<Record<'walk' | 'run' | 'jump' | 'idle' | 'sit', number>>;
const PLAN: Record<Exclude<KittenMood, 'sleepy'>, Weights> = {
  happy: { walk: 0.34, run: 0.24, jump: 0.14, idle: 0.16, sit: 0.12 },
  ok: { walk: 0.42, run: 0.06, jump: 0.04, idle: 0.28, sit: 0.2 },
  sad: { walk: 0.18, idle: 0.24, sit: 0.58 },
};

/**
 * Поведение 3D-котика: сам гуляет, бегает, прыгает, сидит и спит по настроению,
 * на касание мяукает, а от нескольких касаний подряд подпрыгивает.
 * Без React: состояние меняется в step(), а компонент только рисует снимок.
 */
export class KittenSim {
  x = 0;
  dir: 1 | -1 = 1;
  private minX = 0;
  private maxX = 0;
  private pxPerM = 1;
  private ready = false;
  private mood: KittenMood = 'ok';
  private act: Act = { clip: 'idle', dur: 2 };
  /** Котик смотрит на нас (front) или идёт боком (side) */
  private facing: 'front' | 'side' = 'front';
  private t = 0;
  private taps: number[] = [];

  constructor(
    private timing: ClipTiming,
    private rand: () => number = Math.random,
  ) {}

  /** Границы прогулки (центр тела) и масштаб: точек экрана на метр. */
  setBounds(minX: number, maxX: number, pxPerM: number) {
    this.minX = minX;
    this.maxX = Math.max(minX, maxX);
    this.pxPerM = pxPerM;
    if (!this.ready) {
      this.x = (this.minX + this.maxX) / 2;
      this.ready = true;
    }
    this.x = Math.min(this.maxX, Math.max(this.minX, this.x));
  }

  setMood(mood: KittenMood) {
    if (mood === this.mood) return;
    const wasSleepy = this.mood === 'sleepy';
    this.mood = mood;
    if (mood === 'sleepy') this.go({ clip: 'sleep', dur: Infinity });
    else if (wasSleepy) this.go({ clip: 'idle', dur: 2 });
  }

  /** Касание. Возвращает, что сделал котик. */
  pat(nowMs: number): 'wake' | 'meow' | 'jump' {
    if (this.act.clip === 'sleep') {
      this.taps = [];
      this.go({ clip: 'idle', dur: 2.5 });
      return 'wake';
    }
    this.taps = [...this.taps.filter((t) => nowMs - t < 1500), nowMs];
    const busy = (c: BaseClip) => this.act.clip === c || this.act.then?.clip === c;
    if (this.taps.length >= TAPS_FOR_JUMP && !busy('jump') && this.roomFor(JUMP.dist)) {
      this.taps = [];
      this.go({ clip: 'jump', once: true });
      return 'jump';
    }
    if (!busy('call')) this.go({ clip: 'call', once: true });
    return 'meow';
  }

  step(dt: number): KittenSnap {
    const dtc = Math.min(dt, 0.1);
    this.t += dtc;
    const { clip } = this.act;
    const tm = this.timing[shown(clip)];
    const length = tm.frames / tm.fps;
    if (clip === 'turn' && this.t >= length) {
      this.facing = this.act.back ? 'side' : 'front';
      this.start(this.act.then ?? { clip: 'idle', dur: 2 });
      return this.snapshot();
    }

    const speed = SPEED[clip];
    if (speed !== undefined && this.act.target !== undefined && clip !== 'turn') {
      const to = this.act.target;
      this.dir = to >= this.x ? 1 : -1;
      const stepPx = speed * this.pxPerM * dtc;
      if (Math.abs(to - this.x) <= stepPx) {
        this.x = to;
        this.next();
      } else this.x += this.dir * stepPx;
    } else if (clip === 'jump') {
      const f = this.t * tm.fps;
      if (f >= JUMP.from && f < JUMP.to) {
        const v = (JUMP.dist * this.pxPerM * tm.fps) / (JUMP.to - JUMP.from);
        this.x = Math.min(this.maxX, Math.max(this.minX, this.x + this.dir * v * dtc));
      }
    }

    if (this.act.once && this.t >= length) this.next();
    else if (this.act.dur !== undefined && this.t >= this.act.dur) this.next();
    return this.snapshot();
  }

  snapshot(): KittenSnap {
    const base = this.act.clip;
    const clip = shown(base);
    const tm = this.timing[clip];
    const raw = Math.floor(this.t * tm.fps);
    let frame = this.act.once || base === 'turn' ? Math.min(tm.frames - 1, raw) : raw % tm.frames;
    if (base === 'turn' && this.act.back) frame = tm.frames - 1 - frame;
    let air = 0;
    if (base === 'jump' && frame >= JUMP.from && frame < JUMP.to) air = Math.sin((Math.PI * (frame - JUMP.from)) / (JUMP.to - JUMP.from));
    return { clip, frame, x: this.x, dir: this.dir, air };
  }

  private start(act: Act) {
    this.act = act;
    this.t = 0;
  }

  /** Начать действие, при необходимости сначала повернувшись к экрану или боком. */
  private go(act: Act) {
    const wantFront = FRONT.has(act.clip);
    if (wantFront && this.facing === 'side') this.start({ clip: 'turn', back: false, then: act });
    else if (!wantFront && this.facing === 'front') this.start({ clip: 'turn', back: true, then: act });
    else this.start(act);
  }

  private roomFor(meters: number) {
    const need = meters * this.pxPerM;
    if (this.dir === 1 ? this.maxX - this.x >= need : this.x - this.minX >= need) return true;
    // места нет — разворачиваемся, если сзади есть
    const other = this.dir === 1 ? this.x - this.minX : this.maxX - this.x;
    if (other >= need) {
      this.dir = this.dir === 1 ? -1 : 1;
      return true;
    }
    return false;
  }

  private pickTarget(minShare: number) {
    const span = this.maxX - this.minX;
    for (let i = 0; i < 6; i++) {
      const to = this.minX + this.rand() * span;
      if (Math.abs(to - this.x) >= span * minShare) return to;
    }
    return this.x - this.minX > this.maxX - this.x ? this.minX : this.maxX;
  }

  private next() {
    if (this.mood === 'sleepy') {
      this.go({ clip: 'sleep', dur: Infinity });
      return;
    }
    const w = PLAN[this.mood];
    // после сидения/прогулки не повторяем одно и то же подряд слишком часто
    const prev = this.act.clip;
    const options = (Object.entries(w) as [keyof Weights, number][]).map(([k, v]) => [k, k === prev ? v * 0.4 : v] as const);
    const sum = options.reduce((a, [, v]) => a + v, 0);
    let r = this.rand() * sum;
    let choice: keyof Weights = 'idle';
    for (const [k, v] of options) {
      r -= v;
      if (r <= 0) {
        choice = k;
        break;
      }
    }
    const span = this.maxX - this.minX;
    if ((choice === 'walk' || choice === 'run') && span < 20) choice = 'idle';
    if (choice === 'jump' && !this.roomFor(JUMP.dist)) choice = 'walk';
    switch (choice) {
      case 'walk':
        this.go({ clip: 'walk', target: this.pickTarget(this.mood === 'sad' ? 0.1 : 0.25) });
        break;
      case 'run':
        this.go({ clip: 'run', target: this.pickTarget(0.45) });
        break;
      case 'jump':
        this.go({ clip: 'jump', once: true });
        break;
      case 'sit':
        this.go({ clip: 'sit', dur: 4 + this.rand() * 5 });
        break;
      default:
        this.go({ clip: 'idle', dur: 2 + this.rand() * 2 });
    }
  }
}
