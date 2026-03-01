const { Router } = require('express');
const clientService = require('../services/client.service');

const router = Router();

// ── People report ─────────────────────────────────────────────────────────────

/**
 * GET /api/clients/people
 * Returns a list of all individual clients (people).
 */
router.get('/people', (_req, res) => {
  res.json({ people: clientService.listPeople() });
});

/**
 * POST /api/clients/people
 * Body: { name, email?, phone?, pan? }
 * Creates a new individual client.
 */
router.post('/people', (req, res) => {
  const { name, email, phone, pan } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing required field: name' });
  }
  try {
    const person = clientService.addPerson({ name, email, phone, pan });
    res.status(201).json({ person });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Business report ───────────────────────────────────────────────────────────

/**
 * GET /api/clients/businesses
 * Returns a list of all business clients (firms).
 * Supported businessType values: proprietary, huf, pvt_ltd, llp, partnership, other
 */
router.get('/businesses', (_req, res) => {
  res.json({
    businessTypes: clientService.BUSINESS_TYPES,
    businesses: clientService.listBusinesses(),
  });
});

/**
 * POST /api/clients/businesses
 * Body: { name, businessType, pan?, cin? }
 * Creates a new business client.
 */
router.post('/businesses', (req, res) => {
  const { name, businessType, pan, cin } = req.body;
  if (!name || !businessType) {
    return res
      .status(400)
      .json({ error: 'Missing required fields: name, businessType' });
  }
  try {
    const business = clientService.addBusiness({ name, businessType, pan, cin });
    res.status(201).json({ business });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Member mapping ─────────────────────────────────────────────────────────────

/**
 * GET /api/clients/businesses/:id/members
 * Returns people linked to a business.
 */
router.get('/businesses/:id/members', (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  if (isNaN(businessId)) {
    return res.status(400).json({ error: 'Invalid business ID' });
  }
  try {
    const members = clientService.getMembers(businessId);
    res.json({ members });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/clients/businesses/:id/members
 * Body: { personId }
 * Links a person to a business.
 */
router.post('/businesses/:id/members', (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  const personId = parseInt(req.body.personId, 10);
  if (isNaN(businessId) || isNaN(personId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  try {
    const business = clientService.addMember(businessId, personId);
    res.json({ business });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * DELETE /api/clients/businesses/:id/members/:personId
 * Unlinks a person from a business.
 */
router.delete('/businesses/:id/members/:personId', (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  const personId = parseInt(req.params.personId, 10);
  if (isNaN(businessId) || isNaN(personId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  try {
    const business = clientService.removeMember(businessId, personId);
    res.json({ business });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
