import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveTimer,
  getTimeEntries,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from './timeEntryService';

const token = 'test-token';

describe('timeEntryService timer APIs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('maps timer fields for active timer and list', async () => {
    localStorage.setItem('auth_token', token);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 11,
            user_id: 5,
            service_id: 22,
            timer_status: 'running',
            source: 'timer',
            started_at: '2026-01-01T10:00:00Z',
            ended_at: null,
            duration_minutes: 1,
            is_billable: true,
            activity_type: 'client_work',
            notes: 'work',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 12,
              user_id: 5,
              user_name: 'Rahul',
              service_id: 22,
              work_date: '2026-01-01',
              duration_minutes: 45,
              activity_type: 'documentation',
              is_billable: false,
              timer_status: 'submitted',
              source: 'timer',
            },
          ],
        }),
      });

    const active = await getActiveTimer();
    const list = await getTimeEntries(22);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(active?.timerStatus).toBe('running');
    expect(active?.source).toBe('timer');
    expect(list[0]?.durationMinutes).toBe(45);
    expect(list[0]?.timerStatus).toBe('submitted');
  });

  it('calls start stop and update endpoints', async () => {
    localStorage.setItem('auth_token', token);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 99, service_id: 77, timer_status: 'running' } }),
      });

    await startTimer(77, { activity_type: 'client_work' });
    await stopTimer(77, 99, {});
    await updateTimeEntry(77, 99, { timer_status: 'submitted', duration_minutes: 30 });

    expect(fetchSpy.mock.calls[0][0]).toContain('/admin/services/77/time-entries/start');
    expect(fetchSpy.mock.calls[1][0]).toContain('/admin/services/77/time-entries/99/stop');
    expect(fetchSpy.mock.calls[2][0]).toContain('/admin/services/77/time-entries/99');
    expect(fetchSpy.mock.calls[2][1]?.method).toBe('PATCH');
  });
});
