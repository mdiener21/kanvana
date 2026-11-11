// The Time Tracking page migrates the legacy global Work week before its first render.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';

const page = vi.hoisted(() => ({
  bootPage: vi.fn(async () => {}),
  mountTimeTracking: vi.fn(),
  migrateLegacyWorkWeek: vi.fn()
}));

vi.mock('../../../src/modules/page-boot.js', () => ({ bootPage: page.bootPage }));
vi.mock('../../../src/modules/timetracking-ui.js', () => ({ mountTimeTracking: page.mountTimeTracking }));
vi.mock('../../../src/modules/timetracking-legacy-work-week.js', () => ({
  migrateLegacyWorkWeek: page.migrateLegacyWorkWeek
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Time Tracking page entry', () => {
  test('mounts only once the legacy Work week migration has been applied', async () => {
    let finishMigration;
    page.migrateLegacyWorkWeek.mockReturnValue(new Promise((resolve) => { finishMigration = resolve; }));

    await import('../../../src/modules/timetracking.js');
    await waitFor(() => expect(page.migrateLegacyWorkWeek).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.mountTimeTracking).not.toHaveBeenCalled();

    finishMigration();
    await waitFor(() => expect(page.mountTimeTracking).toHaveBeenCalledWith(document));
  });

  test('a failed migration is logged once and the page still mounts', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('boom');
    page.migrateLegacyWorkWeek.mockRejectedValue(failure);

    await import('../../../src/modules/timetracking.js');

    await waitFor(() => expect(page.mountTimeTracking).toHaveBeenCalledWith(document));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[Kanvana\] /), failure);
  });
});
