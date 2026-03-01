jest.mock('@getbrevo/brevo', () => {
  const mockSendTransacEmail = jest.fn().mockResolvedValue({ messageId: 'mock-id' });
  const mockApiInstance = {
    authentications: { apiKey: { apiKey: '' } },
    sendTransacEmail: mockSendTransacEmail,
  };
  return {
    TransactionalEmailsApi: jest.fn(() => mockApiInstance),
    SendSmtpEmail: jest.fn(function () { return this; }),
  };
});

const request = require('supertest');
const app = require('../index');
const clientService = require('../services/client.service');

beforeEach(() => {
  clientService.reset();
});

// ── People report ─────────────────────────────────────────────────────────────

describe('GET /api/clients/people', () => {
  it('returns an empty list initially', async () => {
    const res = await request(app).get('/api/clients/people');
    expect(res.status).toBe(200);
    expect(res.body.people).toEqual([]);
  });

  it('returns added people', async () => {
    await request(app)
      .post('/api/clients/people')
      .send({ name: 'Ramesh Kumar', email: 'ramesh@example.com', pan: 'abcde1234f' });
    const res = await request(app).get('/api/clients/people');
    expect(res.status).toBe(200);
    expect(res.body.people).toHaveLength(1);
    expect(res.body.people[0].name).toBe('Ramesh Kumar');
    expect(res.body.people[0].pan).toBe('ABCDE1234F');
    expect(res.body.people[0].type).toBe('individual');
  });
});

describe('POST /api/clients/people', () => {
  it('returns 201 and the created person', async () => {
    const res = await request(app)
      .post('/api/clients/people')
      .send({ name: 'Sunita Sharma', phone: '9999999999' });
    expect(res.status).toBe(201);
    expect(res.body.person.id).toBe(1);
    expect(res.body.person.name).toBe('Sunita Sharma');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/clients/people')
      .send({ email: 'no-name@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });
});

// ── Business report ───────────────────────────────────────────────────────────

describe('GET /api/clients/businesses', () => {
  it('returns empty list and supported business types', async () => {
    const res = await request(app).get('/api/clients/businesses');
    expect(res.status).toBe(200);
    expect(res.body.businesses).toEqual([]);
    expect(res.body.businessTypes).toEqual(
      expect.arrayContaining(['proprietary', 'huf', 'pvt_ltd', 'llp', 'partnership', 'other'])
    );
  });

  it('returns added businesses', async () => {
    await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Kumar Traders', businessType: 'proprietary' });
    const res = await request(app).get('/api/clients/businesses');
    expect(res.body.businesses).toHaveLength(1);
    expect(res.body.businesses[0].businessType).toBe('proprietary');
  });
});

describe('POST /api/clients/businesses', () => {
  it('returns 201 for a proprietary firm', async () => {
    const res = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Kumar Traders', businessType: 'proprietary', pan: 'AAAAA0000A' });
    expect(res.status).toBe(201);
    expect(res.body.business.name).toBe('Kumar Traders');
    expect(res.body.business.members).toEqual([]);
  });

  it('returns 201 for a HUF firm', async () => {
    const res = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Sharma HUF', businessType: 'huf' });
    expect(res.status).toBe(201);
    expect(res.body.business.businessType).toBe('huf');
  });

  it('returns 201 for a Private Limited Company', async () => {
    const res = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Acme Pvt Ltd', businessType: 'pvt_ltd', cin: 'U12345MH2020PTC123456' });
    expect(res.status).toBe(201);
    expect(res.body.business.businessType).toBe('pvt_ltd');
  });

  it('returns 400 when businessType is missing', async () => {
    const res = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Unnamed Firm' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/businessType/);
  });

  it('returns 400 for an invalid businessType', async () => {
    const res = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Bad Firm', businessType: 'invalid_type' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/businessType/);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/clients/businesses')
      .send({ businessType: 'llp' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });
});

// ── Member mapping ─────────────────────────────────────────────────────────────

describe('Member mapping', () => {
  let personId;
  let businessId;

  beforeEach(async () => {
    const pRes = await request(app)
      .post('/api/clients/people')
      .send({ name: 'Ramesh Kumar' });
    personId = pRes.body.person.id;

    const bRes = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Kumar Traders', businessType: 'proprietary' });
    businessId = bRes.body.business.id;
  });

  it('POST /businesses/:id/members links a person to a business', async () => {
    const res = await request(app)
      .post(`/api/clients/businesses/${businessId}/members`)
      .send({ personId });
    expect(res.status).toBe(200);
    expect(res.body.business.members).toContain(personId);
  });

  it('GET /businesses/:id/members returns linked people', async () => {
    await request(app)
      .post(`/api/clients/businesses/${businessId}/members`)
      .send({ personId });
    const res = await request(app).get(
      `/api/clients/businesses/${businessId}/members`
    );
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].name).toBe('Ramesh Kumar');
  });

  it('DELETE /businesses/:id/members/:personId unlinks a person', async () => {
    await request(app)
      .post(`/api/clients/businesses/${businessId}/members`)
      .send({ personId });
    const res = await request(app).delete(
      `/api/clients/businesses/${businessId}/members/${personId}`
    );
    expect(res.status).toBe(200);
    expect(res.body.business.members).not.toContain(personId);
  });

  it('returns 400 when business does not exist', async () => {
    const res = await request(app)
      .post('/api/clients/businesses/9999/members')
      .send({ personId });
    expect(res.status).toBe(404);
  });

  it('returns 400 when personId is missing', async () => {
    const res = await request(app)
      .post(`/api/clients/businesses/${businessId}/members`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid ID format/);
  });

  it('returns 404 when person does not exist', async () => {
    const res = await request(app)
      .post(`/api/clients/businesses/${businessId}/members`)
      .send({ personId: 9999 });
    expect(res.status).toBe(404);
  });

  it('allows one person to be linked to multiple businesses', async () => {
    const bRes2 = await request(app)
      .post('/api/clients/businesses')
      .send({ name: 'Sharma HUF', businessType: 'huf' });
    const businessId2 = bRes2.body.business.id;

    await request(app)
      .post(`/api/clients/businesses/${businessId}/members`)
      .send({ personId });
    await request(app)
      .post(`/api/clients/businesses/${businessId2}/members`)
      .send({ personId });

    const members1 = await request(app).get(
      `/api/clients/businesses/${businessId}/members`
    );
    const members2 = await request(app).get(
      `/api/clients/businesses/${businessId2}/members`
    );
    expect(members1.body.members[0].name).toBe('Ramesh Kumar');
    expect(members2.body.members[0].name).toBe('Ramesh Kumar');
  });
});
