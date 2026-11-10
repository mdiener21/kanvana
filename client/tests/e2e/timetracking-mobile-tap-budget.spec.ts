import { readFileSync } from 'node:fs';
import { test, expect, devices, type Locator, type Page } from '@playwright/test';
import { logDay, rows } from './timetracking-ledger.helpers.js';

// Tap budgets for the phone journeys of the mobile audit. Seed: logDay() at Thu 15 Oct 2026 15:00
// → 09:00–10:30 Morning review (Lime), 11:00–11:45 Call (Alpha), 13:00–14:15 Deploy (Beta);
// gaps 10:30–11:00 and 11:45–13:00. Every touch, keyboard action key (Enter) and key is counted.

test.use({ ...devices['Pixel 5'], timezoneId: 'Europe/Berlin' });

function countInput(page: Page) {
  const count = { taps: 0, keys: 0 };
  return {
    count,
    async tap(locator: Locator, options?: Parameters<Locator['tap']>[0]) {
      count.taps += 1;
      await locator.tap(options);
    },
    async type(text: string) {
      count.keys += text.length;
      await page.keyboard.type(text);
    },
    // Enter is the soft keyboard's action key, so it counts as a tap.
    async press(key: string) {
      if (key === 'Enter') count.taps += 1;
      else count.keys += 1;
      await page.keyboard.press(key);
    }
  };
}

const row = (page: Page, description: string) => rows(page).filter({ hasText: description });
const selectionLength = (page: Page) => page.evaluate(() => {
  const input = document.activeElement as HTMLInputElement;
  return (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
});
const expectFocusedAndSelected = async (page: Page, input: Locator) => {
  await expect(input).toBeFocused();
  await expect.poll(() => selectionLength(page)).toBe((await input.inputValue()).length);
};

test('the journeys never use fill(), which would hide a missing select-on-focus', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf-8');
  expect(source.split('\n').filter((line) => /\.fill\(/.test(line) && !line.includes('/\\.fill'))).toEqual([]);
});

test('a: continuing from the last entry takes 2 taps after the page sat open for 90 minutes', async ({ page }) => {
  await logDay(page);
  await page.clock.fastForward('01:30:00');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const input = countInput(page);

  await input.tap(page.getByLabel('Description', { exact: true }));
  await input.type('Standup');
  await input.press('Enter');

  await expect(row(page, 'Standup').locator('.tt-entry-range')).toHaveText('14:15 – 16:30');
  expect(input.count.taps).toBeLessThanOrEqual(2);
});

test('a: with no description, continuing from the last entry is one tap on Add', async ({ page }) => {
  await logDay(page);
  await page.clock.fastForward('01:30:00');
  const input = countInput(page);

  await input.tap(page.getByRole('button', { name: 'Add entry' }));

  await expect(row(page, '(no description)').locator('.tt-entry-range')).toHaveText('14:15 – 16:30');
  await expect(page.getByLabel('Description', { exact: true })).not.toBeFocused();
  expect(input.count.taps).toBeLessThanOrEqual(1);
});

test('a-kb: Add stays reachable with the soft keyboard open, and every field has a Done key', async ({ page }) => {
  await logDay(page);
  await page.getByLabel('Description', { exact: true }).tap();
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width, height: height - 330 }); // about a Gboard

  await expect(page.locator('#tt-entry-add')).toBeInViewport();
  for (const input of await page.locator('.tt-entry-bar input').all()) {
    await expect(input).toHaveAttribute('enterkeyhint', 'done');
  }
});

test('b: filling an untracked gap takes 2 taps, starting from a chip in view at load', async ({ page }) => {
  await logDay(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const chip = page.getByRole('group', { name: 'Fill untracked gaps' }).getByRole('button', { name: 'Fill 11:45 – 13:00' });
  await expect(chip).toBeInViewport();
  for (const target of [chip, page.locator('.tt-gap-fill').first()]) {
    const box = (await target.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const input = countInput(page);

  await input.tap(chip);
  await input.tap(page.getByRole('button', { name: 'Add entry' }));

  await expect(rows(page).locator('.tt-entry-range', { hasText: '11:45 – 13:00' })).toHaveCount(1);
  await expect(page.locator('.tt-gap-row', { hasText: '11:45 – 13:00' })).toHaveCount(0);
  expect(input.count.taps).toBeLessThanOrEqual(2);
});

test("c: changing an entry's Start and End takes 3 taps and 8 keys", async ({ page }) => {
  await logDay(page);
  const input = countInput(page);

  await input.tap(row(page, 'Call').getByRole('button', { name: /edit times$/ }));
  const dialog = page.getByRole('dialog', { name: 'Edit entry' });
  const start = dialog.getByLabel('Start', { exact: true });
  const end = dialog.getByLabel('End', { exact: true });
  await expect(start).toHaveAttribute('inputmode', 'numeric');
  await expect(end).toHaveAttribute('inputmode', 'numeric');
  const card = (await dialog.locator('.tt-edit-card').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await expectFocusedAndSelected(page, start);
  await input.type('1015');
  await input.tap(end);
  await expectFocusedAndSelected(page, end);
  await input.type('1130');
  await input.press('Enter');

  await expect(dialog).toBeHidden();
  await expect(row(page, 'Call').locator('.tt-entry-range')).toHaveText('10:15 – 11:30');
  expect(input.count.taps).toBeLessThanOrEqual(3);
  expect(input.count.keys).toBeLessThanOrEqual(8);
});

test('d: renaming a description takes 2 taps, and the whole cell and a wide input serve it', async ({ page }) => {
  await logDay(page);
  // While renaming the row's text is in an input value, so find the row by id.
  const callRow = page.locator(`[data-entry-id="${await row(page, 'Call').getAttribute('data-entry-id')}"]`);
  const description = callRow.locator('[data-rename]');
  const box = (await description.boundingBox())!;
  const input = countInput(page);

  await input.tap(description, { position: { x: box.width - 4, y: box.height / 2 } }); // far from the text
  const rename = callRow.getByRole('textbox', { name: 'Description' });
  await expect(rename).toBeFocused();
  const renameWidth = (await rename.boundingBox())!.width;
  const rowWidth = (await callRow.boundingBox())!.width;
  expect(renameWidth).toBeGreaterThanOrEqual(rowWidth * 0.6);
  await input.press('Control+A');
  await input.press('Backspace');
  await input.type('Client call');
  await input.press('Enter');

  await expect(callRow.locator('.tt-entry-desc')).toHaveText('Client call');
  expect(input.count.taps).toBeLessThanOrEqual(2);
});

test("e: changing an entry's project takes 2 taps and 4 keys", async ({ page }) => {
  await logDay(page);
  const input = countInput(page);

  await input.tap(row(page, 'Call').getByRole('button', { name: /open editor$/ }));
  await expectFocusedAndSelected(page, page.getByRole('dialog', { name: 'Edit entry' }).getByLabel('Project', { exact: true }));
  await input.type('bet');
  await input.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Edit entry' })).toBeHidden();
  await expect(row(page, 'Call').locator('.tt-entry-project')).toHaveText('Beta');
  expect(input.count.taps).toBeLessThanOrEqual(2);
  expect(input.count.keys).toBeLessThanOrEqual(4);
});

// ── Layout guards ──────────────────────────────────────────────────────────────

const CONTROLS = [
  '#tt-section-tracker button', '#tt-section-tracker input', '#tt-section-tracker select',
  '#tt-section-tracker [data-rename]', '.tt-topbar a', '.tt-topbar button', '.tt-sidebar button'
].join(', ');
const CONTRAST_TEXT = [
  '.tt-week-day-top', '.tt-week-day-hours', '.tt-gap-fill', '.tt-entry-range', '.tt-week-label',
  '.tt-gap-span', '.tt-gap-minutes', '.tt-day-heading', '.tt-entry-count', '.tt-fill-chip'
];

function auditLayout({ controls, contrastText }: { controls: string; contrastText: string[] }) {
  const parse = (color: string) => {
    const [r, g, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
    return { r, g, b, a };
  };
  const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const backgroundOf = (start: Element | null) => {
    for (let el = start; el; el = el.parentElement) {
      const color = parse(getComputedStyle(el).backgroundColor);
      if (color.a > 0.5) return color;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const contrast = (el: Element) => {
    let fg = parse(getComputedStyle(el).color);
    const bg = backgroundOf(el);
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    if (opacity < 1) fg = { r: fg.r * opacity + bg.r * (1 - opacity), g: fg.g * opacity + bg.g * (1 - opacity), b: fg.b * opacity + bg.b * (1 - opacity), a: 1 };
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  };
  const shown = (el: Element) => (el as HTMLElement).offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
  const name = (el: Element) => `${el.className || el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
  return {
    hoverNone: matchMedia('(hover: none)').matches,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: [...document.querySelectorAll(controls)].filter(shown).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    }).map(name),
    lowContrast: contrastText.flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(shown).map((el) => [name(el), Number(contrast(el).toFixed(2))] as const).filter(([, ratio]) => ratio < 4.5)
  };
}

const VIEWPORTS = { 'Pixel 5': devices['Pixel 5'].viewport, '360px': { width: 360, height: 740 } };

for (const [deviceName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of ['light', 'dark']) {
    test.describe(`layout guards, ${deviceName}, ${theme}`, () => {
      test.use({ viewport });

      test('no horizontal overflow, controls at least 44×44px and text at least 4.5:1', async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('kanban-theme', value), theme);
        await logDay(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const audit = () => page.evaluate(auditLayout, { controls: CONTROLS, contrastText: CONTRAST_TEXT });

        const result = await audit();
        expect(result.hoverNone).toBe(true);
        expect(result.overflow).toBeLessThanOrEqual(0);
        expect(result.small).toEqual([]);
        expect(result.lowContrast).toEqual([]);

        await row(page, 'Call').getByRole('button', { name: 'More actions' }).tap();
        await expect(page.getByRole('menu', { name: 'Entry actions' })).toBeVisible();
        const withMenu = await audit();
        expect(withMenu.overflow).toBeLessThanOrEqual(0);
        expect(withMenu.small).toEqual([]);
      });
    });
  }
}
