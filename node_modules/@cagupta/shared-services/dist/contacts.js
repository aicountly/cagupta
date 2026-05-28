function coerceIdArray(val) {
    if (val == null)
        return [];
    if (Array.isArray(val)) {
        return val.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    }
    if (typeof val === 'string') {
        try {
            const p = JSON.parse(val);
            if (Array.isArray(p))
                return coerceIdArray(p);
        }
        catch {
            /* ignore */
        }
    }
    return [];
}
function coerceNameArray(val) {
    if (val == null)
        return [];
    if (Array.isArray(val)) {
        return val.map((s) => (s == null ? '' : String(s))).filter(Boolean);
    }
    if (typeof val === 'string') {
        try {
            const p = JSON.parse(val);
            if (Array.isArray(p))
                return coerceNameArray(p);
        }
        catch {
            /* ignore */
        }
        return val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
}
function lifecycleStatusFromApi(c) {
    const cs = String(c.contact_status ?? c.status ?? '').trim().toLowerCase();
    if (cs === 'active' || cs === 'inactive' || cs === 'prospect')
        return cs;
    return c.is_active === false ? 'inactive' : 'active';
}
export function normalizeContact(c) {
    const parts = [c.first_name, c.last_name].filter(Boolean);
    const displayName = String(c.organization_name || parts.join(' ') || 'Unknown');
    const linkedOrgIds = coerceIdArray(c.linked_org_ids);
    let linkedOrgNames = coerceNameArray(c.linked_org_names);
    if (linkedOrgIds.length > linkedOrgNames.length) {
        linkedOrgNames = linkedOrgIds.map((id, i) => linkedOrgNames[i] || `Organization #${id}`);
    }
    else if (linkedOrgNames.length > linkedOrgIds.length) {
        linkedOrgNames = linkedOrgNames.slice(0, linkedOrgIds.length);
    }
    const linkedOrgsCount = linkedOrgIds.length;
    const organisation = linkedOrgsCount === 1 ? linkedOrgNames[0] || '' : '';
    const id = c.id;
    return {
        id,
        clientCode: String(c.client_code || `CLT-${String(id).padStart(4, '0')}`),
        displayName,
        mobile: String(c.phone || ''),
        email: String(c.email || ''),
        pan: String(c.pan || ''),
        city: String(c.city || ''),
        organisation,
        linkedOrgsCount,
        groupName: String(c.group_name || ''),
        assignedManager: String(c.assigned_manager || c.created_by_name || ''),
        status: lifecycleStatusFromApi(c),
        reference: String(c.reference || ''),
    };
}
export function createContactsService(api) {
    return {
        async getContactsWithMeta(params = {}) {
            const data = await api.get('/admin/contacts', {
                page: params.page,
                per_page: params.perPage,
                search: params.search || undefined,
                status: params.status && params.status !== 'all' ? params.status : undefined,
            });
            const pagination = data.meta?.pagination || {};
            const rows = Array.isArray(data.data) ? data.data : [];
            return {
                contacts: rows.map((r) => normalizeContact(r)),
                total: pagination.total ?? rows.length,
                lastPage: pagination.last_page ?? 1,
            };
        },
    };
}
