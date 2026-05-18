import { useState, useEffect, useMemo } from 'react';

const FREQUENCY_OPTIONS = [
  { value: '',         label: 'Select period type…' },
  { value: 'month',    label: 'Month' },
  { value: 'months',   label: 'Month(s)' },
  { value: 'quarter',  label: 'Quarter' },
  { value: 'quarters', label: 'Quarter(s)' },
  { value: 'year',     label: 'Year' },
  { value: 'years',    label: 'Year(s)' },
  { value: 'custom',   label: 'Custom' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const QUARTERS = [
  { value: 1, label: 'Q1 (Apr - Jun)', startMonth: 3, endMonth: 5 },
  { value: 2, label: 'Q2 (Jul - Sep)', startMonth: 6, endMonth: 8 },
  { value: 3, label: 'Q3 (Oct - Dec)', startMonth: 9, endMonth: 11 },
  { value: 4, label: 'Q4 (Jan - Mar)', startMonth: 0, endMonth: 2 },
];

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 5; y <= currentYear + 3; y++) {
    years.push(y);
  }
  return years;
}

function fyLabel(startYear) {
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function toYmd(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function computePeriod(frequency, selections) {
  if (!frequency) return { from: '', to: '', label: '' };

  switch (frequency) {
    case 'month': {
      const { month, year } = selections;
      if (month == null || !year) return { from: '', to: '', label: '' };
      const m = Number(month);
      const y = Number(year);
      const from = toYmd(y, m, 1);
      const to = toYmd(y, m, lastDayOfMonth(y, m));
      const label = `${MONTHS[m]} ${y}`;
      return { from, to, label };
    }
    case 'months': {
      const { monthFrom, yearFrom, monthTo, yearTo } = selections;
      if (monthFrom == null || !yearFrom || monthTo == null || !yearTo) return { from: '', to: '', label: '' };
      const mf = Number(monthFrom), yf = Number(yearFrom);
      const mt = Number(monthTo), yt = Number(yearTo);
      const from = toYmd(yf, mf, 1);
      const to = toYmd(yt, mt, lastDayOfMonth(yt, mt));
      const label = yf === yt
        ? `${MONTH_SHORT[mf]} - ${MONTH_SHORT[mt]} ${yf}`
        : `${MONTH_SHORT[mf]} ${yf} - ${MONTH_SHORT[mt]} ${yt}`;
      return { from, to, label };
    }
    case 'quarter': {
      const { quarter, year } = selections;
      if (!quarter || !year) return { from: '', to: '', label: '' };
      const q = QUARTERS.find(x => x.value === Number(quarter));
      if (!q) return { from: '', to: '', label: '' };
      const y = Number(year);
      const startYear = q.value === 4 ? y + 1 : y;
      const endYear = q.value === 4 ? y + 1 : y;
      const from = toYmd(startYear, q.startMonth, 1);
      const to = toYmd(endYear, q.endMonth, lastDayOfMonth(endYear, q.endMonth));
      const label = `Q${q.value} (${MONTH_SHORT[q.startMonth]} - ${MONTH_SHORT[q.endMonth]} ${startYear})`;
      return { from, to, label };
    }
    case 'quarters': {
      const { quarterFrom, yearFrom, quarterTo, yearTo } = selections;
      if (!quarterFrom || !yearFrom || !quarterTo || !yearTo) return { from: '', to: '', label: '' };
      const qf = QUARTERS.find(x => x.value === Number(quarterFrom));
      const qt = QUARTERS.find(x => x.value === Number(quarterTo));
      if (!qf || !qt) return { from: '', to: '', label: '' };
      const yf = Number(yearFrom), yt = Number(yearTo);
      const startYear = qf.value === 4 ? yf + 1 : yf;
      const endYear = qt.value === 4 ? yt + 1 : yt;
      const from = toYmd(startYear, qf.startMonth, 1);
      const to = toYmd(endYear, qt.endMonth, lastDayOfMonth(endYear, qt.endMonth));
      const label = `Q${qf.value} - Q${qt.value} (${MONTH_SHORT[qf.startMonth]} ${startYear} to ${MONTH_SHORT[qt.endMonth]} ${endYear})`;
      return { from, to, label };
    }
    case 'year': {
      const { year } = selections;
      if (!year) return { from: '', to: '', label: '' };
      const y = Number(year);
      const from = toYmd(y, 3, 1); // April 1
      const to = toYmd(y + 1, 2, 31); // March 31
      const label = fyLabel(y);
      return { from, to, label };
    }
    case 'years': {
      const { yearFrom, yearTo } = selections;
      if (!yearFrom || !yearTo) return { from: '', to: '', label: '' };
      const yf = Number(yearFrom), yt = Number(yearTo);
      const from = toYmd(yf, 3, 1); // April 1 of start FY
      const to = toYmd(yt + 1, 2, 31); // March 31 of end FY
      const label = `${fyLabel(yf)} to ${fyLabel(yt)}`;
      return { from, to, label };
    }
    case 'custom': {
      const { dateFrom, dateTo } = selections;
      if (!dateFrom || !dateTo) return { from: '', to: '', label: '' };
      const df = new Date(dateFrom + 'T00:00:00');
      const dt = new Date(dateTo + 'T00:00:00');
      const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      const label = `${fmtDate(df)} - ${fmtDate(dt)}`;
      return { from: dateFrom, to: dateTo, label };
    }
    default:
      return { from: '', to: '', label: '' };
  }
}

/**
 * RelevantPeriodSelector — allows selecting a relevant period for a service engagement.
 *
 * Props:
 *   frequency   {string}  — current frequency value
 *   periodFrom  {string}  — YYYY-MM-DD
 *   periodTo    {string}  — YYYY-MM-DD
 *   periodLabel {string}  — display label
 *   onChange    {fn}       — called with { frequency, from, to, label }
 *   style      {object}   — optional wrapper style
 */
export default function RelevantPeriodSelector({ frequency, periodFrom, periodTo, periodLabel, onChange, style }) {
  const [freq, setFreq] = useState(frequency || '');
  const [selections, setSelections] = useState(() => initSelectionsFromProps(frequency, periodFrom, periodTo));

  const years = useMemo(() => getYearOptions(), []);

  useEffect(() => {
    if (frequency !== freq) {
      setFreq(frequency || '');
      setSelections(initSelectionsFromProps(frequency, periodFrom, periodTo));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  function handleFrequencyChange(newFreq) {
    setFreq(newFreq);
    const defaultSel = getDefaultSelections(newFreq);
    setSelections(defaultSel);
    const period = computePeriod(newFreq, defaultSel);
    onChange({ frequency: newFreq, from: period.from, to: period.to, label: period.label });
  }

  function updateSelection(key, value) {
    const next = { ...selections, [key]: value };
    setSelections(next);
    const period = computePeriod(freq, next);
    onChange({ frequency: freq, from: period.from, to: period.to, label: period.label });
  }

  const period = computePeriod(freq, selections);

  return (
    <div style={style}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 150 }}>
          <div style={labelSt}>Period Type</div>
          <select value={freq} onChange={e => handleFrequencyChange(e.target.value)} style={selectSt}>
            {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {freq === 'month' && (
          <>
            <div>
              <div style={labelSt}>Month</div>
              <select value={selections.month ?? ''} onChange={e => updateSelection('month', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>Year</div>
              <select value={selections.year || ''} onChange={e => updateSelection('year', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </>
        )}

        {freq === 'months' && (
          <>
            <div>
              <div style={labelSt}>From Month</div>
              <select value={selections.monthFrom ?? ''} onChange={e => updateSelection('monthFrom', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>Year</div>
              <select value={selections.yearFrom || ''} onChange={e => updateSelection('yearFrom', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>To Month</div>
              <select value={selections.monthTo ?? ''} onChange={e => updateSelection('monthTo', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>Year</div>
              <select value={selections.yearTo || ''} onChange={e => updateSelection('yearTo', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </>
        )}

        {freq === 'quarter' && (
          <>
            <div>
              <div style={labelSt}>Quarter</div>
              <select value={selections.quarter || ''} onChange={e => updateSelection('quarter', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>FY Start Year</div>
              <select value={selections.year || ''} onChange={e => updateSelection('year', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
            </div>
          </>
        )}

        {freq === 'quarters' && (
          <>
            <div>
              <div style={labelSt}>From Quarter</div>
              <select value={selections.quarterFrom || ''} onChange={e => updateSelection('quarterFrom', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>FY</div>
              <select value={selections.yearFrom || ''} onChange={e => updateSelection('yearFrom', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>To Quarter</div>
              <select value={selections.quarterTo || ''} onChange={e => updateSelection('quarterTo', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>FY</div>
              <select value={selections.yearTo || ''} onChange={e => updateSelection('yearTo', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
            </div>
          </>
        )}

        {freq === 'year' && (
          <div>
            <div style={labelSt}>Financial Year</div>
            <select value={selections.year || ''} onChange={e => updateSelection('year', e.target.value)} style={selectSt}>
              <option value="">…</option>
              {years.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </select>
          </div>
        )}

        {freq === 'years' && (
          <>
            <div>
              <div style={labelSt}>From FY</div>
              <select value={selections.yearFrom || ''} onChange={e => updateSelection('yearFrom', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
            </div>
            <div>
              <div style={labelSt}>To FY</div>
              <select value={selections.yearTo || ''} onChange={e => updateSelection('yearTo', e.target.value)} style={selectSt}>
                <option value="">…</option>
                {years.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
            </div>
          </>
        )}

        {freq === 'custom' && (
          <>
            <div>
              <div style={labelSt}>From Date</div>
              <input type="date" value={selections.dateFrom || ''} onChange={e => updateSelection('dateFrom', e.target.value)} style={inputSt} />
            </div>
            <div>
              <div style={labelSt}>To Date</div>
              <input type="date" value={selections.dateTo || ''} onChange={e => updateSelection('dateTo', e.target.value)} style={inputSt} />
            </div>
          </>
        )}
      </div>

      {period.label && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', padding: '5px 10px', borderRadius: 6, display: 'inline-block' }}>
          {period.label}
        </div>
      )}
    </div>
  );
}

function initSelectionsFromProps(frequency, from, to) {
  if (!frequency || !from) return getDefaultSelections(frequency || '');
  const df = new Date(from + 'T00:00:00');
  const dt = to ? new Date(to + 'T00:00:00') : df;

  switch (frequency) {
    case 'month':
      return { month: String(df.getMonth()), year: String(df.getFullYear()) };
    case 'months':
      return { monthFrom: String(df.getMonth()), yearFrom: String(df.getFullYear()), monthTo: String(dt.getMonth()), yearTo: String(dt.getFullYear()) };
    case 'quarter': {
      const q = monthToQuarter(df.getMonth());
      const fy = df.getMonth() >= 3 ? df.getFullYear() : df.getFullYear() - 1;
      return { quarter: String(q), year: String(fy) };
    }
    case 'quarters': {
      const qf = monthToQuarter(df.getMonth());
      const qt = monthToQuarter(dt.getMonth());
      const fyf = df.getMonth() >= 3 ? df.getFullYear() : df.getFullYear() - 1;
      const fyt = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
      return { quarterFrom: String(qf), yearFrom: String(fyf), quarterTo: String(qt), yearTo: String(fyt) };
    }
    case 'year': {
      const fy = df.getMonth() >= 3 ? df.getFullYear() : df.getFullYear() - 1;
      return { year: String(fy) };
    }
    case 'years': {
      const fyf = df.getMonth() >= 3 ? df.getFullYear() : df.getFullYear() - 1;
      const fyt = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
      return { yearFrom: String(fyf), yearTo: String(fyt) };
    }
    case 'custom':
      return { dateFrom: from, dateTo: to };
    default:
      return {};
  }
}

function getDefaultSelections(freq) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (freq) {
    case 'month': return { month: String(m), year: String(y) };
    case 'months': return { monthFrom: String(m), yearFrom: String(y), monthTo: String(m), yearTo: String(y) };
    case 'quarter': { const q = monthToQuarter(m); const fy = m >= 3 ? y : y - 1; return { quarter: String(q), year: String(fy) }; }
    case 'quarters': { const q = monthToQuarter(m); const fy = m >= 3 ? y : y - 1; return { quarterFrom: String(q), yearFrom: String(fy), quarterTo: String(q), yearTo: String(fy) }; }
    case 'year': { const fy = m >= 3 ? y : y - 1; return { year: String(fy) }; }
    case 'years': { const fy = m >= 3 ? y : y - 1; return { yearFrom: String(fy), yearTo: String(fy) }; }
    case 'custom': return { dateFrom: '', dateTo: '' };
    default: return {};
  }
}

function monthToQuarter(m) {
  if (m >= 3 && m <= 5) return 1;
  if (m >= 6 && m <= 8) return 2;
  if (m >= 9 && m <= 11) return 3;
  return 4;
}

const labelSt = { fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 };
const selectSt = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#334155', background: '#fff', cursor: 'pointer' };
const inputSt = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#334155', background: '#fff' };
