import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from '../services/appointmentService';
import { getAppointmentFeeRules } from '../services/appointmentFeeRuleService';
import { getContacts } from '../services/contactService';
import { getOrganizations } from '../services/organizationService';
import { getBillingProfiles, getBillingProfileByCode } from '../constants/billingProfiles';
import {
  loadRazorpayScript,
  createRazorpayOrderForAppointment,
  openRazorpayCheckout,
} from '../services/razorpayService';
import StatusBadge from '../components/common/StatusBadge';
import DateInput from '../components/common/DateInput';
import { useNotification } from '../context/NotificationContext';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function defaultForm() {
  const profiles = getBillingProfiles();
  return {
    clientName: '',
    staffName: '',
    date: '',
    startTime: '',
    endTime: '',
    mode: 'in_person',
    subject: '',
    useBilling: false,
    feeRuleId: '',
    entityType: 'client',
    clientId: '',
    organizationId: '',
    billingProfileCode: profiles[0]?.code || '',
    paymentTerms: 'pay_later',
    advanceAmount: '',
    advancePercent: '',
    billableHours: '',
  };
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const t0 = new Date(`1970-01-01T${start.length === 5 ? `${start}:00` : start}`);
  const t1 = new Date(`1970-01-01T${end.length === 5 ? `${end}:00` : end}`);
  const ms = t1 - t0;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3600000) * 10000) / 10000;
}

export default function Calendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('appointments');
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(3);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feeRules, setFeeRules] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  const reload = () => {
    setLoading(true);
    getAppointments()
      .then((data) => setAppointments(data))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const [showBookModal, setShowBookModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!showBookModal) return;
    getAppointmentFeeRules({ includeInactive: false }).then(setFeeRules).catch(() => setFeeRules([]));
    getContacts({ perPage: 200 }).then(setContacts).catch(() => setContacts([]));
    getOrganizations({ perPage: 200 }).then(setOrganizations).catch(() => setOrganizations([]));
  }, [showBookModal]);

  const selectedRule = useMemo(
    () => feeRules.find((r) => String(r.id) === String(form.feeRuleId)),
    [feeRules, form.feeRuleId],
  );

  const billingProfile = useMemo(
    () => getBillingProfileByCode(form.billingProfileCode) || getBillingProfiles()[0],
    [form.billingProfileCode],
  );

  const feeSubtotalEstimate = useMemo(() => {
    if (!selectedRule) return 0;
    const unit = Number(selectedRule.amount) || 0;
    if (selectedRule.pricing_model === 'fixed_meeting') return unit;
    const h = form.billableHours !== '' ? Number(form.billableHours) : hoursBetween(form.startTime, form.endTime);
    if (!Number.isFinite(h) || h <= 0) return 0;
    return Math.round(unit * h * 100) / 100;
  }, [selectedRule, form.billableHours, form.startTime, form.endTime]);

  const invoiceTotalEstimate = useMemo(() => {
    if (feeSubtotalEstimate <= 0) return 0;
    const p = billingProfile;
    if (p?.gstRegistered) {
      const r = Number(p.defaultGstRate) || 18;
      return Math.round(feeSubtotalEstimate * (1 + r / 100) * 100) / 100;
    }
    return feeSubtotalEstimate;
  }, [feeSubtotalEstimate, billingProfile]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (cells.length % 7) cells.push(null);

  const apptByDate = {};
  appointments.forEach((a) => {
    const parts = (a.date || '').split('-');
    const d = parseInt(parts[2], 10);
    if (!Number.isFinite(d)) return;
    if (!apptByDate[d]) apptByDate[d] = [];
    apptByDate[d].push(a);
  });

  const filingDeadlines = [
    { day: 11, label: 'GSTR-1 (Apr)', color: '#dcfce7', textColor: '#166534' },
    { day: 20, label: 'GSTR-3B (Apr)', color: '#dbeafe', textColor: '#1d4ed8' },
    { day: 30, label: 'TDS Q4 Due', color: '#fef3c7', textColor: '#92400e' },
  ];
  const deadlinesByDay = {};
  filingDeadlines.forEach((d) => {
    if (!deadlinesByDay[d.day]) deadlinesByDay[d.day] = [];
    deadlinesByDay[d.day].push(d);
  });

  function openAddModal() {
    setForm(defaultForm());
    setEditId(null);
    setShowBookModal(true);
  }

  useEffect(() => {
    const raw = searchParams.get('openAppointment');
    if (raw == null || !appointments.length) return;
    const a = appointments.find((x) => String(x.id) === String(raw));
    if (a) {
      setTab('appointments');
      (async () => {
        setEditId(a.id);
        setShowBookModal(true);
        try {
          const full = await getAppointment(a.id);
          setForm({
            clientName: full.clientName || '',
            staffName: full.staffName || '',
            date: full.date || '',
            startTime: full.startTime || '',
            endTime: full.endTime || '',
            mode: full.mode || 'in_person',
            subject: full.subject || '',
            useBilling: Boolean(full.feeRuleId),
            feeRuleId: full.feeRuleId != null ? String(full.feeRuleId) : '',
            entityType: full.billingOrganizationId ? 'organization' : 'client',
            clientId: full.clientId != null ? String(full.clientId) : '',
            organizationId: full.billingOrganizationId != null ? String(full.billingOrganizationId) : '',
            billingProfileCode: full.billingProfileCode || getBillingProfiles()[0]?.code || '',
            paymentTerms: full.paymentTerms || 'pay_later',
            advanceAmount: full.advanceAmount != null ? String(full.advanceAmount) : '',
            advancePercent: full.advancePercent != null ? String(full.advancePercent) : '',
            billableHours: full.billableHours != null ? String(full.billableHours) : '',
          });
        } catch {
          setForm({
            ...defaultForm(),
            clientName: a.clientName,
            staffName: a.staffName,
            date: a.date,
            startTime: a.startTime,
            endTime: a.endTime,
            mode: a.mode,
            subject: a.subject,
          });
        }
      })();
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openAppointment');
    setSearchParams(next, { replace: true });
  }, [searchParams, appointments, setSearchParams]);

  async function openEditModal(a) {
    setEditId(a.id);
    setShowBookModal(true);
    try {
      const full = await getAppointment(a.id);
      setForm({
        clientName: full.clientName || '',
        staffName: full.staffName || '',
        date: full.date || '',
        startTime: full.startTime || '',
        endTime: full.endTime || '',
        mode: full.mode || 'in_person',
        subject: full.subject || '',
        useBilling: Boolean(full.feeRuleId),
        feeRuleId: full.feeRuleId != null ? String(full.feeRuleId) : '',
        entityType: full.billingOrganizationId ? 'organization' : 'client',
        clientId: full.clientId != null ? String(full.clientId) : '',
        organizationId: full.billingOrganizationId != null ? String(full.billingOrganizationId) : '',
        billingProfileCode: full.billingProfileCode || getBillingProfiles()[0]?.code || '',
        paymentTerms: full.paymentTerms || 'pay_later',
        advanceAmount: full.advanceAmount != null ? String(full.advanceAmount) : '',
        advancePercent: full.advancePercent != null ? String(full.advancePercent) : '',
        billableHours: full.billableHours != null ? String(full.billableHours) : '',
      });
    } catch {
      setForm({
        ...defaultForm(),
        clientName: a.clientName,
        staffName: a.staffName,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        mode: a.mode,
        subject: a.subject,
      });
    }
  }

  function setAdvanceFromPercent(pct) {
    if (!Number.isFinite(pct) || pct <= 0) {
      setForm((v) => ({ ...v, advancePercent: '', advanceAmount: '' }));
      return;
    }
    const amt = Math.round(invoiceTotalEstimate * (pct / 100) * 100) / 100;
    setForm((v) => ({ ...v, advancePercent: String(pct), advanceAmount: String(amt) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (form.useBilling && !editId) {
      if (!form.feeRuleId) {
        window.alert('Select a fee rule.');
        return;
      }
      if (form.entityType === 'client' && !form.clientId) {
        window.alert('Select a contact to bill.');
        return;
      }
      if (form.entityType === 'organization' && !form.organizationId) {
        window.alert('Select an organization to bill.');
        return;
      }
    }
    const snap = billingProfile
      ? {
          gstRegistered: Boolean(billingProfile.gstRegistered),
          gstin: billingProfile.gstin || '',
          stateCode: billingProfile.stateCode || '',
          defaultGstRate: billingProfile.defaultGstRate ?? 18,
        }
      : { gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18 };

    const payload = {
      ...form,
      status: 'scheduled',
      clientId: form.entityType === 'client' && form.clientId ? form.clientId : '',
      billingOrganizationId: form.entityType === 'organization' && form.organizationId ? form.organizationId : '',
      billingProfileSnapshot: form.useBilling ? snap : null,
      feeRuleId: form.useBilling ? form.feeRuleId : '',
      paymentTerms: form.useBilling ? form.paymentTerms : 'pay_later',
      billingProfileCode: form.useBilling ? form.billingProfileCode : '',
      advanceAmount: form.useBilling ? form.advanceAmount : '',
      advancePercent: form.useBilling ? form.advancePercent : '',
      billableHours: form.useBilling ? form.billableHours : '',
    };

    if (editId) {
      updateAppointment(editId, payload)
        .then((updated) => {
          setAppointments((prev) => prev.map((x) => (x.id === editId ? updated : x)));
          addNotification('Appointment updated', 'appointment');
        })
        .catch((err) => addNotification(err.message || 'Update failed', 'info'));
    } else {
      createAppointment(payload)
        .then((newAppt) => {
          setAppointments((prev) => [...prev, newAppt]);
          addNotification('Appointment booked: ' + form.subject, 'appointment');
        })
        .catch((err) => addNotification(err.message || 'Booking failed', 'info'));
    }
    setShowBookModal(false);
  }

  async function payWithRazorpay(a) {
    try {
      await loadRazorpayScript();
      const order = await createRazorpayOrderForAppointment(a.id);
      openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        name: 'Appointment payment',
        description: `Appointment #${a.id}`,
        onSuccess: () => {
          addNotification('Payment submitted. Refreshing…', 'appointment');
          reload();
        },
        onFailure: (err) => addNotification(err.message || 'Payment failed', 'info'),
      });
    } catch (err) {
      addNotification(err.message || 'Could not start Razorpay', 'info');
    }
  }

  function handleCancel(id) {
    if (window.confirm('Cancel this appointment?')) {
      deleteAppointment(id)
        .then(() => setAppointments((prev) => prev.filter((x) => x.id !== id)))
        .catch(() => {});
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        {['calendar', 'appointments'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: tab === t ? '#2563eb' : '#64748b',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'calendar' ? '📅 Calendar View' : '📋 Appointments List'}
          </button>
        ))}
        <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={openAddModal}>
          ➕ Book Appointment
        </button>
      </div>

      {tab === 'calendar' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                if (month === 0) {
                  setMonth(11);
                  setYear((y) => y - 1);
                } else setMonth((m) => m - 1);
              }}
              style={navBtn}
            >
              ‹
            </button>
            <span style={{ fontSize: 18, fontWeight: 700, minWidth: 160, textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => {
                if (month === 11) {
                  setMonth(0);
                  setYear((y) => y + 1);
                } else setMonth((m) => m + 1);
              }}
              style={navBtn}
            >
              ›
            </button>
          </div>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {DAYS.map((d) => (
                <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {cells.map((day, i) => (
                <div key={i} style={{ minHeight: 90, border: '1px solid #f1f5f9', padding: '6px', background: '#fff' }}>
                  {day && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 400, color: '#334155', marginBottom: 4 }}>{day}</div>
                      {(deadlinesByDay[day] || []).map((dl, di) => (
                        <div
                          key={di}
                          style={{
                            background: dl.color,
                            color: dl.textColor,
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 4,
                            marginBottom: 2,
                            fontWeight: 600,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {dl.label}
                        </div>
                      ))}
                      {(apptByDate[day] || []).map((ap, ai) => (
                        <div
                          key={ai}
                          style={{
                            background: '#ede9fe',
                            color: '#5b21b6',
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 4,
                            marginBottom: 2,
                            fontWeight: 600,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ap.startTime} {String(ap.clientName || '').split(' ')[0]}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
            {[
              ['#dcfce7', '#166534', 'GST/Filing Deadline'],
              ['#fef3c7', '#92400e', 'TDS Deadline'],
              ['#ede9fe', '#5b21b6', 'Appointment'],
            ].map(([bg, c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: bg, border: `1px solid ${c}` }} />
                <span style={{ color: '#64748b' }}>{l}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {tab === 'appointments' && (
        <div style={cardStyle}>
          {loading ? (
            <div style={{ padding: 24, color: '#94a3b8' }}>Loading…</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Client', 'Staff', 'Date & Time', 'Mode', 'Subject', 'Billing', 'Actions'].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{a.clientName}</td>
                    <td style={tdStyle}>{a.staffName}</td>
                    <td style={tdStyle}>
                      {a.date} {a.startTime}–{a.endTime}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                        {String(a.mode || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td style={tdStyle}>{a.subject}</td>
                    <td style={tdStyle}>
                      <StatusBadge status={a.appointmentStatus || a.status} />
                      {a.zoomJoinUrl && (
                        <div style={{ marginTop: 4 }}>
                          <a href={a.zoomJoinUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#2563eb' }}>
                            Zoom link
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button type="button" style={iconBtn} onClick={() => openEditModal(a)}>
                        ✏️
                      </button>
                      {a.appointmentStatus === 'pending_payment' && a.invoiceTxnId && (
                        <button type="button" style={iconBtn} onClick={() => payWithRazorpay(a)}>
                          💳 Pay
                        </button>
                      )}
                      <button type="button" style={iconBtn} onClick={() => handleCancel(a.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showBookModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, width: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editId ? 'Edit Appointment' : 'Book Appointment'}</h3>
              <button type="button" onClick={() => setShowBookModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              {[
                { label: 'Client Name', key: 'clientName', type: 'text', required: true },
                { label: 'Staff Name', key: 'staffName', type: 'text', required: true },
                { label: 'Date', key: 'date', type: 'date', required: true },
                { label: 'Start Time', key: 'startTime', type: 'time', required: true },
                { label: 'End Time', key: 'endTime', type: 'time', required: true },
                { label: 'Subject', key: 'subject', type: 'text', required: true },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>
                    {f.label}
                    {f.required && <span style={{ color: '#ef4444' }}> *</span>}
                  </label>
                  {f.type === 'date' ? (
                    <DateInput required={f.required} value={form[f.key]} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} style={inputStyle} />
                  ) : (
                    <input type={f.type} required={f.required} value={form[f.key]} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} style={inputStyle} />
                  )}
                </div>
              ))}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Mode</label>
                <select value={form.mode} onChange={(e) => setForm((v) => ({ ...v, mode: e.target.value }))} style={inputStyle}>
                  <option value="in_person">In Person</option>
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                </select>
              </div>

              {!editId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
                  <input type="checkbox" checked={form.useBilling} onChange={(e) => setForm((v) => ({ ...v, useBilling: e.target.checked }))} />
                  Bill with fee rule (invoice + optional Razorpay advance)
                </label>
              )}

              {form.useBilling && !editId && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f8fafc' }}>
                  <label style={labelStyle}>Fee rule</label>
                  <select value={form.feeRuleId} onChange={(e) => setForm((v) => ({ ...v, feeRuleId: e.target.value }))} style={inputStyle} required={form.useBilling}>
                    <option value="">Select…</option>
                    {feeRules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.pricing_model === 'per_hour' ? 'per hr' : 'fixed'})
                      </option>
                    ))}
                  </select>

                  <label style={{ ...labelStyle, marginTop: 10 }}>Bill to</label>
                  <select value={form.entityType} onChange={(e) => setForm((v) => ({ ...v, entityType: e.target.value }))} style={inputStyle}>
                    <option value="client">Contact</option>
                    <option value="organization">Organization</option>
                  </select>

                  {form.entityType === 'client' ? (
                    <>
                      <label style={{ ...labelStyle, marginTop: 10 }}>Contact</label>
                      <select value={form.clientId} onChange={(e) => setForm((v) => ({ ...v, clientId: e.target.value }))} style={inputStyle} required={form.useBilling}>
                        <option value="">Select…</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName || `Contact #${c.id}`}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label style={{ ...labelStyle, marginTop: 10 }}>Organization</label>
                      <select value={form.organizationId} onChange={(e) => setForm((v) => ({ ...v, organizationId: e.target.value }))} style={inputStyle} required={form.useBilling}>
                        <option value="">Select…</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.displayName || `Org #${o.id}`}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label style={{ ...labelStyle, marginTop: 10 }}>Billing profile</label>
                  <select value={form.billingProfileCode} onChange={(e) => setForm((v) => ({ ...v, billingProfileCode: e.target.value }))} style={inputStyle}>
                    {getBillingProfiles().map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>

                  {selectedRule?.pricing_model === 'per_hour' && (
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>Billable hours (optional if times set)</label>
                      <input type="number" min="0.25" step="0.01" value={form.billableHours} onChange={(e) => setForm((v) => ({ ...v, billableHours: e.target.value }))} style={inputStyle} placeholder="Auto from start/end" />
                    </div>
                  )}

                  <label style={{ ...labelStyle, marginTop: 10 }}>Payment terms</label>
                  <select value={form.paymentTerms} onChange={(e) => setForm((v) => ({ ...v, paymentTerms: e.target.value }))} style={inputStyle}>
                    <option value="pay_later">Pay later (confirm now)</option>
                    <option value="full_advance">100% advance (Razorpay)</option>
                    <option value="partial_advance">Partial advance (Razorpay)</option>
                  </select>

                  {(form.paymentTerms === 'partial_advance' || form.paymentTerms === 'full_advance') && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                      <div>
                        <label style={labelStyle}>Advance ₹</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.advanceAmount}
                          onChange={(e) => setForm((v) => ({ ...v, advanceAmount: e.target.value, advancePercent: '' }))}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Advance %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={form.advancePercent}
                          onChange={(e) => setAdvanceFromPercent(Number(e.target.value))}
                          style={inputStyle}
                          placeholder="% of est. total"
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
                    Est. fee (pre-GST): ₹{feeSubtotalEstimate.toLocaleString('en-IN')}
                    {' · '}
                    Est. invoice total: ₹{invoiceTotalEstimate.toLocaleString('en-IN')}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowBookModal(false)} style={btnOutline}>
                  Cancel
                </button>
                <button type="submit" style={btnPrimary}>
                  {editId ? 'Save Changes' : 'Book Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #f1f5f9', background: '#f8fafc', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 12px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const trStyle = { borderBottom: '1px solid #f8fafc' };
const btnPrimary = { padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnOutline = { padding: '8px 16px', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const navBtn = { padding: '4px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 18 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 4px' };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalBox = { background: '#fff', borderRadius: 12, padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' };
const labelStyle = { display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
