import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus, CheckSquare, Square, Trash2, FolderOpen, History, Pencil, ChevronDown } from 'lucide-react';
import ServiceLogPanel from '../../../components/services/ServiceLogPanel';
import DateInput from '../../../components/common/DateInput';
import RelevantPeriodSelector from '../../../components/common/RelevantPeriodSelector';
import { localDateKey, engagementDueDateKey } from '../../../utils/serviceKpiFilters';
import { useStaffUsers } from '../../../hooks/useStaffUsers';
import { useAuth } from '../../../auth/AuthContext';
import {
  getEngagement,
  updateEngagement,
  reopenEngagement,
  createTask,
  deleteEngagement,
  requestServiceClientFacingOtp,
  requestServiceDeleteOtp,
  getServiceAuditLog,
  ApiError,
  toggleMasterService,
  getLinkedServices,
  linkService,
  unlinkService,
  getLinkableServices,
  getAllEngagements,
} from '../../../services/engagementService';
import OpenEngagementConflictModal from '../../../components/services/OpenEngagementConflictModal';
import AddTaskModal from '../../../components/services/AddTaskModal';
import { getApprovedAffiliates } from '../../../services/affiliateAdminService';
import { getTimeEntries, createTimeEntry, TIME_ACTIVITY_TYPES } from '../services/timeEntryService';
import { useServiceTimer } from '../../../hooks/useServiceTimer';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import TimerHandoffModal from '../../../components/services/TimerHandoffModal';
import TimeEntryModifyModal from '../../../components/services/TimeEntryModifyModal';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'];

const COMMISSION_MODE_LABELS = {
  referral_only: 'Referral only (tiered %)',
  direct_interaction: 'Direct interaction (50/50 split)',
};

function AuditMetaDetails({ row }) {
  let meta = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  if (!meta || typeof meta !== 'object') meta = {};
  const keys = Object.keys(meta).filter((k) => meta[k] != null && meta[k] !== '');
  if (keys.length === 0) {
    return <div style={{ fontSize: 12, color: '#94a3b8' }}>No extra detail.</div>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#64748b' }}>
      {keys.slice(0, 6).map((k) => (
        <li key={k} style={{ marginBottom: 4 }}>
          <strong style={{ color: '#475569' }}>{k}:</strong>{' '}
          {typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}
        </li>
      ))}
    </ul>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'time', label: 'Time' },
  { id: 'activity', label: 'Activity' },
];

export default function ServiceEngagementManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, session } = useAuth();
  const canDeleteService    = hasPermission('services.delete');
  const canEditService      = hasPermission('services.edit');
  const canLogTimePermission = hasPermission('services.edit');
  const canManageTeamRates  = hasPermission('users.manage');
  const canManageAssignees  = hasPermission('services.assignees.manage');
  const isSuperAdmin = String(session?.user?.email || '').toLowerCase() === 'rahul@cagupta.in';
  const { staffUsers } = useStaffUsers();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [openEngagementConflict, setOpenEngagementConflict] = useState(null);

  const [serviceType, setServiceType] = useState('');
  const [fy, setFy] = useState('');
  const [relevantPeriod, setRelevantPeriod] = useState({ frequency: '', from: '', to: '', label: '' });
  const [status, setStatus] = useState('not_started');
  const [clientName, setClientName] = useState('');
  const [assigneeUserIds, setAssigneeUserIds] = useState([]);
  const [inchargeUserId, setInchargeUserId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [initialDueDate, setInitialDueDate] = useState('');
  const [fee, setFee] = useState('');
  const [stdFeeOverride, setStdFeeOverride] = useState('');
  const [stdHoursOverride, setStdHoursOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [tasks, setTasks] = useState([]);
  const [billingClosure, setBillingClosure] = useState(null);
  // Master Service state
  const [isMasterService, setIsMasterService] = useState(false);
  const [masterServiceId, setMasterServiceId] = useState(null);
  const [masterServiceName, setMasterServiceName] = useState('');
  const [linkedServices, setLinkedServices] = useState([]);
  const [linkedServicesSummary, setLinkedServicesSummary] = useState(null);
  const [linkedServicesLoading, setLinkedServicesLoading] = useState(false);
  const [linkableServices, setLinkableServices] = useState([]);
  const [linkTarget, setLinkTarget] = useState('');
  const [masterToggleSaving, setMasterToggleSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [masterError, setMasterError] = useState('');
  const [masterClientId, setMasterClientId] = useState(null);
  const [engClientType, setEngClientType] = useState('contact');
  const [masterOrgId, setMasterOrgId] = useState(null);
  const [masterServicesList, setMasterServicesList] = useState([]);
  const [linkToMasterTarget, setLinkToMasterTarget] = useState('');
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [timeSaving, setTimeSaving] = useState(false);
  const [modifyEntry, setModifyEntry] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const [timeForm, setTimeForm] = useState(() => ({
    workDate: new Date().toISOString().slice(0, 10),
    durationMinutes: '60',
    activityType: 'client_work',
    isBillable: true,
    taskId: '',
    notes: '',
    userId: '',
  }));
  const [showAddTask, setShowAddTask] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [pendingStartService, setPendingStartService] = useState(null);
  const [stoppedEntryDraft, setStoppedEntryDraft] = useState(null);
  const [showAddMemberSelect, setShowAddMemberSelect] = useState(false);
  const [replacingMemberId, setReplacingMemberId] = useState(null);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenStatus, setReopenStatus] = useState('in_progress');
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serviceDeleteStep, setServiceDeleteStep] = useState('warn');
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [deleteModalErr, setDeleteModalErr] = useState('');
  const [requestingDeleteOtp, setRequestingDeleteOtp] = useState(false);
  const [persistedTaskIds, setPersistedTaskIds] = useState([]);

  const [referringAffiliateUserId, setReferringAffiliateUserId] = useState('');
  const [commissionMode, setCommissionMode] = useState('referral_only');
  const [clientFacingRestricted, setClientFacingRestricted] = useState(false);
  const [initialClientFacing, setInitialClientFacing] = useState(false);
  const [cfOtp, setCfOtp] = useState('');
  const [requestingCfOtp, setRequestingCfOtp] = useState(false);
  const [approvedAffiliates, setApprovedAffiliates] = useState([]);

  const canLogTime = useMemo(() => {
    if (['completed', 'cancelled'].includes(status)) return false;
    const bc = billingClosure || '';
    if (['built', 'non_billable'].includes(bc)) return false;
    return true;
  }, [status, billingClosure]);
  const {
    activeTimer,
    busy: timerBusy,
    refreshActiveTimer,
    startForService,
    stopForService,
    saveStoppedEntry,
  } = useServiceTimer();
  const manageRunningHere = Boolean(activeTimer && String(activeTimer.serviceId) === String(id));
  const { label: elapsedLabel } = useElapsedTimer(activeTimer?.startedAt, manageRunningHere);

  const openTasksForTime = useMemo(
    () => tasks.filter((t) => t.id && t.status !== 'done'),
    [tasks],
  );

  const staffOptionsForTeam = useMemo(() => {
    const list = [...staffUsers];
    const seen = new Set(list.map((u) => String(u.id)));
    for (const uid of assigneeUserIds) {
      if (!seen.has(String(uid))) {
        seen.add(String(uid));
        list.push({ id: uid, name: `User #${uid}` });
      }
    }
    return list;
  }, [staffUsers, assigneeUserIds]);

  const assigneeNameById = useMemo(() => {
    const o = Object.create(null);
    for (const u of staffOptionsForTeam) o[u.id] = u.name;
    return o;
  }, [staffOptionsForTeam]);

  function toggleTeamMember(userId) {
    const idStr = String(userId);
    setAssigneeUserIds((prev) => {
      const has = prev.some((x) => String(x) === idStr);
      if (has) {
        const next = prev.filter((x) => String(x) !== idStr);
        // If the removed member was the incharge, promote the next remaining member.
        if (String(inchargeUserId) === idStr) {
          setInchargeUserId(next.length > 0 ? next[0] : null);
        }
        return next;
      }
      return [...prev, Number(userId)];
    });
  }

  function handleReplaceMember(oldId, newId) {
    setAssigneeUserIds((prev) =>
      prev.map((x) => (String(x) === String(oldId) ? Number(newId) : x)),
    );
    // If the replaced member was the incharge, transfer incharge to the replacement.
    if (String(inchargeUserId) === String(oldId)) {
      setInchargeUserId(Number(newId));
    }
    setReplacingMemberId(null);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getEngagement(id)
      .then(eng => {
        setClientName(eng.clientName || '');
        setServiceType(eng.type || '');
        setFy(eng.financialYear || '');
        setRelevantPeriod({
          frequency: eng.relevantPeriodFrequency || '',
          from: eng.relevantPeriodFrom || '',
          to: eng.relevantPeriodTo || '',
          label: eng.relevantPeriodLabel || '',
        });
        setStatus(eng.status || 'not_started');
        const ids = Array.isArray(eng.assigneeUserIds) && eng.assigneeUserIds.length > 0
          ? eng.assigneeUserIds.map(Number)
          : (eng.assignedToUserId != null ? [eng.assignedToUserId] : []);
        setAssigneeUserIds(ids);
        setInchargeUserId(ids.length > 0 ? ids[0] : null);
        const d0 = eng.dueDate || '';
        setDueDate(d0);
        setInitialDueDate(d0);
        setFee(eng.feeAgreed != null && !Number.isNaN(Number(eng.feeAgreed)) ? String(eng.feeAgreed) : '');
        setStdFeeOverride(eng.standardFeeOverride != null && !Number.isNaN(Number(eng.standardFeeOverride))
          ? String(eng.standardFeeOverride)
          : '');
        setStdHoursOverride(eng.standardAllowableHoursOverride != null && !Number.isNaN(Number(eng.standardAllowableHoursOverride))
          ? String(eng.standardAllowableHoursOverride)
          : '');
        setNotes(eng.notes || '');
        const loadedTasks = Array.isArray(eng.tasks) ? eng.tasks.map(t => ({ ...t })) : [];
        setTasks(loadedTasks);
        setPersistedTaskIds(loadedTasks.filter((t) => t && t.id).map((t) => String(t.id)));
        setBillingClosure(eng.billingClosure != null && eng.billingClosure !== '' ? eng.billingClosure : null);
        setReferringAffiliateUserId(eng.referringAffiliateUserId != null ? String(eng.referringAffiliateUserId) : '');
        setCommissionMode(eng.commissionMode || 'referral_only');
        const cfr = Boolean(eng.clientFacingRestricted);
        setClientFacingRestricted(cfr);
        setInitialClientFacing(cfr);
        setCfOtp('');
        // Master Service fields
        setIsMasterService(Boolean(eng.isMasterService));
        setMasterServiceId(eng.masterServiceId ?? null);
        setMasterServiceName(eng.masterServiceName ?? '');
        setMasterClientId(eng.clientId ?? null);
        setEngClientType(eng.clientType || 'contact');
        setMasterOrgId(eng.clientType === 'organization' ? eng.clientId : null);
        if (eng.linkedServicesSummary) {
          setLinkedServicesSummary(eng.linkedServicesSummary);
        }
      })
      .catch(e => setError(e.message || 'Could not load engagement.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    refreshActiveTimer().catch(() => {});
  }, [id, refreshActiveTimer]);

  useEffect(() => {
    getApprovedAffiliates()
      .then(setApprovedAffiliates)
      .catch(() => setApprovedAffiliates([]));
  }, []);

  // Load linked services when this is a master service
  useEffect(() => {
    if (!id || !isMasterService) {
      setLinkedServices([]);
      return;
    }
    setLinkedServicesLoading(true);
    getLinkedServices(id)
      .then((data) => {
        setLinkedServices(data.linked_services || []);
        setLinkedServicesSummary(data.linked_services_summary || null);
      })
      .catch(() => {})
      .finally(() => setLinkedServicesLoading(false));
  }, [id, isMasterService]);

  // Load linkable services for "Link to Master" dropdown (non-master, non-child services)
  // and master services list for "Link this service to a master" dropdown
  useEffect(() => {
    if (!id || !masterClientId) return;
    if (isMasterService) {
      // Load services that can be linked as children
      getLinkableServices(masterClientId, id)
        .then(setLinkableServices)
        .catch(() => setLinkableServices([]));
    } else if (!masterServiceId) {
      // Load master services of the same client for the "link to master" dropdown
      // We reuse getLinkableServices with a dummy masterId = 0 is not valid, so we
      // instead get all services and filter for masters on the client side.
      // A simpler approach: call getLinkableServices with id as the placeholder;
      // the API returns services that are linkable to the given master_id.
      // For finding master services, we use a different approach: fetch all services for the client
      // and filter. Since we don't have a dedicated endpoint for listing masters,
      // we call getLinkableServices with master_id = id but that won't return masters.
      // Instead, we'll do a GET /api/admin/services?client_id=X and filter.
      getAllEngagements({ clientId: masterClientId })
        .then((svcs) => {
          setMasterServicesList(svcs.filter((s) => s.isMasterService && String(s.id) !== String(id)));
        })
        .catch(() => setMasterServicesList([]));
    }
  }, [id, isMasterService, masterServiceId, masterClientId]);

  const affiliateReadonlyLabel = useMemo(() => {
    if (!referringAffiliateUserId) return 'None';
    const a = approvedAffiliates.find((x) => String(x.id) === String(referringAffiliateUserId));
    return a ? `${a.name} (${a.email})` : `Linked user #${referringAffiliateUserId}`;
  }, [referringAffiliateUserId, approvedAffiliates]);

  const commissionReadonlyLabel = COMMISSION_MODE_LABELS[commissionMode] || commissionMode;

  useEffect(() => {
    if (session?.user?.id) {
      setTimeForm((f) => (f.userId ? f : { ...f, userId: String(session.user.id) }));
    }
  }, [session]);

  useEffect(() => {
    if (!id) return;
    setTimeLoading(true);
    setTimeError('');
    getTimeEntries(id)
      .then(setTimeEntries)
      .catch((e) => setTimeError(e.message || 'Could not load time entries.'))
      .finally(() => setTimeLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'activity') return;
    setAuditLoading(true);
    setAuditError('');
    getServiceAuditLog(id)
      .then(setAuditRows)
      .catch((e) => {
        setAuditError(e.message || 'Could not load activity.');
        setAuditRows([]);
      })
      .finally(() => setAuditLoading(false));
  }, [id, tab]);

  async function handleSave() {
    if (!id) return;
    const todayKey = localDateKey(new Date());
    const dueKey = engagementDueDateKey(dueDate);
    const initialKey = engagementDueDateKey(initialDueDate);
    if (dueKey && dueKey < todayKey && dueKey !== initialKey) {
      setError('Due date cannot be in the past.');
      return;
    }
    setSaving(true);
    setError('');
    setToast('');
    try {
      const orderedAssigneeIds = inchargeUserId != null
        ? [inchargeUserId, ...assigneeUserIds.filter((x) => x !== inchargeUserId)]
        : assigneeUserIds;
      const payload = {
        status,
        assigneeUserIds: orderedAssigneeIds,
        dueDate,
        feeAgreed: fee.trim() === '' ? null : fee,
        standardFeeOverride: stdFeeOverride.trim() === '' ? null : stdFeeOverride,
        standardAllowableHoursOverride: stdHoursOverride.trim() === '' ? null : stdHoursOverride,
        notes,
        tasks,
        type: serviceType.trim(),
        financialYear: fy.trim(),
        relevantPeriodFrequency: relevantPeriod.frequency || null,
        relevantPeriodFrom: relevantPeriod.from || null,
        relevantPeriodTo: relevantPeriod.to || null,
        relevantPeriodLabel: relevantPeriod.label || null,
      };
      const cfrChange = clientFacingRestricted !== initialClientFacing;
      if (cfrChange) {
        payload.clientFacingRestricted = clientFacingRestricted;
      }
      const currentIdSet = new Set(tasks.filter((t) => t && t.id).map((t) => String(t.id)));
      const tasksRemoved = persistedTaskIds.some((pid) => !currentIdSet.has(pid));
      const needSuperOtp = cfrChange || tasksRemoved;
      let updated;
      if (needSuperOtp) {
        updated = await updateEngagement(id, payload, { superadminOtp: cfOtp.trim() });
      } else {
        updated = await updateEngagement(id, payload);
      }
      if (Array.isArray(updated.assigneeUserIds)) {
        setAssigneeUserIds(updated.assigneeUserIds);
        setInchargeUserId(updated.assigneeUserIds.length > 0 ? updated.assigneeUserIds[0] : null);
      }
      setInitialClientFacing(clientFacingRestricted);
      setCfOtp('');
      const savedTasks = Array.isArray(updated.tasks) ? updated.tasks : [];
      setPersistedTaskIds(savedTasks.filter((t) => t && t.id).map((t) => String(t.id)));
      setInitialDueDate(updated.dueDate || '');
      setToast('Engagement saved');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body?.data?.existing) {
        setOpenEngagementConflict(e.body.data.existing);
      } else {
        setError(e.message || 'Save failed.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenService() {
    if (!id) return;
    if (!reopenReason.trim()) {
      setReopenError('Please enter a reason for reopening.');
      return;
    }
    setReopening(true);
    setReopenError('');
    try {
      const updated = await reopenEngagement(id, {
        status: reopenStatus,
        reason: reopenReason.trim(),
      });
      setStatus(updated.status || reopenStatus);
      setReopenModalOpen(false);
      setReopenReason('');
      setToast('Service reopened');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setReopenError(e.message || 'Could not reopen service.');
    } finally {
      setReopening(false);
    }
  }

  function handleAddTask(taskData) {
    if (!id) return;
    createTask(id, taskData)
      .then((updated) => {
        const list = Array.isArray(updated.tasks) ? updated.tasks.map(t => ({ ...t })) : [];
        setTasks(list);
        setPersistedTaskIds(list.filter((t) => t && t.id).map((t) => String(t.id)));
        setToast('Task added');
        setTimeout(() => setToast(''), 1500);
      })
      .catch(e => setError(e.message || 'Could not add task.'));
  }

  function toggleTaskDone(taskId) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const next = t.status === 'done' ? 'not_started' : 'done';
      return { ...t, status: next };
    }));
  }

  function removeTask(taskId) {
    if (!taskId) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  // ── Master Service handlers ─────────────────────────────────────────────────

  const canAddChildService = canEditService && (!masterServiceId || isMasterService);

  function handleAddChildService() {
    if (!id || !canAddChildService) return;
    navigate('/services/new', {
      state: {
        parentServiceId: id,
        parentServiceName: serviceType || `Service #${id}`,
        parentIsMaster: isMasterService,
        parentClientType: engClientType,
        parentClientId: masterClientId,
        parentClientName: clientName,
        parentFinancialYear: fy,
        returnUrl: `/services/${id}`,
      },
    });
  }

  async function handleToggleMaster(newValue) {
    if (!id || !canEditService) return;
    setMasterError('');
    setMasterToggleSaving(true);
    try {
      const updated = await toggleMasterService(id, newValue);
      setIsMasterService(updated.isMasterService);
      setMasterServiceId(updated.masterServiceId ?? null);
      if (newValue) {
        setLinkedServices([]);
        setLinkedServicesSummary({ total: 0, completed: 0, pending: 0 });
      }
    } catch (e) {
      setMasterError(e.message || 'Failed to update master status.');
    } finally {
      setMasterToggleSaving(false);
    }
  }

  async function handleLinkChild() {
    if (!id || !linkTarget) return;
    setMasterError('');
    setLinkSaving(true);
    try {
      await linkService(id, linkTarget);
      setLinkTarget('');
      const data = await getLinkedServices(id);
      setLinkedServices(data.linked_services || []);
      setLinkedServicesSummary(data.linked_services_summary || null);
      getLinkableServices(masterClientId, id).then(setLinkableServices).catch(() => {});
    } catch (e) {
      setMasterError(e.message || 'Failed to link service.');
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleUnlinkChild(childId) {
    if (!id) return;
    setMasterError('');
    try {
      await unlinkService(id, childId);
      const data = await getLinkedServices(id);
      setLinkedServices(data.linked_services || []);
      setLinkedServicesSummary(data.linked_services_summary || null);
      getLinkableServices(masterClientId, id).then(setLinkableServices).catch(() => {});
    } catch (e) {
      setMasterError(e.message || 'Failed to unlink service.');
    }
  }

  async function handleLinkToMaster() {
    if (!linkToMasterTarget || !id) return;
    setMasterError('');
    setLinkSaving(true);
    try {
      await linkService(linkToMasterTarget, id);
      setMasterServiceId(Number(linkToMasterTarget));
      const master = masterServicesList.find((s) => String(s.id) === String(linkToMasterTarget));
      setMasterServiceName(master ? master.type : '');
      setLinkToMasterTarget('');
    } catch (e) {
      setMasterError(e.message || 'Failed to link to master.');
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleUnlinkFromMaster() {
    if (!masterServiceId || !id) return;
    setMasterError('');
    try {
      await unlinkService(masterServiceId, id);
      setMasterServiceId(null);
      setMasterServiceName('');
    } catch (e) {
      setMasterError(e.message || 'Failed to unlink from master.');
    }
  }

  // ── end Master Service handlers ─────────────────────────────────────────────

  async function handleSaveTimeEntry(e) {
    e.preventDefault();
    if (!id || !canLogTimePermission) return;
    const mins = parseInt(timeForm.durationMinutes, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
      setTimeError('Duration must be between 1 and 1440 minutes.');
      return;
    }
    setTimeSaving(true);
    setTimeError('');
    try {
      const basePayload = {
        work_date: timeForm.workDate,
        duration_minutes: mins,
        activity_type: timeForm.activityType,
        is_billable: timeForm.isBillable,
        notes: timeForm.notes.trim() || undefined,
      };
      if (timeForm.taskId) basePayload.task_id = timeForm.taskId;
      if (canManageTeamRates && timeForm.userId && String(timeForm.userId) !== String(session?.user?.id)) {
        basePayload.user_id = parseInt(timeForm.userId, 10);
      }

      const submit = async (overflow) => {
        const payload = overflow ? { ...basePayload, request_overflow_approval: true } : { ...basePayload };
        if (stoppedEntryDraft && String(stoppedEntryDraft.serviceId) === String(id)) {
          return saveStoppedEntry(id, stoppedEntryDraft.id, {
            ...payload,
            timer_status: 'submitted',
          });
        }
        return createTimeEntry(id, payload);
      };

      let result;
      try {
        result = await submit(false);
      } catch (err) {
        if (err?.data?.code === 'timesheet_cap_exceeded'
          && window.confirm(
            'This exceeds the engagement time allowance (3 × standard hours in Settings). '
            + 'Submit for Super Admin approval instead?',
          )) {
          result = await submit(true);
        } else {
          throw err;
        }
      }

      const list = await getTimeEntries(id);
      setTimeEntries(list);
      setStoppedEntryDraft(null);
      setTimeForm((f) => ({
        ...f,
        durationMinutes: '60',
        notes: '',
        taskId: '',
      }));
      if (result?.pendingApproval) {
        setToast('Submitted for Super Admin approval (timesheet overflow).');
      } else {
        setToast('Time entry saved');
      }
      setTimeout(() => setToast(''), 2000);
    } catch (err) {
      setTimeError(err.message || 'Could not save time entry.');
    } finally {
      setTimeSaving(false);
    }
  }

  async function refreshTimeList() {
    if (!id) return;
    const list = await getTimeEntries(id);
    setTimeEntries(list);
  }

  async function handleStartTimerFromManage() {
    if (!id || !canLogTimePermission || !canLogTime) return;
    setTimeError('');
    const myActive = activeTimer;
    if (myActive && String(myActive.serviceId) !== String(id)) {
      setPendingStartService({ id: Number(id) });
      setShowTimerModal(true);
      return;
    }
    if (myActive && String(myActive.serviceId) === String(id)) {
      setTimeError('A timer is already running for this service.');
      return;
    }
    try {
      await startForService(id, {
        task_id: timeForm.taskId || null,
        activity_type: timeForm.activityType,
        is_billable: timeForm.isBillable,
        notes: timeForm.notes.trim() || undefined,
      });
      setToast('Timer started');
      setTimeout(() => setToast(''), 1500);
      await refreshTimeList();
    } catch (e) {
      const extra = e?.data?.active_timer;
      if (extra) {
        setPendingStartService({ id: Number(id) });
        setShowTimerModal(true);
      } else {
        setTimeError(e.message || 'Could not start timer.');
      }
    }
  }

  async function handleStopCurrentTimer() {
    if (!id || !activeTimer || String(activeTimer.serviceId) !== String(id)) return;
    setTimeError('');
    try {
      const stopBody = {
        task_id: timeForm.taskId || null,
        activity_type: timeForm.activityType,
        is_billable: timeForm.isBillable,
        notes: timeForm.notes.trim() || undefined,
      };
      let stopped;
      let stoppedWithOverflowApproval = false;
      try {
        stopped = await stopForService(id, activeTimer.id, stopBody);
      } catch (e) {
        if (e?.data?.code === 'timesheet_cap_exceeded'
          && window.confirm(
            'Stopping exceeds the engagement time allowance (3 × standard hours). '
            + 'Stop the timer and request Super Admin approval for the extra time?',
          )) {
          stoppedWithOverflowApproval = true;
          stopped = await stopForService(id, activeTimer.id, {
            ...stopBody,
            request_overflow_approval: true,
          });
        } else {
          throw e;
        }
      }
      setStoppedEntryDraft(stopped);
      setTimeForm((f) => ({
        ...f,
        workDate: stopped.workDate || f.workDate,
        durationMinutes: String(stopped.durationMinutes || 1),
        activityType: stopped.activityType || f.activityType,
        isBillable: stopped.isBillable !== false,
        notes: stopped.notes || '',
        taskId: stopped.taskId || '',
      }));
      setToast(
        stoppedWithOverflowApproval
          ? 'Timer stopped; over-cap time is pending Super Admin approval. Review and submit the prefilled entry.'
          : 'Timer stopped. Review and submit the prefilled entry.',
      );
      setTimeout(() => setToast(''), stoppedWithOverflowApproval ? 2500 : 1500);
      await refreshTimeList();
      await refreshActiveTimer();
    } catch (e) {
      setTimeError(e.message || 'Could not stop timer.');
    }
  }

  async function handleRequestCfOtp() {
    if (!id) return;
    setRequestingCfOtp(true);
    setError('');
    try {
      await requestServiceClientFacingOtp(id);
      setToast('OTP sent to superadmin email');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      setError(e.message || 'Could not send OTP.');
    } finally {
      setRequestingCfOtp(false);
    }
  }

  function openDeleteEngagementModal() {
    setDeleteModalOpen(true);
    setServiceDeleteStep('warn');
    setDeleteOtp('');
    setDeleteOtpSent(false);
    setDeleteModalErr('');
  }

  function closeDeleteEngagementModal() {
    setDeleteModalOpen(false);
    setServiceDeleteStep('warn');
    setDeleteOtp('');
    setDeleteOtpSent(false);
    setDeleteModalErr('');
  }

  async function sendDeleteOtp() {
    if (!id) return;
    setRequestingDeleteOtp(true);
    setDeleteModalErr('');
    try {
      await requestServiceDeleteOtp(id);
      setDeleteOtpSent(true);
    } catch (e) {
      setDeleteModalErr(e.message || 'Failed to send OTP.');
    } finally {
      setRequestingDeleteOtp(false);
    }
  }

  async function confirmDeleteEngagement() {
    if (!id) return;
    if (!deleteOtp.trim()) {
      setDeleteModalErr('Enter the superadmin OTP.');
      return;
    }
    setDeleting(true);
    setDeleteModalErr('');
    try {
      await deleteEngagement(id, { superadminOtp: deleteOtp.trim() });
      closeDeleteEngagementModal();
      navigate('/services');
    } catch (e) {
      setDeleteModalErr(e.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div style={pageWrap}>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading engagement…</div>
      </div>
    );
  }

  if (error && !serviceType && !fy && tasks.length === 0) {
    return (
      <div style={pageWrap}>
        <div style={errBox}>{error}</div>
        <button type="button" style={btnSecondary} onClick={() => navigate('/services')}>Back to Services</button>
      </div>
    );
  }

  const statusLabel = STATUS_OPTIONS.includes(status)
    ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : status;

  return (
    <div style={pageWrap}>
      <OpenEngagementConflictModal
        open={Boolean(openEngagementConflict)}
        existing={openEngagementConflict}
        onClose={() => setOpenEngagementConflict(null)}
      />
      {showAddTask && (
        <AddTaskModal
          assigneeUserIds={assigneeUserIds}
          staffUsers={staffUsers}
          onClose={() => setShowAddTask(false)}
          onSave={handleAddTask}
        />
      )}
      <TimerHandoffModal
        open={showTimerModal}
        activeTimer={activeTimer}
        openTasks={openTasksForTime}
        defaultUserId={session?.user?.id}
        canManageTeamRates={canManageTeamRates}
        staffUsers={staffUsers}
        pendingStartService={pendingStartService}
        onClose={() => {
          setShowTimerModal(false);
          setPendingStartService(null);
          refreshTimeList().catch(() => {});
          refreshActiveTimer().catch(() => {});
        }}
        onStopAndPrefill={(timer) => stopForService(timer.serviceId, timer.id)}
        onSubmitStopped={async (entry, payload) => {
          await saveStoppedEntry(entry.serviceId, entry.id, payload);
          await refreshTimeList();
        }}
        onStartNext={(svc) => startForService(svc.id, {
          task_id: timeForm.taskId || null,
          activity_type: timeForm.activityType,
          is_billable: timeForm.isBillable,
          notes: timeForm.notes.trim() || undefined,
        })}
      />
      {deleteModalOpen && (
        <div style={deleteOverlayStyle}>
          <div style={deleteModalStyle}>
            <div style={deleteModalHeaderStyle}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c' }}>Delete service engagement</span>
              <button type="button" onClick={closeDeleteEngagementModal} style={deleteCloseBtnStyle}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {serviceDeleteStep === 'warn' ? (
                <>
                  <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
                    You are about to <strong>permanently delete</strong> this engagement for{' '}
                    <strong>{clientName || 'this client'}</strong> ({serviceType || 'service'}, {fy || 'FY —'}).
                  </p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                    Assigned users can be notified by email. This cannot be undone. Continue only if you are sure — the next step will ask for a superadmin OTP.
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setServiceDeleteStep('warn');
                      setDeleteOtp('');
                      setDeleteOtpSent(false);
                      setDeleteModalErr('');
                    }}
                    style={{ ...deleteBtnSecondaryStyle, alignSelf: 'flex-start' }}
                  >
                    ← Back
                  </button>
                  <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
                    Request a superadmin OTP and enter it to authorize deletion for <strong>{clientName || 'this client'}</strong> ({serviceType || 'service'}).
                  </p>
                  {deleteModalErr && <div style={{ color: '#dc2626', fontSize: 13 }}>{deleteModalErr}</div>}
                  <button type="button" style={deleteBtnSecondaryStyle} disabled={requestingDeleteOtp} onClick={sendDeleteOtp}>
                    {requestingDeleteOtp && !deleteOtpSent ? 'Sending…' : 'Request superadmin OTP'}
                  </button>
                  {deleteOtpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent to superadmin email</span>}
                  <label style={deleteLabelStyle}>
                    Superadmin OTP *
                    <input
                      type="text"
                      style={deleteInputStyle}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={deleteOtp}
                      onChange={(e) => setDeleteOtp(e.target.value.replace(/\s/g, ''))}
                    />
                  </label>
                </>
              )}
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {serviceDeleteStep === 'warn' ? (
                <>
                  <button type="button" onClick={closeDeleteEngagementModal} style={deleteBtnSecondaryStyle}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => setServiceDeleteStep('otp')}
                    style={{ ...deleteBtnPrimaryStyle, background: '#b91c1c' }}
                  >
                    Continue to OTP
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={closeDeleteEngagementModal} style={deleteBtnSecondaryStyle}>Cancel</button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={confirmDeleteEngagement}
                    style={{ ...deleteBtnPrimaryStyle, background: '#b91c1c' }}
                  >
                    {deleting ? 'Deleting…' : 'Delete engagement'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {reopenModalOpen && (
        <div style={deleteOverlayStyle}>
          <div style={deleteModalStyle}>
            <div style={deleteModalHeaderStyle}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0B1F3B' }}>Reopen completed service</span>
              <button
                type="button"
                onClick={() => { setReopenModalOpen(false); setReopenError(''); }}
                style={deleteCloseBtnStyle}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
                Choose the status to reopen this engagement and record the reason. Super Admin will be notified by email with this reason.
              </p>
              {reopenError && <div style={{ color: '#dc2626', fontSize: 13 }}>{reopenError}</div>}
              <label style={deleteLabelStyle}>
                Reopen to status
                <select
                  value={reopenStatus}
                  onChange={(e) => setReopenStatus(e.target.value)}
                  style={deleteInputStyle}
                >
                  {['not_started', 'in_progress', 'pending_info', 'review'].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </label>
              <label style={deleteLabelStyle}>
                Reason for reopening *
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  rows={4}
                  style={{ ...deleteInputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Explain why this completed service is being reopened."
                />
              </label>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setReopenModalOpen(false); setReopenError(''); }}
                style={deleteBtnSecondaryStyle}
              >
                Cancel
              </button>
              <button type="button" disabled={reopening} onClick={handleReopenService} style={deleteBtnPrimaryStyle}>
                {reopening ? 'Reopening…' : 'Reopen service'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={toastBar}>{toast}</div>}

      <div style={breadcrumbRow}>
        <span style={crumb} onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/')}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumb} onClick={() => navigate('/services')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/services')}>Services &amp; Tasks</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumbActive}>Manage engagement</span>
      </div>

      <header style={hubHeader}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={hubEyebrow}>Engagement #{id}</div>
          <h1 style={hubTitle}>{clientName || 'Client'}</h1>
          <div style={hubMeta}>
            <span style={hubMetaStrong}>{serviceType || 'Service'}</span>
            <span style={hubDot}>·</span>
            <span>{fy || '—'} FY</span>
            <span style={hubDot}>·</span>
            <span style={hubStatusPill}>{statusLabel}</span>
          </div>
        </div>
        <div style={hubActions}>
          <button type="button" style={hubBtnSecondary} onClick={() => navigate(`/services/${id}/files`)}>
            <FolderOpen size={16} />
            Engagement files
          </button>
        </div>
      </header>

      {error && <div style={errBox}>{error}</div>}

      <nav style={tabNav} aria-label="Engagement sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              ...tabBtn,
              ...(tab === t.id ? tabBtnActive : {}),
            }}
          >
            {t.id === 'activity' ? <History size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> : null}
            {t.label}
          </button>
        ))}
      </nav>

      <div style={tabPanel}>
        {tab === 'overview' && (
          <div style={formGrid}>
        <section style={sectionCard}>
          <div style={sectionTitle}>Client &amp; service</div>
          <div style={metaLine}><span style={metaKey}>Record</span> #{id}</div>
          <label style={fieldLabel}>
            Service type / description
            <input value={serviceType} onChange={e => setServiceType(e.target.value)} style={inputStyle} placeholder="e.g. ITR filing" />
          </label>
          <div style={{ ...fieldLabel, marginTop: 14 }}>
            Relevant period
            <RelevantPeriodSelector
              frequency={relevantPeriod.frequency}
              periodFrom={relevantPeriod.from}
              periodTo={relevantPeriod.to}
              periodLabel={relevantPeriod.label}
              onChange={setRelevantPeriod}
            />
          </div>
          <label style={{ ...fieldLabel, marginTop: 14 }}>
            Financial year
            <input value={fy} onChange={e => setFy(e.target.value)} style={inputStyle} placeholder="e.g. 2025-26" />
          </label>
        </section>

        <section style={sectionCard}>
          <div style={sectionTitle}>Referral &amp; commission</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.45 }}>
            Referring affiliate and commission mode are fixed for this engagement. Referral start date is maintained on the client record. To change the client-facing flag, or to match removing tasks on the Tasks tab, request a superadmin OTP and enter it before saving.
          </p>
          <label style={fieldLabel}>
            Referring affiliate
            <div style={{ ...inputStyle, background: '#f8fafc', color: '#334155', cursor: 'default' }}>{affiliateReadonlyLabel}</div>
          </label>
          <label style={{ ...fieldLabel, marginTop: 14 }}>
            Commission mode
            <div style={{ ...inputStyle, background: '#f8fafc', color: '#334155', cursor: 'default' }}>{commissionReadonlyLabel}</div>
          </label>
          <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={clientFacingRestricted}
                onChange={e => setClientFacingRestricted(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>Client-facing restricted (reporting flag)</span>
            </label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 8px', lineHeight: 1.45 }}>
              Superadmin receives a one-time code by email. Request the code, then enter it below before saving if you change this flag, or if you remove any task.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button type="button" style={btnSecondary} disabled={requestingCfOtp} onClick={handleRequestCfOtp}>
                {requestingCfOtp ? 'Sending…' : 'Request superadmin OTP'}
              </button>
            </div>
            <label style={{ ...fieldLabel, marginTop: 12 }}>
              Superadmin OTP
              <input
                type="text"
                style={inputStyle}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter code if the flag or tasks changed"
                value={cfOtp}
                onChange={e => setCfOtp(e.target.value.replace(/\s/g, ''))}
              />
            </label>
          </div>
        </section>

        <section style={sectionCard}>
          <div style={sectionTitle}>Engagement details</div>
          <label style={fieldLabel}>
            Status
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={selectStyle}
              disabled={status === 'completed'}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </label>
          {status === 'completed' && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                style={btnSecondary}
                onClick={() => {
                  setReopenStatus('in_progress');
                  setReopenReason('');
                  setReopenError('');
                  setReopenModalOpen(true);
                }}
              >
                Reopen service
              </button>
              <p style={{ ...hint, marginTop: 8 }}>
                Completed services cannot change status directly. Use <strong>Reopen service</strong> and provide a reason.
              </p>
            </div>
          )}
          <p style={{ ...hint, marginTop: 12 }}>Assign staff on the <strong>Team</strong> tab (multiple people allowed). The first selected member is the primary owner for legacy reports.</p>
          <div style={{ ...twoCol, marginTop: 14 }}>
            <label style={fieldLabel}>
              Due date
              <DateInput min={localDateKey(new Date())} value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              Fee (₹)
              <div style={feeWrap}>
                <span style={feePrefix}>₹</span>
                <input
                  type="number"
                  min="0"
                  value={fee}
                  onChange={e => setFee(e.target.value)}
                  placeholder="0"
                  disabled={!canEditService}
                  style={{ ...inputStyle, borderRadius: '0 8px 8px 0', borderLeft: 'none', paddingLeft: 8 }}
                />
              </div>
            </label>
          </div>
          {canEditService && (
            <div style={{ ...twoCol, marginTop: 12 }}>
              <label style={fieldLabel}>
                Std fee override (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stdFeeOverride}
                  onChange={(e) => setStdFeeOverride(e.target.value)}
                  placeholder="Use engagement-type default"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabel}>
                Std hours override
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stdHoursOverride}
                  onChange={(e) => setStdHoursOverride(e.target.value)}
                  placeholder="Use engagement-type default"
                  style={inputStyle}
                />
              </label>
            </div>
          )}
          {canEditService && (
            <p style={{ ...hint, marginTop: 8 }}>
              Overrides apply only to this engagement for invoice standard fee / allowable hours (master values live under Settings → Service Configuration).
            </p>
          )}
          <label style={{ ...fieldLabel, marginTop: 14 }}>
            Notes
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes…" style={textareaStyle} />
          </label>
        </section>

        {/* ── Master Service Section ── */}
        {canEditService && (
        <section style={sectionCard}>
          <div style={sectionTitle}>Master Service</div>

          {masterError && (
            <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>
              {masterError}
            </div>
          )}

          {/* Case C: this service is a child (linked to a master) */}
          {masterServiceId && !isMasterService && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: '#475569' }}>
                Linked to master service:&nbsp;
                <strong style={{ color: '#0B1F3B' }}>{masterServiceName || `#${masterServiceId}`}</strong>
              </div>
              <button
                type="button"
                style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}
                onClick={handleUnlinkFromMaster}
                disabled={linkSaving}
              >
                Unlink
              </button>
            </div>
          )}

          {/* Case A: not master, not a child — show toggle + link-to-master dropdown */}
          {!masterServiceId && !isMasterService && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => handleToggleMaster(true)}
                    disabled={masterToggleSaving}
                    style={{ width: 16, height: 16 }}
                  />
                  {masterToggleSaving ? 'Saving…' : 'Mark as Master Service'}
                </label>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}
                  onClick={handleAddChildService}
                >
                  <Plus size={12} /> Add Child Service
                </button>
              </div>
              {masterServicesList.length > 0 && (
                <div>
                  <p style={{ ...hint, marginBottom: 8 }}>Or link this service to an existing master service of the same client:</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={linkToMasterTarget}
                      onChange={(e) => setLinkToMasterTarget(e.target.value)}
                      style={{ ...selectStyle, flex: '1 1 200px', minWidth: 160, maxWidth: 320 }}
                    >
                      <option value="">Select master service…</option>
                      {masterServicesList.map((s) => (
                        <option key={s.id} value={s.id}>{s.type} {s.financialYear ? `(${s.financialYear})` : ''}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={btnPrimary}
                      onClick={handleLinkToMaster}
                      disabled={!linkToMasterTarget || linkSaving}
                    >
                      {linkSaving ? 'Linking…' : 'Link to Master'}
                    </button>
                  </div>
                </div>
              )}
              {masterServicesList.length === 0 && (
                <p style={hint}>No master services found for this client. Mark a service as Master first to enable linking.</p>
              )}
            </>
          )}

          {/* Case B: this service IS the master */}
          {isMasterService && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#0B1F3B', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => handleToggleMaster(false)}
                    disabled={masterToggleSaving}
                    style={{ width: 16, height: 16, accentColor: '#F37920' }}
                  />
                  {masterToggleSaving ? 'Saving…' : 'This is a Master Service'}
                </label>
                {linkedServicesSummary && linkedServicesSummary.total > 0 && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {linkedServicesSummary.completed}/{linkedServicesSummary.total} linked services completed
                  </span>
                )}
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}
                  onClick={handleAddChildService}
                >
                  <Plus size={12} /> Add Child Service
                </button>
              </div>

              {/* Billing warning */}
              {billingClosure === 'open' && linkedServicesSummary && linkedServicesSummary.pending > 0 && (
                <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#854d0e' }}>
                  <strong>Billing cannot be closed yet.</strong> {linkedServicesSummary.pending} linked service(s) are not yet completed.
                </div>
              )}

              {/* Linked services table */}
              {linkedServicesLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>Loading linked services…</div>
              ) : linkedServices.length > 0 ? (
                <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                        {['Service', 'Status', ''].map((h) => (
                          <th key={h} style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linkedServices.map((ls) => (
                        <tr key={ls.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 8px', color: '#0B1F3B', fontWeight: 500 }}>{ls.service_type}</td>
                          <td style={{ padding: '7px 8px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: ls.status === 'completed' ? '#dcfce7' : ls.status === 'cancelled' ? '#fee2e2' : '#f1f5f9',
                              color: ls.status === 'completed' ? '#166534' : ls.status === 'cancelled' ? '#dc2626' : '#475569',
                            }}>
                              {ls.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            <button
                              type="button"
                              style={{ ...btnSecondary, fontSize: 11, padding: '2px 8px' }}
                              onClick={() => handleUnlinkChild(ls.id)}
                            >
                              Unlink
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ ...hint, marginBottom: 12 }}>No services linked yet. Use the form below to link services from this client.</p>
              )}

              {/* Add linked service */}
              {linkableServices.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value)}
                    style={{ ...selectStyle, flex: '1 1 200px', minWidth: 160, maxWidth: 320 }}
                  >
                    <option value="">Add linked service…</option>
                    {linkableServices.map((s) => (
                      <option key={s.id} value={s.id}>{s.service_type} {s.financial_year ? `(${s.financial_year})` : ''}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={btnPrimary}
                    onClick={handleLinkChild}
                    disabled={!linkTarget || linkSaving}
                  >
                    {linkSaving ? 'Linking…' : '+ Link Service'}
                  </button>
                </div>
              )}
              {linkableServices.length === 0 && !linkedServicesLoading && (
                <p style={hint}>No additional active services of this client are available to link.</p>
              )}
            </>
          )}
        </section>
        )}
          </div>
        )}

        {tab === 'team' && (
          <section style={sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={sectionTitle}>Team ({assigneeUserIds.length})</div>
            </div>
            {canManageAssignees ? (
              <p style={hint}>
                Manage everyone assigned to this engagement. Use <strong>Set as Incharge</strong> to designate the primary responsible member.
                Click <strong>Save changes</strong> to apply.
              </p>
            ) : (
              <p style={{ ...hint, color: '#94a3b8', fontStyle: 'italic' }}>
                View only — you do not have permission to add or change assignees on this engagement.
              </p>
            )}

            {assigneeUserIds.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>No team members assigned yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {assigneeUserIds.map((uid) => {
                  const u = staffOptionsForTeam.find((x) => String(x.id) === String(uid)) || { id: uid, name: `User #${uid}` };
                  const isReplacing = replacingMemberId === uid;
                  const isIncharge = String(uid) === String(inchargeUserId);
                  const availableForReplace = staffUsers.filter(
                    (s) => !assigneeUserIds.some((x) => String(x) === String(s.id)),
                  );
                  return (
                    <div key={uid} style={teamMemberRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <div style={memberAvatar}>{u.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3B' }}>{u.name}</div>
                          {isIncharge && (
                            <div style={{ fontSize: 11, color: '#F37920', fontWeight: 500 }}>Incharge</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {canManageAssignees && (
                          isReplacing ? (
                            <>
                              <select
                                style={teamPickerSelect}
                                defaultValue=""
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  handleReplaceMember(uid, Number(e.target.value));
                                }}
                              >
                                <option value="">Pick replacement…</option>
                                {availableForReplace.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                style={teamBtnCancel}
                                onClick={() => setReplacingMemberId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {!isIncharge && (
                                <button
                                  type="button"
                                  style={teamBtnSetIncharge}
                                  onClick={() => setInchargeUserId(uid)}
                                >
                                  Set as Incharge
                                </button>
                              )}
                              <button
                                type="button"
                                style={teamBtnReplace}
                                onClick={() => { setReplacingMemberId(uid); setShowAddMemberSelect(false); }}
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                style={teamBtnRemove}
                                onClick={() => toggleTeamMember(uid)}
                              >
                                Remove
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canManageAssignees && showAddMemberSelect ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <select
                  style={{ ...teamPickerSelect, flex: 1 }}
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    toggleTeamMember(Number(e.target.value));
                    setShowAddMemberSelect(false);
                  }}
                >
                  <option value="">Select a member to add…</option>
                  {staffUsers
                    .filter((s) => !assigneeUserIds.some((x) => String(x) === String(s.id)))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  style={teamBtnCancel}
                  onClick={() => setShowAddMemberSelect(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              canManageAssignees && staffUsers.some((s) => !assigneeUserIds.some((x) => String(x) === String(s.id))) && (
                <button
                  type="button"
                  style={btnSmall}
                  onClick={() => { setShowAddMemberSelect(true); setReplacingMemberId(null); }}
                >
                  <Plus size={13} /> Add Member
                </button>
              )
            )}
          </section>
        )}

        {tab === 'time' && (
        <section style={sectionCard}>
          <div style={sectionTitle}>Time entries</div>
          <p style={hint}>
            Log time against this engagement or an <strong>open</strong> task. Entries are blocked when the engagement is completed, cancelled, or billing is closed (built / non-billable), or when the chosen task is marked done.
          </p>
          {timeError && <div style={{ ...errBox, marginBottom: 12 }}>{timeError}</div>}
          {timeLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>Loading time entries…</div>
          ) : null}
          {canLogTimePermission && canLogTime ? (
            <form onSubmit={handleSaveTimeEntry} style={{ display: 'grid', gap: 12, marginBottom: 16, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activeTimer && String(activeTimer.serviceId) === String(id) ? (
                  <button type="button" onClick={handleStopCurrentTimer} disabled={timerBusy} style={btnSecondary}>
                    {timerBusy ? 'Stopping...' : 'Stop timer'}
                  </button>
                ) : (
                  <button type="button" onClick={handleStartTimerFromManage} disabled={timerBusy} style={btnSecondary}>
                    {timerBusy ? 'Starting...' : 'Start timer'}
                  </button>
                )}
                {activeTimer ? (
                  <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
                    Running: {activeTimer.clientName || `Service #${activeTimer.serviceId}`} {activeTimer.serviceType ? `(${activeTimer.serviceType})` : ''}
                  </span>
                ) : null}
                {manageRunningHere ? (
                  <span style={{ fontSize: 12, color: '#0B1F3B', fontWeight: 700, alignSelf: 'center' }}>
                    Elapsed: {elapsedLabel}
                  </span>
                ) : null}
              </div>
              <div style={{ ...twoCol, marginTop: 0 }}>
                <label style={fieldLabel}>
                  Work date
                  <DateInput value={timeForm.workDate} onChange={(e) => setTimeForm((f) => ({ ...f, workDate: e.target.value }))} style={inputStyle} />
                </label>
                <label style={fieldLabel}>
                  Duration (minutes)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={timeForm.durationMinutes}
                    onChange={(e) => setTimeForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
              </div>
              <div style={twoCol}>
                <label style={fieldLabel}>
                  Activity
                  <select
                    value={timeForm.activityType}
                    onChange={(e) => setTimeForm((f) => ({ ...f, activityType: e.target.value }))}
                    style={selectStyle}
                  >
                    {TIME_ACTIVITY_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabel}>
                  Scope
                  <select
                    value={timeForm.taskId}
                    onChange={(e) => setTimeForm((f) => ({ ...f, taskId: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="">Whole engagement (no specific task)</option>
                    {openTasksForTime.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              {canManageTeamRates ? (
                <label style={fieldLabel}>
                  User (team admins only)
                  <select
                    value={timeForm.userId}
                    onChange={(e) => setTimeForm((f) => ({ ...f, userId: e.target.value }))}
                    style={selectStyle}
                  >
                    {staffUsers.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={timeForm.isBillable}
                  onChange={(e) => setTimeForm((f) => ({ ...f, isBillable: e.target.checked }))}
                />
                <span>Billable</span>
              </label>
              <label style={fieldLabel}>
                Notes (optional)
                <input
                  type="text"
                  value={timeForm.notes}
                  onChange={(e) => setTimeForm((f) => ({ ...f, notes: e.target.value }))}
                  style={inputStyle}
                  placeholder="Short note"
                />
              </label>
              <button type="submit" disabled={timeSaving} style={{ ...btnPrimary, justifySelf: 'start' }}>
                {timeSaving ? 'Saving…' : stoppedEntryDraft ? 'Submit prefilled time' : 'Add time entry'}
              </button>
            </form>
          ) : (
            <p style={{ ...hint, color: canLogTime ? '#94a3b8' : '#dc2626' }}>
              {!canLogTimePermission
                ? 'You do not have permission to add time entries.'
                : 'This engagement is closed for time entry (completed, cancelled, or billing closed).'}
            </p>
          )}
          {timeEntries.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No time logged yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    {['Date', 'User', 'Mins', 'Activity', 'Scope', 'Billable', 'Cap', ''].map((h) => (
                      <th key={h} style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.map((te) => (
                    <tr key={te.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 4px' }}>{te.workDate}</td>
                      <td style={{ padding: '6px 4px' }}>{te.userName}</td>
                      <td style={{ padding: '6px 4px' }}>{te.durationMinutes}</td>
                      <td style={{ padding: '6px 4px' }}>{te.activityType.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '6px 4px', color: '#64748b' }}>{te.taskId ? `Task` : 'Engagement'}</td>
                      <td style={{ padding: '6px 4px' }}>{te.isBillable ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '6px 4px', fontSize: 11, color: '#64748b' }}>
                        {te.overflowRequestStatus === 'pending' && (
                          <span style={{ color: '#b45309', fontWeight: 600 }}>Pending approval</span>
                        )}
                        {te.overflowRequestStatus && te.overflowRequestStatus !== 'pending' && (
                          <span title={te.overflowDecisionNotes || ''}>{te.overflowRequestStatus.replace(/_/g, ' ')}</span>
                        )}
                        {!te.overflowRequestStatus && '—'}
                      </td>
                      <td style={{ padding: '6px 4px' }}>
                        {canLogTimePermission && (
                          <button
                            type="button"
                            title={te.workDate === today ? "Edit today's entry" : "Request modification (requires superadmin OTP)"}
                            onClick={() => setModifyEntry(te)}
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', padding: '3px 6px', color: '#64748b', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {modifyEntry && (
            <TimeEntryModifyModal
              entry={modifyEntry}
              serviceId={id}
              onSaved={async (updated) => {
                if (updated?.pendingApproval) {
                  try {
                    const list = await getTimeEntries(id);
                    setTimeEntries(list);
                  } catch {
                    /* list refresh best-effort */
                  }
                  setToast('Change submitted for Super Admin approval (timesheet overflow).');
                  setTimeout(() => setToast(''), 2500);
                } else {
                  setTimeEntries((prev) => prev.map((te) => te.id === updated.id ? updated : te));
                }
                setModifyEntry(null);
              }}
              onClose={() => setModifyEntry(null)}
            />
          )}
        </section>
        )}

        {tab === 'tasks' && (
        <section style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={sectionTitle}>Tasks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button type="button" style={btnSecondary} disabled={requestingCfOtp} onClick={handleRequestCfOtp}>
                {requestingCfOtp ? 'Sending…' : 'Request superadmin OTP'}
              </button>
              {canAddChildService && (
                <button type="button" style={btnSecondary} onClick={handleAddChildService}>
                  <Plus size={14} /> Add child service
                </button>
              )}
              <button type="button" style={btnSmall} onClick={() => setShowAddTask(true)}><Plus size={14} /> Add task</button>
            </div>
          </div>
          <p style={hint}>
            Check off items locally, then click <strong>Save changes</strong> to persist task status. New tasks are saved immediately.
            <strong> Removing a task</strong> requires a superadmin OTP (request above, or on Overview) and the code in the Overview field, then <strong>Save changes</strong>.
            {canAddChildService && (
              <> Use <strong>Add child service</strong> to create a linked engagement in one step — the current service is marked as master automatically.</>
            )}
          </p>
          {tasks.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No tasks yet.</div>}
          {tasks.map((t, i) => (
            <div
              key={t.id || `task-${i}`}
              style={{ ...taskRow, cursor: 'default' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0, cursor: t.id ? 'pointer' : 'default' }}
                role="button"
                tabIndex={0}
                onClick={() => t.id && toggleTaskDone(t.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && t.id && toggleTaskDone(t.id)}
              >
                <span style={{ marginTop: 2, flexShrink: 0, display: 'flex' }}>
                  {t.status === 'done' ? <CheckSquare size={18} color="#55B848" /> : <Square size={18} color="#94a3b8" />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: t.status === 'done' ? 400 : 600, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? '#94a3b8' : '#1e293b' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {[
                      t.assignedTo
                        || (t.assignedToUserId != null
                          ? (assigneeNameById[t.assignedToUserId] || `User #${t.assignedToUserId}`)
                          : null),
                      t.dueDate ? `Due ${t.dueDate}` : null,
                    ].filter(Boolean).join(' · ') || ' '}
                  </div>
                </div>
              </div>
              {t.id && (
                <button
                  type="button"
                  title="Remove task (click Save changes to apply)"
                  onClick={(e) => { e.stopPropagation(); removeTask(t.id); }}
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#64748b',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </section>
        )}

        {tab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Primary: user-created activity log */}
            <ServiceLogPanel
              serviceId={id}
              isSuperAdmin={isSuperAdmin}
              canEdit={canEditService}
            />

            {/* Secondary: collapsible system audit trail */}
            <SystemAuditSection
              auditRows={auditRows}
              auditLoading={auditLoading}
              auditError={auditError}
            />
          </div>
        )}
      </div>

      <div style={{ ...actionRow, justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        {canDeleteService && (
          <button
            type="button"
            disabled={deleting}
            onClick={openDeleteEngagementModal}
            style={{
              padding: '10px 18px',
              background: '#fff',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: 8,
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Delete engagement
          </button>
        )}
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <button type="button" style={btnSecondary} onClick={() => navigate('/services')}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ── System Audit Section (collapsible, within Activity tab) ──────────────────
function SystemAuditSection({ auditRows, auditLoading, auditError }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E6E8F0', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 700, color: '#64748b',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <History size={14} />
          System Audit Trail
        </span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #F1F5F9' }}>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '12px 0 16px' }}>
            Automated system changes recorded for this engagement (status, team, tasks, billing, and more).
          </p>
          {auditError && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{auditError}</div>}
          {auditLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading audit trail…</div>
          ) : auditRows.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No audit entries yet.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {auditRows.map((row) => (
                <li
                  key={String(row.id)}
                  style={{
                    borderLeft: '3px solid #F37920',
                    paddingLeft: 14,
                    paddingBottom: 12,
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    {(row.created_at || row.createdAt) ? new Date(row.created_at || row.createdAt).toLocaleString() : ''}
                    {' · '}
                    <span style={{ fontWeight: 600, color: '#475569' }}>{row.actor_name || 'System'}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3B', marginBottom: 6 }}>{row.action}</div>
                  <AuditMetaDetails row={row} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const hubHeader = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: '20px 22px',
  background: 'linear-gradient(135deg, #0B1F3B 0%, #1e3a5f 100%)',
  borderRadius: 14,
  border: '1px solid #0f2847',
  boxShadow: '0 4px 20px rgba(11,31,59,0.12)',
};
const hubEyebrow = { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 };
const hubTitle = { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.25 };
const hubMeta = { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 };
const hubMetaStrong = { fontWeight: 600, color: '#fff' };
const hubDot = { color: 'rgba(255,255,255,0.45)' };
const hubStatusPill = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 99,
  background: 'rgba(243,121,32,0.25)',
  color: '#FBD38D',
  fontSize: 12,
  fontWeight: 600,
};
const hubActions = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' };
const hubBtnSecondary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.28)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
const tabNav = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '4px',
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #E6E8F0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const tabBtn = {
  padding: '10px 16px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};
const tabBtnActive = { background: '#FEF0E6', color: '#C25A0A' };
const tabPanel = { minHeight: 200 };

const breadcrumbRow = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' };
const crumb = { fontSize: 12, color: '#94a3b8', fontWeight: 500, cursor: 'pointer' };
const crumbActive = { fontSize: 12, color: '#F37920', fontWeight: 600 };
const formGrid = { display: 'flex', flexDirection: 'column', gap: 16 };
const sectionCard = {
  background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0',
  padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#0B1F3B', marginBottom: 4 };
const metaLine = { fontSize: 12, color: '#64748b', marginBottom: 14 };
const metaKey = { fontWeight: 600, color: '#475569', marginRight: 6 };
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569' };
const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#334155', outline: 'none', background: '#fff', boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const textareaStyle = { ...inputStyle, resize: 'vertical', fontFamily: 'inherit' };
const feeWrap = { display: 'flex', alignItems: 'center' };
const feePrefix = {
  padding: '8px 10px', background: '#F6F7FB', border: '1px solid #E6E8F0',
  borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, flexShrink: 0,
};
const hint = { fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.45 };
const taskRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: '1px solid #F0F2F8',
};
const btnSmall = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
  background: '#FEF0E6', color: '#F37920', border: '1px solid rgba(243,121,32,0.35)', borderRadius: 6,
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
};
const actionRow = { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 };
const btnPrimary = {
  padding: '10px 22px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600, boxShadow: '0 2px 8px rgba(243,121,32,0.30)',
};
const btnSecondary = {
  padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #E6E8F0', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600,
};
const errBox = { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13 };
const toastBar = {
  position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
  background: '#0B1F3B', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
};

const teamMemberRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '10px 14px', borderRadius: 10, border: '1px solid #E6E8F0', background: '#fff',
};
const memberAvatar = {
  width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #F37920 0%, #C25A0A 100%)',
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 700, flexShrink: 0,
};
const teamBtnRemove = {
  padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
  background: '#fff5f5', color: '#b91c1c', border: '1px solid #fecaca',
};
const teamBtnReplace = {
  padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
  background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0',
};
const teamBtnSetIncharge = {
  padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
  background: '#FEF0E6', color: '#F37920', border: '1px solid rgba(243,121,32,0.35)',
};
const teamBtnCancel = {
  padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
  background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
};
const teamPickerSelect = {
  padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12,
  color: '#334155', outline: 'none', cursor: 'pointer', background: '#fff',
};
const deleteOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const deleteModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 400, maxWidth: 480, width: '100%' };
const deleteModalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F0F2F8' };
const deleteCloseBtnStyle = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const deleteLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const deleteInputStyle = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none', width: '100%', boxSizing: 'border-box' };
const deleteBtnSecondaryStyle = { padding: '8px 14px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const deleteBtnPrimaryStyle = { padding: '8px 14px', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
