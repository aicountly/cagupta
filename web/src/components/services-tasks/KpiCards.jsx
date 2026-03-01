import { CalendarCheck, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

const KPI_CONFIG = [
  {
    key: 'dueThisWeek',
    label: 'Due this week',
    tasks: '5 tasks',
    trend: '+2',
    delta: '+2',
    icon: CalendarCheck,
    iconBg: '#EDFBE8',
    iconColor: '#22C55E',
    trendColor: '#22C55E',
  },
  {
    key: 'overdue',
    label: 'Overdue',
    tasks: '2 tasks',
    trend: '-2',
    delta: '-1',
    icon: AlertCircle,
    iconBg: '#FEE2E2',
    iconColor: '#EF4444',
    trendColor: '#EF4444',
  },
  {
    key: 'pendingInfo',
    label: 'Pending Info',
    tasks: '1 task',
    trend: '+1',
    delta: '+1',
    icon: Info,
    iconBg: '#FEF3E8',
    iconColor: '#F37920',
    trendColor: '#22C55E',
  },
  {
    key: 'completed',
    label: 'Completed',
    tasks: '8 tasks',
    trend: '+8',
    delta: '+1',
    icon: CheckCircle2,
    iconBg: '#EDFBE8',
    iconColor: '#22C55E',
    trendColor: '#22C55E',
  },
];

function KpiCard({ config }) {
  const Icon = config.icon;
  const isDown = config.trend.startsWith('-');

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
        <div style={{ ...iconBox, background: config.iconBg }}>
          <Icon size={18} color={config.iconColor} strokeWidth={2.2} />
        </div>
        <div>
          <div style={labelStyle}>{config.label}</div>
          <div style={subLabel}>{config.tasks}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 11, color: config.trendColor }}>
            {isDown ? '▼' : '▲'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: config.trendColor }}>
            {Math.abs(parseInt(config.trend))}
          </span>
        </div>
        <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>{config.delta}</span>
      </div>
    </div>
  );
}

export default function KpiCards() {
  return (
    <div style={row}>
      {KPI_CONFIG.map(cfg => <KpiCard key={cfg.key} config={cfg} />)}
    </div>
  );
}

const row = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 16,
};

const card = {
  background: '#fff',
  borderRadius: 14,
  padding: '18px 20px',
  border: '1px solid #E5E7EB',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const iconBox = {
  width: 44,
  height: 44,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const labelStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#111827',
  lineHeight: 1.3,
};

const subLabel = {
  fontSize: 12,
  color: '#6B7280',
  marginTop: 2,
};
