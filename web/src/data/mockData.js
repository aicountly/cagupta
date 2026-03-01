// ─── Mock data for UI prototyping ────────────────────────────────────────────

export const mockClients = [
  { id: 'c1', clientCode: 'CLT-0001', displayName: 'Ramesh Agarwal', entityType: 'individual', pan: 'AABPA1234C', gstin: '27AABPA1234C1Z5', status: 'active', primaryPhone: '9876543210', primaryEmail: 'ramesh@example.com', assignedManager: 'CA Rahul Gupta', city: 'Mumbai', onboardingDate: '2022-04-01' },
  { id: 'c2', clientCode: 'CLT-0002', displayName: 'Sunita Enterprises Pvt Ltd', entityType: 'pvt_ltd', pan: 'AACCS5678D', gstin: '27AACCS5678D1Z3', status: 'active', primaryPhone: '9123456789', primaryEmail: 'accounts@sunita.in', assignedManager: 'CA Rahul Gupta', city: 'Pune', onboardingDate: '2021-07-15' },
  { id: 'c3', clientCode: 'CLT-0003', displayName: 'Mehta & Sons LLP', entityType: 'llp', pan: 'AADM9012E', gstin: null, status: 'active', primaryPhone: '9988776655', primaryEmail: 'mehta.sons@gmail.com', assignedManager: 'CA Priya Sharma', city: 'Nashik', onboardingDate: '2023-01-10' },
  { id: 'c4', clientCode: 'CLT-0004', displayName: 'Kavita Desai', entityType: 'individual', pan: 'AAEPK3456F', gstin: null, status: 'inactive', primaryPhone: '9012345678', primaryEmail: 'kavita.d@yahoo.com', assignedManager: 'CA Rahul Gupta', city: 'Mumbai', onboardingDate: '2020-06-01' },
  { id: 'c5', clientCode: 'CLT-0005', displayName: 'Techno Traders', entityType: 'partnership', pan: 'AAFT7890G', gstin: '27AAFT7890G1Z1', status: 'active', primaryPhone: '9876001234', primaryEmail: 'technotraders@business.com', assignedManager: 'CA Priya Sharma', city: 'Thane', onboardingDate: '2022-11-20' },
];

export const mockServices = [
  { id: 's1', clientId: 'c1', clientName: 'Ramesh Agarwal', type: 'ITR Filing', financialYear: '2024-25', status: 'in_progress', assignedTo: 'Staff A', dueDate: '2025-07-31', feeAgreed: 5000 },
  { id: 's2', clientId: 'c1', clientName: 'Ramesh Agarwal', type: 'GST Return', financialYear: '2024-25', status: 'completed', assignedTo: 'Staff B', dueDate: '2025-04-20', feeAgreed: 3000 },
  { id: 's3', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', type: 'Audit', financialYear: '2024-25', status: 'not_started', assignedTo: 'CA Rahul Gupta', dueDate: '2025-09-30', feeAgreed: 50000 },
  { id: 's4', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', type: 'ROC Filing (MGT-7)', financialYear: '2024-25', status: 'pending_info', assignedTo: 'Staff A', dueDate: '2025-11-29', feeAgreed: 8000 },
  { id: 's5', clientId: 'c3', clientName: 'Mehta & Sons LLP', type: 'Book-keeping', financialYear: '2024-25', status: 'in_progress', assignedTo: 'Staff C', dueDate: '2025-12-31', feeAgreed: 24000 },
];

export const mockTasks = [
  { id: 't1', serviceId: 's1', title: 'Collect Form 16 from client', status: 'done', assignedTo: 'Staff A', dueDate: '2025-06-15', priority: 'high' },
  { id: 't2', serviceId: 's1', title: 'Download AIS/TIS from portal', status: 'in_progress', assignedTo: 'Staff A', dueDate: '2025-06-20', priority: 'high' },
  { id: 't3', serviceId: 's1', title: 'Prepare ITR draft', status: 'pending', assignedTo: 'Staff B', dueDate: '2025-07-10', priority: 'medium' },
  { id: 't4', serviceId: 's1', title: 'Get client approval', status: 'pending', assignedTo: 'Staff A', dueDate: '2025-07-20', priority: 'medium' },
  { id: 't5', serviceId: 's1', title: 'File ITR on portal', status: 'pending', assignedTo: 'Staff A', dueDate: '2025-07-31', priority: 'urgent' },
];

export const mockDocuments = [
  { id: 'd1', clientId: 'c1', clientName: 'Ramesh Agarwal', name: 'Form 16 – AY 2024-25', category: 'ITR', financialYear: '2024-25', uploadedBy: 'Staff A', uploadedAt: '2025-06-10', size: '245 KB', sharedWithClient: true },
  { id: 'd2', clientId: 'c1', clientName: 'Ramesh Agarwal', name: 'Bank Statement – HDFC Mar 2025', category: 'Bank Statement', financialYear: '2024-25', uploadedBy: 'Ramesh Agarwal', uploadedAt: '2025-06-12', size: '1.2 MB', sharedWithClient: false },
  { id: 'd3', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', name: 'GSTR-3B – March 2025', category: 'GST', financialYear: '2024-25', uploadedBy: 'Staff B', uploadedAt: '2025-04-22', size: '98 KB', sharedWithClient: true },
  { id: 'd4', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', name: 'Balance Sheet FY 2023-24', category: 'Audit', financialYear: '2023-24', uploadedBy: 'CA Rahul Gupta', uploadedAt: '2024-10-15', size: '3.4 MB', sharedWithClient: true },
];

export const mockInvoices = [
  { id: 'i1', invoiceNumber: 'RG/24-25/001', clientId: 'c1', clientName: 'Ramesh Agarwal', invoiceDate: '2025-04-01', dueDate: '2025-04-15', totalAmount: 5900, amountPaid: 5900, status: 'paid' },
  { id: 'i2', invoiceNumber: 'RG/24-25/002', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', invoiceDate: '2025-04-05', dueDate: '2025-04-30', totalAmount: 35400, amountPaid: 20000, status: 'partially_paid' },
  { id: 'i3', invoiceNumber: 'RG/24-25/003', clientId: 'c3', clientName: 'Mehta & Sons LLP', invoiceDate: '2025-05-01', dueDate: '2025-05-15', totalAmount: 11800, amountPaid: 0, status: 'overdue' },
  { id: 'i4', invoiceNumber: 'RG/24-25/004', clientId: 'c5', clientName: 'Techno Traders', invoiceDate: '2025-05-10', dueDate: '2025-05-31', totalAmount: 8260, amountPaid: 0, status: 'sent' },
];

export const mockAppointments = [
  { id: 'a1', clientName: 'Ramesh Agarwal', staffName: 'CA Rahul Gupta', date: '2025-06-18', startTime: '10:00', endTime: '11:00', mode: 'in_person', subject: 'ITR filing discussion', status: 'confirmed' },
  { id: 'a2', clientName: 'Sunita Enterprises Pvt Ltd', staffName: 'CA Rahul Gupta', date: '2025-06-19', startTime: '14:00', endTime: '15:00', mode: 'video', subject: 'Audit planning', status: 'scheduled' },
  { id: 'a3', clientName: 'Techno Traders', staffName: 'CA Priya Sharma', date: '2025-06-20', startTime: '11:30', endTime: '12:00', mode: 'phone', subject: 'GST query resolution', status: 'scheduled' },
];

export const mockCredentials = [
  { id: 'cr1', clientId: 'c1', clientName: 'Ramesh Agarwal', portalName: 'Income Tax e-Filing Portal', portalUrl: 'https://www.incometax.gov.in', username: 'AABPA1234C', lastChangedAt: '2025-01-15' },
  { id: 'cr2', clientId: 'c1', clientName: 'Ramesh Agarwal', portalName: 'TRACES', portalUrl: 'https://www.tdscpc.gov.in', username: 'ramesh.agarwal@traces', lastChangedAt: '2024-11-20' },
  { id: 'cr3', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', portalName: 'GST Portal', portalUrl: 'https://www.gst.gov.in', username: '27AACCS5678D1Z3', lastChangedAt: '2025-03-01' },
  { id: 'cr4', clientId: 'c2', clientName: 'Sunita Enterprises Pvt Ltd', portalName: 'MCA21', portalUrl: 'https://www.mca.gov.in', username: 'sunita_enterprises_official', lastChangedAt: '2025-02-10' },
];

export const mockLeads = [
  { id: 'l1', contactName: 'Vijay Patil', company: 'Patil Constructions', email: 'vijay@patilconstruct.com', phone: '9876543001', source: 'Referral', stage: 'qualified', probability: 70, estimatedValue: 80000, assignedTo: 'CA Rahul Gupta', nextFollowUp: '2025-06-25' },
  { id: 'l2', contactName: 'Anjali Joshi', company: '', email: 'anjali.j@gmail.com', phone: '9123456001', source: 'Website', stage: 'contacted', probability: 40, estimatedValue: 15000, assignedTo: 'CA Priya Sharma', nextFollowUp: '2025-06-21' },
  { id: 'l3', contactName: 'Ravi Kumar Exports', company: 'RK Exports LLP', email: 'rk@rkexports.in', phone: '9988001234', source: 'Cold Call', stage: 'proposal_sent', probability: 60, estimatedValue: 120000, assignedTo: 'CA Rahul Gupta', nextFollowUp: '2025-06-30' },
];

export const dashboardStats = {
  activeClients: 4,
  activeServices: 5,
  pendingTasks: 3,
  overdueInvoices: 1,
  totalOutstanding: 29600,
  documentsThisMonth: 4,
  appointmentsToday: 2,
  upcomingDeadlines: 3,
};
