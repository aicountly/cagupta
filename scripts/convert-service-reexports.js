/**
 * One-time helper: convert module service copies to re-exports.
 * Run from repo root: node scripts/convert-service-reexports.js
 */
const fs = require('fs');
const path = require('path');

const pairs = [
  ['web/src/modules/core/services/dashboardService.js', '../../../services/dashboardService.js'],
  ['web/src/modules/core/services/leaveService.js', '../../../services/leaveService.js'],
  ['web/src/modules/crm/services/organizationService.js', '../../../services/organizationService.js'],
  ['web/src/modules/crm/services/engagementService.js', '../../../services/engagementService.js'],
  ['web/src/modules/crm/services/leadService.js', '../../../services/leadService.js'],
  ['web/src/modules/crm/services/clientGroupService.js', '../../../services/clientGroupService.js'],
  ['web/src/modules/crm/services/quotationService.js', '../../../services/quotationService.js'],
  ['web/src/modules/crm/services/serviceCategoryService.js', '../../../services/serviceCategoryService.js'],
  ['web/src/modules/operations/services/appointmentService.js', '../../../services/appointmentService.js'],
  ['web/src/modules/operations/services/serviceLogService.js', '../../../services/serviceLogService.js'],
  ['web/src/modules/operations/services/zoomIntegrationService.js', '../../../services/zoomIntegrationService.js'],
  ['web/src/modules/operations/services/reportService.js', '../../../services/reportService.js'],
  ['web/src/modules/operations/services/registerService.js', '../../../services/registerService.js'],
  ['web/src/modules/operations/services/portalTypeService.js', '../../../services/portalTypeService.js'],
  ['web/src/modules/operations/services/kycDocumentService.js', '../../../services/kycDocumentService.js'],
  ['web/src/modules/operations/services/credentialService.js', '../../../services/credentialService.js'],
  ['web/src/modules/operations/services/calendarSyncService.js', '../../../services/calendarSyncService.js'],
  ['web/src/modules/operations/services/appointmentFeeRuleService.js', '../../../services/appointmentFeeRuleService.js'],
  ['web/src/modules/finance/services/txnService.js', '../../../services/txnService.js'],
  ['web/src/modules/finance/services/razorpayService.js', '../../../services/razorpayService.js'],
  ['web/src/modules/finance/services/openingBalanceService.js', '../../../services/openingBalanceService.js'],
  ['web/src/modules/partner/services/partnerAdminService.js', '../../../services/partnerAdminService.js'],
];

const root = path.join(__dirname, '..');

for (const [moduleRel, exportPath] of pairs) {
  const name = path.basename(moduleRel);
  const content = `/** Re-export canonical ${name.replace('.js', '')}. @see web/src/services/${name} */\nexport * from '${exportPath}';\n`;
  const full = path.join(root, moduleRel);
  fs.writeFileSync(full, content);
  console.log('wrote', moduleRel);
}

console.log(`Done: ${pairs.length} re-exports`);
