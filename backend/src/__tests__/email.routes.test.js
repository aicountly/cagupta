jest.mock('@getbrevo/brevo', () => {
  const mockSendTransacEmail = jest.fn().mockResolvedValue({ messageId: 'mock-id' });
  const mockApiInstance = {
    authentications: { apiKey: { apiKey: '' } },
    sendTransacEmail: mockSendTransacEmail,
  };
  return {
    TransactionalEmailsApi: jest.fn(() => mockApiInstance),
    SendSmtpEmail: jest.fn(function () { return this; }),
    _mockSendTransacEmail: mockSendTransacEmail,
  };
});

const request = require('supertest');
const app = require('../index');

beforeEach(() => {
  const Brevo = require('@getbrevo/brevo');
  Brevo._mockSendTransacEmail.mockClear();
  process.env.SENDER_EMAIL = 'test@example.com';
  process.env.SENDER_NAME = 'Test CA Firm';
});

describe('POST /api/email/welcome', () => {
  it('returns 200 when all fields are provided', async () => {
    const res = await request(app).post('/api/email/welcome').send({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      loginUrl: 'https://portal.example.com/login',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when a required field is missing', async () => {
    const res = await request(app).post('/api/email/welcome').send({
      to: 'client@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/);
  });
});

describe('POST /api/email/document-shared', () => {
  it('returns 200 when all fields are provided', async () => {
    const res = await request(app).post('/api/email/document-shared').send({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      documentName: 'ITR_FY2024.pdf',
      downloadUrl: 'https://portal.example.com/docs/1',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/email/invoice-raised', () => {
  it('returns 200 when all fields are provided', async () => {
    const res = await request(app).post('/api/email/invoice-raised').send({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      invoiceNumber: 'INV-2024-001',
      amount: '5000',
      dueDate: '31-Mar-2024',
      invoiceUrl: 'https://portal.example.com/invoices/1',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/email/appointment-confirmation', () => {
  it('returns 200 when all fields are provided', async () => {
    const res = await request(app).post('/api/email/appointment-confirmation').send({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      appointmentDate: '15-Mar-2024',
      appointmentTime: '11:00 AM',
      staffName: 'CA Priya Sharma',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/email/password-reset', () => {
  it('returns 200 when all fields are provided', async () => {
    const res = await request(app).post('/api/email/password-reset').send({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      resetUrl: 'https://portal.example.com/reset?token=abc123',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
