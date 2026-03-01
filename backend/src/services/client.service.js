/**
 * In-memory store for client data.
 *
 * People  – individual clients (natural persons).
 * Businesses – firms/companies of any type.
 *
 * A person can be linked to one or more businesses (e.g. a proprietor who
 * also belongs to an HUF and a Pvt Ltd company).
 */

const BUSINESS_TYPES = Object.freeze([
  'proprietary',
  'huf',
  'pvt_ltd',
  'llp',
  'partnership',
  'other',
]);

// Shared state – exported so tests can reset it between runs.
let _people = [];
let _businesses = [];
let _nextPeopleId = 1;
let _nextBusinessId = 1;

/**
 * Reset the store (used in tests).
 */
function reset() {
  _people = [];
  _businesses = [];
  _nextPeopleId = 1;
  _nextBusinessId = 1;
}

/**
 * Seed the store with representative demo data.
 * Called once at module load so the listing pages are populated out of the box.
 * Tests call reset() to wipe this state before each case.
 */
function _seed() {
  _people = [
    { id: 1, name: 'Ramesh Kumar', email: 'ramesh@example.com', phone: '9876543210', pan: 'ABCDE1234F', type: 'individual' },
    { id: 2, name: 'Sunita Sharma', email: 'sunita@example.com', phone: '9123456789', pan: 'FGHIJ5678K', type: 'individual' },
    { id: 3, name: 'Arjun Mehta', email: 'arjun@example.com', phone: '9988776655', pan: 'LMNOP9012Q', type: 'individual' },
    { id: 4, name: 'Priya Nair', email: 'priya@example.com', phone: '9871234560', pan: 'PQRST3456R', type: 'individual' },
  ];
  _businesses = [
    { id: 1, name: 'Kumar Traders', businessType: 'proprietary', pan: 'KUMTR0001P', cin: '', members: [1] },
    { id: 2, name: 'Sharma HUF', businessType: 'huf', pan: 'SRMHF0002H', cin: '', members: [2] },
    { id: 3, name: 'Acme Solutions Pvt Ltd', businessType: 'pvt_ltd', pan: 'ACMSO0003C', cin: 'U72200MH2020PTC123456', members: [1, 3] },
    { id: 4, name: 'XYZ & Associates LLP', businessType: 'llp', pan: 'XYZAS0004L', cin: 'AAA-1234', members: [2, 3] },
    { id: 5, name: 'Metro Constructions', businessType: 'partnership', pan: 'MTRCO0005P', cin: '', members: [4] },
  ];
  _nextPeopleId = _people.length + 1;
  _nextBusinessId = _businesses.length + 1;
}

_seed();

// ── People ────────────────────────────────────────────────────────────────────

/**
 * List all people.
 * @returns {Array} copy of all person records
 */
function listPeople() {
  return _people.map((p) => ({ ...p }));
}

/**
 * Add a new person.
 * @param {{ name: string, email?: string, phone?: string, pan?: string }} data
 * @returns {object} the created person
 */
function addPerson({ name, email = '', phone = '', pan = '' }) {
  if (!name || !name.trim()) throw new Error('name is required');
  const person = {
    id: _nextPeopleId++,
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    pan: pan.trim().toUpperCase(),
    type: 'individual',
  };
  _people.push(person);
  return { ...person };
}

// ── Businesses ────────────────────────────────────────────────────────────────

/**
 * List all businesses.
 * Each business record includes a `members` array of linked person ids.
 * @returns {Array}
 */
function listBusinesses() {
  return _businesses.map((b) => ({ ...b, members: [...b.members] }));
}

/**
 * Add a new business.
 * @param {{ name: string, businessType: string, pan?: string, cin?: string }} data
 * @returns {object} the created business
 */
function addBusiness({ name, businessType, pan = '', cin = '' }) {
  if (!name || !name.trim()) throw new Error('name is required');
  if (!BUSINESS_TYPES.includes(businessType)) {
    throw new Error(
      `businessType must be one of: ${BUSINESS_TYPES.join(', ')}`
    );
  }
  const business = {
    id: _nextBusinessId++,
    name: name.trim(),
    businessType,
    pan: pan.trim().toUpperCase(),
    cin: cin.trim().toUpperCase(),
    members: [],
  };
  _businesses.push(business);
  return { ...business, members: [] };
}

// ── Member mapping ─────────────────────────────────────────────────────────────

/**
 * Link a person to a business.
 * @param {number} businessId
 * @param {number} personId
 * @returns {object} updated business record
 */
function addMember(businessId, personId) {
  const business = _businesses.find((b) => b.id === businessId);
  if (!business) throw new Error(`Business ${businessId} not found`);
  const person = _people.find((p) => p.id === personId);
  if (!person) throw new Error(`Person ${personId} not found`);
  if (!business.members.includes(personId)) {
    business.members.push(personId);
  }
  return { ...business, members: [...business.members] };
}

/**
 * Remove a person from a business.
 * @param {number} businessId
 * @param {number} personId
 * @returns {object} updated business record
 */
function removeMember(businessId, personId) {
  const business = _businesses.find((b) => b.id === businessId);
  if (!business) throw new Error(`Business ${businessId} not found`);
  business.members = business.members.filter((id) => id !== personId);
  return { ...business, members: [...business.members] };
}

/**
 * Get people linked to a business, with full person details.
 * @param {number} businessId
 * @returns {Array} array of person records
 */
function getMembers(businessId) {
  const business = _businesses.find((b) => b.id === businessId);
  if (!business) throw new Error(`Business ${businessId} not found`);
  return business.members
    .map((id) => _people.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ ...p }));
}

module.exports = {
  BUSINESS_TYPES,
  reset,
  listPeople,
  addPerson,
  listBusinesses,
  addBusiness,
  addMember,
  removeMember,
  getMembers,
};
