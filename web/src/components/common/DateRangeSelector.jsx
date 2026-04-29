import { DATE_PRESETS, getPresetDates } from '../../utils/datePresets';

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 13,
  background: '#fff',
};

const disabledInputStyle = {
  ...inputStyle,
  background: '#f8fafc',
  color: '#94a3b8',
  cursor: 'not-allowed',
};

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
};

/**
 * DateRangeSelector — renders a Time Period preset dropdown plus From / To date
 * inputs. The date inputs are disabled for any preset other than "custom".
 *
 * Props:
 *   preset          {string}   — current preset value
 *   onPresetChange  {fn}       — called with new preset string
 *   dateFrom        {string}   — YYYY-MM-DD
 *   onDateFromChange{fn}       — called with new from string
 *   dateTo          {string}   — YYYY-MM-DD
 *   onDateToChange  {fn}       — called with new to string
 */
export default function DateRangeSelector({
  preset,
  onPresetChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}) {
  const isCustom = preset === 'custom';

  function handlePresetChange(e) {
    const value = e.target.value;
    onPresetChange(value);
    if (value !== 'custom') {
      const dates = getPresetDates(value);
      if (dates) {
        onDateFromChange(dates.from);
        onDateToChange(dates.to);
      }
    }
  }

  return (
    <>
      <label style={labelStyle}>
        Time Period
        <select
          value={preset}
          onChange={handlePresetChange}
          style={{ ...inputStyle, minWidth: 160 }}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        From
        <input
          type="date"
          value={dateFrom}
          disabled={!isCustom}
          onChange={(e) => onDateFromChange(e.target.value)}
          style={isCustom ? inputStyle : disabledInputStyle}
          title={isCustom ? undefined : 'Select "Custom" to set a specific date'}
        />
      </label>

      <label style={labelStyle}>
        To
        <input
          type="date"
          value={dateTo}
          disabled={!isCustom}
          onChange={(e) => onDateToChange(e.target.value)}
          style={isCustom ? inputStyle : disabledInputStyle}
          title={isCustom ? undefined : 'Select "Custom" to set a specific date'}
        />
      </label>
    </>
  );
}
