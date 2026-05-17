import { describe, expect, it } from 'vitest';
import { formatRupeeKpiLakhAbbrev } from './indianRupeeKpi';

describe('formatRupeeKpiLakhAbbrev', () => {
  it('keeps compact en-IN display below ₹1 lakh', () => {
    expect(formatRupeeKpiLakhAbbrev(20033.01)).toEqual({
      short: '₹20,033.01',
      full: '₹20,033.01',
      abbreviated: false,
    });
  });

  it('abbreviates ₹1 lakh or more as lakhs with tooltip full amount', () => {
    const r = formatRupeeKpiLakhAbbrev(1708036.03);
    expect(r).toMatchObject({
      short: '₹17.08 L',
      abbreviated: true,
    });
    expect(r.full).toBe('₹17,08,036.03');
  });
});
