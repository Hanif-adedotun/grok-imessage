/**
 * The Grok Bot face: a head with two capsule eyes that glance around, blink,
 * and follow the pointer. Geometry is in the 92-unit space of the original mark.
 */

type Pose = {
  /** Eye pair offset from the centre of the head. */
  x: number;
  y: number;
  /** Rotation of the line through both eyes, in degrees. */
  roll: number;
  /** Rotation of each eye about its own centre, in degrees. */
  tilt: number;
  /** Distance between the eye centres. */
  spread: number;
  w: number;
  h: number;
  /** Head size relative to rest. */
  scale: number;
};

const CENTER = 46;
const RADIUS = 27.6;

const REST: Pose = { x: 0, y: 0, roll: 0, tilt: 0, spread: 17.2, w: 6.9, h: 15.5, scale: 1 };

const GLANCES: Pose[] = [
  REST,
  { x: 9, y: -11, roll: -25, tilt: 32, spread: 14, w: 7.4, h: 14, scale: 1 },
  { x: 15, y: -4, roll: -24, tilt: 20, spread: 12.8, w: 7.6, h: 14.8, scale: 1 },
  { x: -10, y: -2, roll: 12, tilt: -20, spread: 14.4, w: 7.4, h: 14.8, scale: 1 },
  { x: 2, y: -14, roll: -14, tilt: 24, spread: 16, w: 8, h: 12.5, scale: 1 },
  { x: 0, y: 0, roll: 0, tilt: 0, spread: 19.2, w: 9.8, h: 10.5, scale: 1 },
];

/** The occasional shy shrink, before popping back out. */
const DUCK: Pose = { x: -6, y: -4, roll: 36, tilt: 8, spread: 12.8, w: 7, h: 7.4, scale: 0.7 };

const KEYS = Object.keys(REST) as (keyof Pose)[];
const BLINK_MS = 170;
const POINTER_IDLE_MS = 2200;

type Face = {
  svg: SVGSVGElement;
  head: SVGCircleElement;
  eyes: [SVGRectElement, SVGRectElement];
  pose: Pose;
  target: Pose;
  nextGlance: number;
  nextBlink: number;
  blinkStart: number;
  blinksLeft: number;
  visible: boolean;
};

const between = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const rad = (deg: number) => (deg * Math.PI) / 180;

function glance(face: Face, now: number) {
  if (face.target === DUCK) {
    face.target = REST;
    face.nextGlance = now + between(900, 1800);
    return;
  }
  if (Math.random() < 0.08) {
    face.target = DUCK;
    face.nextGlance = now + 900;
    return;
  }
  let next = face.target;
  while (next === face.target) next = GLANCES[Math.floor(Math.random() * GLANCES.length)]!;
  face.target = next;
  face.nextGlance = now + between(1100, 2800);
}

/** 0 when open, 1 at the bottom of a blink. */
function blinkAmount(face: Face, now: number) {
  if (now >= face.nextBlink && face.blinkStart < 0) face.blinkStart = now;
  if (face.blinkStart < 0) return 0;

  const t = (now - face.blinkStart) / BLINK_MS;
  if (t < 1) return Math.sin(t * Math.PI);

  face.blinkStart = -1;
  if (face.blinksLeft > 0) {
    face.blinksLeft -= 1;
    face.nextBlink = now + 90;
  } else {
    face.blinksLeft = Math.random() < 0.25 ? 1 : 0;
    face.nextBlink = now + between(2200, 5200);
  }
  return 0;
}

function render(face: Face, blink: number) {
  const p = face.pose;
  const cx = CENTER + p.x * p.scale;
  const cy = CENTER + p.y * p.scale;
  const half = (p.spread * p.scale) / 2;
  const dx = Math.cos(rad(p.roll)) * half;
  const dy = Math.sin(rad(p.roll)) * half;

  face.head.setAttribute("r", (RADIUS * p.scale).toFixed(2));

  // The eye further from the viewer narrows as the face turns.
  const turn = clamp(p.x * 0.01, -0.3, 0.3);
  const sides = [
    { x: cx - dx, y: cy - dy, w: p.w * (1 + turn) },
    { x: cx + dx, y: cy + dy, w: p.w * (1 - turn) },
  ];

  sides.forEach((side, i) => {
    const eye = face.eyes[i]!;
    const w = side.w * (1 - 0.08 * blink);
    const h = p.h - (p.h - side.w * 0.55) * blink;
    eye.setAttribute("x", (-w / 2).toFixed(2));
    eye.setAttribute("y", (-h / 2).toFixed(2));
    eye.setAttribute("width", w.toFixed(2));
    eye.setAttribute("height", h.toFixed(2));
    eye.setAttribute("rx", (Math.min(w, h) / 2).toFixed(2));
    eye.setAttribute(
      "transform",
      `translate(${side.x.toFixed(2)} ${side.y.toFixed(2)}) rotate(${p.tilt.toFixed(1)})`,
    );
  });
}

/** Where the eyes go to look at a point on the page. */
function lookAt(face: Face, px: number, py: number): Pose {
  const box = face.svg.getBoundingClientRect();
  const nx = clamp((px - (box.left + box.width / 2)) / 420, -1, 1);
  const ny = clamp((py - (box.top + box.height / 2)) / 320, -1, 1);
  return {
    x: nx * 13,
    y: ny * 11,
    roll: -nx * 18,
    tilt: nx * 24 - ny * 6,
    spread: 17.2 - Math.abs(nx) * 4,
    w: 6.9 + Math.abs(nx) * 0.8,
    h: 15.5 - Math.max(0, -ny) * 3,
    scale: 1,
  };
}

export function initFaces(): { destroy: () => void } | null {
  const svgs = Array.from(document.querySelectorAll<SVGSVGElement>("svg[data-bot-face]"));
  if (svgs.length === 0) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

  const start = performance.now();
  const faces: Face[] = [];
  for (const svg of svgs) {
    const head = svg.querySelector<SVGCircleElement>(".bot-face-head");
    const eyes = svg.querySelectorAll<SVGRectElement>(".bot-face-eye");
    if (!head || eyes.length !== 2) continue;
    faces.push({
      svg,
      head,
      eyes: [eyes[0]!, eyes[1]!],
      pose: { ...REST },
      target: REST,
      nextGlance: start + between(600, 1600),
      nextBlink: start + between(800, 2400),
      blinkStart: -1,
      blinksLeft: 0,
      visible: true,
    });
  }

  let pointer: { x: number; y: number; at: number } | null = null;
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const face = faces.find((f) => f.svg === entry.target);
      if (face) face.visible = entry.isIntersecting;
    }
  });
  for (const face of faces) observer.observe(face.svg);

  let last = start;
  let frame = requestAnimationFrame(function tick(now) {
    const dt = Math.min(64, now - last);
    last = now;
    const tracking = pointer !== null && now - pointer.at < POINTER_IDLE_MS;

    for (const face of faces) {
      if (!face.visible) continue;

      let target = face.target;
      if (tracking && face.target !== DUCK) {
        target = lookAt(face, pointer!.x, pointer!.y);
        face.nextGlance = now + between(600, 1400);
      } else if (now >= face.nextGlance) {
        glance(face, now);
        target = face.target;
      }

      // Exponential approach: frame-rate independent, settles in about 300ms.
      const tau = target === DUCK || face.pose.scale < 0.97 ? 110 : 75;
      const k = 1 - Math.exp(-dt / tau);
      for (const key of KEYS) face.pose[key] += (target[key] - face.pose[key]) * k;

      render(face, blinkAmount(face, now));
    }

    frame = requestAnimationFrame(tick);
  });

  return {
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
    },
  };
}
