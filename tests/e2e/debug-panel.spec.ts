import fs from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { enterVrWithIwerHands, pitchState, rightHandStrike, trackErrors } from './iwer-hands.js';

/**
 * P2d in-VR debug panel: absent without ?debug=1; with it, live values in an IWER hand session,
 * index-fingertip touches (right = mark, left = hide/show) and the keyboard shortcuts.
 */

const EVIDENCE = process.env.P2D_EVIDENCE_DIR;

interface PanelHooks {
  visible: boolean;
  refreshes: number;
  touches: { left: number; right: number };
  centre: { x: number; y: number; z: number };
  tips: Record<'left' | 'right', { x: number; y: number; z: number }>;
  lines: string[];
  snapshot: Record<string, number | string>;
  facingDeg: number;
  head: { x: number; y: number; z: number };
}

async function panel(page: Page): Promise<PanelHooks> {
  return page.evaluate(() => {
    const p = (window as unknown as { __talkingDrumDebugPanel: PanelHooks })
      .__talkingDrumDebugPanel;
    return JSON.parse(JSON.stringify(p)) as PanelHooks;
  });
}

async function markCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__talkingDrumDebugPanel!.marks().length);
}

/** Moves one IWER hand so its index fingertip sits at the panel centre (then away again). */
async function touchPanel(page: Page, hand: 'left' | 'right'): Promise<void> {
  await page.evaluate(async (h) => {
    const device = (
      window as unknown as {
        __xrDevice: {
          hands: Record<
            'left' | 'right',
            {
              position: {
                x: number;
                y: number;
                z: number;
                set: (x: number, y: number, z: number) => void;
              };
            }
          >;
        };
      }
    ).__xrDevice;
    const hooks = window.__talkingDrumDebugPanel!;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const pos = device.hands[h].position;
    const start = { x: pos.x, y: pos.y, z: pos.z };
    for (let i = 0; i < 3; i += 1) {
      await frame();
      await frame();
      const tip = hooks.tips[h];
      const c = hooks.centre;
      pos.set(pos.x + (c.x - tip.x), pos.y + (c.y - tip.y), pos.z + (c.z - tip.z));
    }
    for (let i = 0; i < 4; i += 1) {
      await frame();
    }
    pos.set(start.x, start.y, start.z);
    for (let i = 0; i < 4; i += 1) {
      await frame();
    }
  }, hand);
}

test.describe('Talking Drum VR — P2d in-VR debug panel (IWER hands)', () => {
  test('is absent without ?debug=1', async ({ page }) => {
    const errors = trackErrors(page);
    await enterVrWithIwerHands(page, 'calib=0');
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__talkingDrumDebugPanel === undefined)).toBe(true);
    expect(await page.evaluate(() => document.getElementById('xr-debug-hud'))).toBeNull();
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('shows live values in XR; right touch marks, left touch hides; keys work', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = trackErrors(page);
    await enterVrWithIwerHands(page, 'debug=1&calib=0');
    await expect
      .poll(async () => (await pitchState(page)).tracking, { timeout: 5000 })
      .toBe('TRACKED');

    // Refreshes at ~4 Hz with live values.
    const first = await panel(page);
    expect(first.visible).toBe(true);
    await page.waitForTimeout(1500);
    const later = await panel(page);
    expect(later.refreshes - first.refreshes).toBeGreaterThanOrEqual(4);
    expect(later.refreshes - first.refreshes).toBeLessThanOrEqual(8);
    expect(Number(later.snapshot.fps)).toBeGreaterThan(0);
    expect(later.snapshot.rightHand).toBe('TRACKED');
    expect(later.snapshot.leftHand).toBe('TRACKED');
    expect(later.snapshot.audioState).toBe('running');
    expect(later.snapshot.calibration).toBe('skipped');
    expect(later.snapshot.lessonPhase).toBe('TITLE');
    expect(later.lines[4]).toBe('Hands|R TRACKED   L TRACKED');
    expect(later.lines[9]).toBe('Session|-- / cap 8:30   not reached');
    // Placed low-right of the drum, turned to face the head, within 0.61 m of it.
    expect(later.facingDeg).toBeLessThan(2);
    const d = Math.hypot(
      later.centre.x - later.head.x,
      later.centre.y - later.head.y,
      later.centre.z - later.head.z,
    );
    expect(d).toBeLessThan(0.61);

    // A strike shows up on the panel.
    expect(await rightHandStrike(page)).toBe(true);
    await expect.poll(async () => (await panel(page)).lines[2]).toMatch(/^Strikes\|1 {3}last \d/);
    await expect.poll(async () => (await panel(page)).snapshot.lessonPhase).not.toBe('TITLE');
    // The title strike starts the session clock shown against the soft cap.
    await expect
      .poll(async () => (await panel(page)).lines[9])
      .toMatch(/^Session\|0:\d\d \/ cap 8:30 {3}not reached$/);

    if (EVIDENCE) {
      fs.mkdirSync(EVIDENCE, { recursive: true });
      await page.waitForTimeout(600);
      const url = await page.evaluate(() => window.__talkingDrumDebugPanel!.canvas.toDataURL());
      fs.writeFileSync(`${EVIDENCE}/p2d-debug-panel.png`, Buffer.from(url.split(',')[1], 'base64'));
      // Evidence only: look down ~25 degrees like a seated player and hide the flat-page HUD.
      await page.evaluate(() => {
        const d = (
          window as unknown as {
            __xrDevice: {
              quaternion: { set: (x: number, y: number, z: number, w: number) => void };
            };
          }
        ).__xrDevice;
        const half = (-25 * Math.PI) / 360;
        d.quaternion.set(Math.sin(half), 0, 0, Math.cos(half));
        document.getElementById('xr-debug-hud')!.style.display = 'none';
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${EVIDENCE}/p2d-debug-panel-xr-view.png` });
      await page.evaluate(() => {
        const d = (
          window as unknown as {
            __xrDevice: {
              quaternion: { set: (x: number, y: number, z: number, w: number) => void };
            };
          }
        ).__xrDevice;
        d.quaternion.set(0, 0, 0, 1);
        document.getElementById('xr-debug-hud')!.style.display = '';
      });
      await page.waitForTimeout(300);
    }

    // Right index fingertip touch = one mark.
    await touchPanel(page, 'right');
    await expect.poll(async () => (await panel(page)).touches.right).toBe(1);
    expect(await markCount(page)).toBe(1);
    const marks = await page.evaluate(() => window.__talkingDrumDebugPanel!.marks());
    expect(marks[0]).toMatchObject({ index: 1, strikeCount: 1 });
    await expect.poll(async () => (await panel(page)).lines[10]).toMatch(/^Marks\|1 /);
    expect((await panel(page)).visible).toBe(true);

    // Left index fingertip touch = hide.
    await touchPanel(page, 'left');
    await expect.poll(async () => (await panel(page)).touches.left).toBe(1);
    expect((await panel(page)).visible).toBe(false);
    expect(await markCount(page)).toBe(1);

    // Keyboard shortcuts (desktop / emulator): Backquote toggles, M marks.
    await page.keyboard.press('Backquote');
    expect((await panel(page)).visible).toBe(true);
    await page.keyboard.press('KeyM');
    expect(await markCount(page)).toBe(2);
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
