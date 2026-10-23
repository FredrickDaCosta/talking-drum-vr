import { APP_CONFIG, type LessonPanelConfig, type PitchBand } from '../app/config.js';
import type { LessonView, SyllableMark } from '../game/lesson-view.js';

/**
 * Draws the lesson panel into a 2D canvas (uploaded as a texture by LessonSystem). UIKit's bundled
 * MSDF font has no Yoruba letters (ẹ ọ ṣ) or combining tone marks, so text is drawn with the
 * browser's own shaping and the bundled Noto Sans subset (`public/fonts/`, OFL) registered as
 * LESSON_FONT_FAMILY. Stars and tone arrows are paths, not glyphs.
 */

export const LESSON_FONT_FAMILY = 'LessonSans';
export const LESSON_FONT_FILES: readonly { weight: '400' | '700'; file: string }[] = [
  { weight: '400', file: 'fonts/noto-sans-yoruba-400.woff2' },
  { weight: '700', file: 'fonts/noto-sans-yoruba-700.woff2' },
];

export const BAND_COLOURS_CSS: Record<PitchBand, string> = {
  L: '#4f8fd6',
  M: '#f0b429',
  H: '#e8590c',
};

const MARK_COLOURS: Record<Exclude<SyllableMark, 'none'>, string> = {
  right: '#3fb950',
  wrong: '#f85149',
  missing: '#6e7681',
};

const STATUS_COLOURS: Record<string, string> = {
  'Well done': '#3fb950',
  'Try again': '#f0b429',
  'Not this time': '#f85149',
  'Your turn': '#58a6ff',
  'Strike the drum to begin.': '#f0b429',
};

function font(weight: 400 | 700, sizePx: number): string {
  return `${weight} ${sizePx}px ${LESSON_FONT_FAMILY}, sans-serif`;
}

/** Sets the largest font size <= sizePx at which `text` fits in maxWidth. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: 400 | 700,
  sizePx: number,
  maxWidth: number,
): void {
  let size = sizePx;
  ctx.font = font(weight, size);
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = font(weight, size);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  filled: boolean,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.strokeStyle = '#f0b429';
  ctx.stroke();
  if (filled) {
    ctx.fillStyle = '#f0b429';
    ctx.fill();
  }
}

/** Tone arrow: H points up, L points down, M is a flat bar. */
export function drawToneArrow(
  ctx: CanvasRenderingContext2D,
  band: PitchBand,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.strokeStyle = BAND_COLOURS_CSS[band];
  ctx.fillStyle = BAND_COLOURS_CSS[band];
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = 'round';
  const half = size / 2;
  ctx.beginPath();
  if (band === 'M') {
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx + half, cy);
    ctx.stroke();
    return;
  }
  const dir = band === 'H' ? -1 : 1;
  const tipY = cy + dir * half;
  ctx.moveTo(cx, cy - dir * half);
  ctx.lineTo(cx, tipY - dir * size * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx - size * 0.3, tipY - dir * size * 0.38);
  ctx.lineTo(cx + size * 0.3, tipY - dir * size * 0.38);
  ctx.closePath();
  ctx.fill();
}

function drawMark(ctx: CanvasRenderingContext2D, mark: SyllableMark, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  if (mark === 'none') {
    ctx.fillStyle = '#e6edf3';
    ctx.fill();
  } else if (mark === 'missing') {
    ctx.lineWidth = 3;
    ctx.strokeStyle = MARK_COLOURS.missing;
    ctx.stroke();
  } else {
    ctx.fillStyle = MARK_COLOURS[mark];
    ctx.fill();
  }
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  earned: number,
  max: number,
  cx: number,
  cy: number,
  r: number,
): void {
  if (max <= 3) {
    const gap = r * 2.4;
    const x0 = cx - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i += 1) {
      star(ctx, x0 + i * gap, cy, r, i < earned);
    }
    return;
  }
  star(ctx, cx - r * 2.2, cy, r, true);
  ctx.fillStyle = '#e6edf3';
  ctx.font = font(700, Math.round(r * 1.5));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${earned} / ${max}`, cx - r * 0.9, cy + 2);
}

/** Draws the whole panel. Called only when the view changes. Text sizes come from config. */
export function drawLessonPanel(
  ctx: CanvasRenderingContext2D,
  view: LessonView,
  width: number,
  height: number,
  textPx: LessonPanelConfig['textPx'] = APP_CONFIG.lessonPanel.textPx,
): void {
  ctx.clearRect(0, 0, width, height);
  roundRect(ctx, 4, 4, width - 8, height - 8, 28);
  ctx.fillStyle = 'rgba(14, 17, 22, 0.9)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(240, 180, 41, 0.55)';
  ctx.stroke();

  const cx = width / 2;
  const inner = width - 80;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fb3c8';
  fitFont(ctx, view.header, 400, textPx.header, inner - 160);
  ctx.fillText(view.header, 40, 52);

  const hasPhrase = view.tones.length > 0;
  const isDrill = hasPhrase && view.word.length === 0;

  if (view.stars !== null) {
    if (hasPhrase) {
      drawStars(ctx, view.stars.earned, view.stars.max, width - 110, 40, 20);
    } else {
      drawStars(ctx, view.stars.earned, view.stars.max, cx, 190, 46);
    }
  }

  if (hasPhrase) {
    const n = view.tones.length;
    const column = Math.min(200, inner / n);
    const x0 = cx - (column * (n - 1)) / 2;

    if (!isDrill) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      fitFont(ctx, view.word, 700, textPx.word, inner);
      ctx.fillText(view.word, cx, 150);
    }

    const sylY = isDrill ? 0 : 228;
    const arrowY = isDrill ? 190 : 290;
    const arrowSize = isDrill ? 90 : 50;
    for (let i = 0; i < n; i += 1) {
      const x = x0 + i * column;
      if (i === view.highlightIndex) {
        roundRect(
          ctx,
          x - column / 2 + 8,
          isDrill ? 120 : 186,
          column - 16,
          isDrill ? 150 : 140,
          16,
        );
        ctx.fillStyle = 'rgba(240, 180, 41, 0.28)';
        ctx.fill();
      }
      if (!isDrill) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e6edf3';
        fitFont(ctx, view.syllables[i] ?? '', 400, textPx.syllable, column - 16);
        ctx.fillText(view.syllables[i] ?? '', x, sylY);
      }
      drawToneArrow(ctx, view.tones[i], x, arrowY, arrowSize);
      const mark = view.marks[i];
      if (mark !== undefined) {
        drawMark(ctx, mark, x, arrowY + arrowSize / 2 + 16);
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9d1d9';
    fitFont(ctx, view.gloss, 400, textPx.gloss, inner);
    ctx.fillText(view.gloss, cx, isDrill ? 310 : 372);
  }

  ctx.textAlign = 'center';
  let statusY: number;
  let detailY: number;
  if (hasPhrase) {
    statusY = 432;
    detailY = 482;
  } else if (view.instructions.length > 0) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < view.instructions.length; i += 1) {
      fitFont(ctx, view.instructions[i], 400, textPx.instruction, inner);
      ctx.fillText(view.instructions[i], cx, 140 + i * (textPx.instruction + 22));
    }
    statusY = 340;
    detailY = 420;
  } else if (view.stars !== null) {
    statusY = 330;
    detailY = 410;
  } else {
    statusY = 250;
    detailY = 330;
  }
  ctx.fillStyle = STATUS_COLOURS[view.status] ?? '#e6edf3';
  fitFont(ctx, view.status, 700, hasPhrase ? textPx.status : textPx.bigStatus, inner);
  ctx.fillText(view.status, cx, statusY);

  ctx.fillStyle = '#9fb3c8';
  fitFont(ctx, view.detail, 400, textPx.detail, inner);
  ctx.fillText(view.detail, cx, detailY);
}

/** Debug only: draws text lines (e.g. diacritic specimens) with the lesson font. */
export function drawFontSpecimen(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const step = height / (lines.length + 0.5);
  for (let i = 0; i < lines.length; i += 1) {
    fitFont(ctx, lines[i], 400, Math.min(72, Math.floor(step * 0.7)), width - 40);
    ctx.fillText(lines[i], 20, step * (i + 1));
  }
}
