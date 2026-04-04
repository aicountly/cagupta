import { useState } from 'react';
import StatusBadge from '../components/common/StatusBadge';
import { getRegisterTypes } from '../constants/registerTypes';
import { REGISTER_CONFIG, DEFAULT_REGISTER_CONFIG } from '../constants/registerConfig';
import RegisterSubFilters from '../components/common/RegisterSubFilters';

const gstRegister = [
  { client:'Sunita Enterprises Pvt Ltd', gstin:'27AACCS5678D1Z3', returnType:'GSTR-3B', period:'Mar 2025', dueDate:'2025-04-20', filedDate:'2025-04-18', status:'filed', lateFee:0 },
  { client:'Sunita Enterprises Pvt Ltd', gstin:'27AACCS5678D1Z3', returnType:'GSTR-1', period:'Mar 2025', dueDate:'2025-04-11', filedDate:'2025-04-10', status:'filed', lateFee:0 },
  { client:'Techno Traders', gstin:'27AAFT7890G1Z1', returnType:'GSTR-3B', period:'Mar 2025', dueDate:'2025-04-20', filedDate:null, status:'pending', lateFee:0 },
  { client:'Techno Traders', gstin:'27AAFT7890G1Z1', returnType:'GSTR-1', period:'Mar 2025', dueDate:'2025-04-11', filedDate:null, status:'late', lateFee:1000 },
];

const tdsRegister = [
  { client:'Sunita Enterprises Pvt Ltd', tan:'MUMA12345B', returnType:'26Q', quarter:'Q4', fy:'2024-25', dueDate:'2025-05-31', filedDate:'2025-05-28', status:'filed' },
  { client:'Techno Traders', tan:'MUMR56789C', returnType:'26Q', quarter:'Q4', fy:'2024-25', dueDate:'2025-05-31', filedDate:null, status:'pending' },
];

const rocRegister = [
  { client:'Sunita Enterprises Pvt Ltd', cin:'U74999MH2015PTC123456', filingType:'AOC-4', fy:'2023-24', dueDate:'2024-10-29', filedDate:'2024-10-25', status:'filed', feePaid:300 },
  { client:'Sunita Enterprises Pvt Ltd', cin:'U74999MH2015PTC123456', filingType:'MGT-7', fy:'2023-24', dueDate:'2024-11-29', filedDate:null, status:'pending', feePaid:null },
];

const itRegister = [
  { client:'Sunita Enterprises Pvt Ltd', pan:'AACCS5678D', returnType:'ITR-6', ay:'2024-25', dueDate:'2024-10-31', filedDate:'2024-10-28', status:'filed', refund:null },
  { client:'Techno Traders', pan:'AAFT7890G', returnType:'ITR-3', ay:'2024-25', dueDate:'2024-10-31', filedDate:null, status:'pending', refund:null },
];

const pfRegister = [
  { client:'Sunita Enterprises Pvt Ltd', pfNo:'MH/MUM/12345', returnType:'PF', period:'Mar 2025', dueDate:'2025-04-15', filedDate:'2025-04-12', status:'filed' },
  { client:'Techno Traders', pfNo:'MH/MUM/67890', returnType:'ESI', period:'Mar 2025', dueDate:'2025-04-21', filedDate:null, status:'pending' },
];

const registerData = {
  gst: gstRegister,
  tds: tdsRegister,
  roc: rocRegister,
  it:  itRegister,
  pf:  pfRegister,
};

function applyFilters(data, tabFilters) {
  return data.filter(row =>
    Object.entries(tabFilters).every(([key, val]) =>
      val === '__all__' || !val || String(row[key]) === String(val)
    )
  );
}

function RegisterTable({ tabKey, data }) {
  const config = REGISTER_CONFIG[tabKey] || DEFAULT_REGISTER_CONFIG;
  if (!data || data.length === 0) {
    return (
      <div style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
        No records found for this register.
      </div>
    );
  }

  if (tabKey === 'gst') {
    return (
      <table style={tableStyle}>
        <thead>
          <tr>{config.columns.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((r,i)=>(
            <tr key={i} style={trStyle}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
              <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:11 }}>{r.gstin}</td>
              <td style={tdStyle}>{r.returnType}</td>
              <td style={tdStyle}>{r.period}</td>
              <td style={tdStyle}>{r.dueDate}</td>
              <td style={tdStyle}>{r.filedDate || '—'}</td>
              <td style={tdStyle}><StatusBadge status={r.status} /></td>
              <td style={{ ...tdStyle, color: r.lateFee?'#dc2626':'#16a34a', fontWeight:600 }}>{r.lateFee ? `₹${r.lateFee}` : 'Nil'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tabKey === 'tds') {
    return (
      <table style={tableStyle}>
        <thead>
          <tr>{config.columns.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((r,i)=>(
            <tr key={i} style={trStyle}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
              <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.tan}</td>
              <td style={tdStyle}>{r.returnType}</td>
              <td style={tdStyle}>{r.quarter}</td>
              <td style={tdStyle}>{r.fy}</td>
              <td style={tdStyle}>{r.dueDate}</td>
              <td style={tdStyle}>{r.filedDate || '—'}</td>
              <td style={tdStyle}><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tabKey === 'roc') {
    return (
      <table style={tableStyle}>
        <thead>
          <tr>{config.columns.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((r,i)=>(
            <tr key={i} style={trStyle}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
              <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:11 }}>{r.cin}</td>
              <td style={tdStyle}>{r.filingType}</td>
              <td style={tdStyle}>{r.fy}</td>
              <td style={tdStyle}>{r.dueDate}</td>
              <td style={tdStyle}>{r.filedDate || '—'}</td>
              <td style={tdStyle}><StatusBadge status={r.status} /></td>
              <td style={tdStyle}>{r.feePaid ? `₹${r.feePaid}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tabKey === 'it') {
    return (
      <table style={tableStyle}>
        <thead>
          <tr>{config.columns.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((r,i)=>(
            <tr key={i} style={trStyle}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
              <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.pan}</td>
              <td style={tdStyle}>{r.returnType}</td>
              <td style={tdStyle}>{r.ay}</td>
              <td style={tdStyle}>{r.dueDate}</td>
              <td style={tdStyle}>{r.filedDate || '—'}</td>
              <td style={tdStyle}><StatusBadge status={r.status} /></td>
              <td style={tdStyle}>{r.refund ? `₹${r.refund}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tabKey === 'pf') {
    return (
      <table style={tableStyle}>
        <thead>
          <tr>{config.columns.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((r,i)=>(
            <tr key={i} style={trStyle}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
              <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.pfNo}</td>
              <td style={tdStyle}>{r.returnType}</td>
              <td style={tdStyle}>{r.period}</td>
              <td style={tdStyle}>{r.dueDate}</td>
              <td style={tdStyle}>{r.filedDate || '—'}</td>
              <td style={tdStyle}><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Generic fallback table for custom register types — uses row keys directly
  return (
    <table style={tableStyle}>
      <thead>
        <tr>{config.columns.map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((r,i)=>(
          <tr key={i} style={trStyle}>
            {Object.values(r).map((val, ci) => (
              <td key={ci} style={tdStyle}>{val ?? '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Registers() {
  const [registerTypes] = useState(() => getRegisterTypes());
  const [tab, setTab] = useState(() => getRegisterTypes()[0]?.key || 'gst');
  const [filters, setFilters] = useState({});

  function getFilterState(tabKey) {
    return filters[tabKey] || {};
  }

  function handleFilterChange(tabKey, filterKey, value) {
    setFilters(prev => ({
      ...prev,
      [tabKey]: { ...(prev[tabKey] || {}), [filterKey]: value }
    }));
  }

  const config = REGISTER_CONFIG[tab] || DEFAULT_REGISTER_CONFIG;
  const rawData = registerData[tab] || [];
  const filteredData = applyFilters(rawData, getFilterState(tab));

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #e2e8f0' }}>
        {registerTypes.map(rt => (
          <button key={rt.key} onClick={() => setTab(rt.key)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===rt.key?'#2563eb':'#64748b', borderBottom:tab===rt.key?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {rt.icon} {rt.label}
          </button>
        ))}
      </div>

      <RegisterSubFilters
        subFilters={config.subFilters}
        filters={getFilterState(tab)}
        onChange={(key, value) => handleFilterChange(tab, key, value)}
        data={rawData}
      />

      <div style={cardStyle}>
        <RegisterTable tabKey={tab} data={filteredData} />
      </div>
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const trStyle = { borderBottom:'1px solid #f8fafc' };
