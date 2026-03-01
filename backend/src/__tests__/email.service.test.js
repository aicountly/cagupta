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

const Brevo = require('@getbrevo/brevo');
const emailService = require('../services/email.service');

beforeEach(() => {
  Brevo._mockSendTransacEmail.mockClear();
  process.env.SENDER_EMAIL = 'test@example.com';
  process.env.SENDER_NAME = 'Test CA Firm';
});

describe('sendWelcomeEmail', () => {
  it('calls sendTransacEmail with correct subject', async () => {
    await emailService.sendWelcomeEmail({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      loginUrl: 'https://portal.example.com/login',
    });
    expect(Brevo._mockSendTransacEmail).toHaveBeenCalledTimes(1);
    const arg = Brevo._mockSendTransacEmail.mock.calls[0][0];
    expect(arg.subject).toBe('Welcome to Our CA Portal');
    expect(arg.to).toEqual([{ email: 'client@example.com' }]);
  });
});

describe('sendDocumentSharedEmail', () => {
  it('calls sendTransacEmail with document name in subject', async () => {
    await emailService.sendDocumentSharedEmail({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      documentName: 'ITR_FY2024.pdf',
      downloadUrl: 'https://portal.example.com/docs/1',
    });
    const arg = Brevo._mockSendTransacEmail.mock.calls[0][0];
    expect(arg.subject).toBe('Document Shared: ITR_FY2024.pdf');
  });
});

describe('sendInvoiceRaisedEmail', () => {
  it('calls sendTransacEmail with invoice number in subject', async () => {
    await emailService.sendInvoiceRaisedEmail({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      invoiceNumber: 'INV-2024-001',
      amount: '5000',
      dueDate: '31-Mar-2024',
      invoiceUrl: 'https://portal.example.com/invoices/1',
    });
    const arg = Brevo._mockSendTransacEmail.mock.calls[0][0];
    expect(arg.subject).toBe('Invoice #INV-2024-001 from Your CA Firm');
  });
});

describe('sendAppointmentConfirmationEmail', () => {
  it('calls sendTransacEmail with correct subject', async () => {
    await emailService.sendAppointmentConfirmationEmail({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      appointmentDate: '15-Mar-2024',
      appointmentTime: '11:00 AM',
      staffName: 'CA Priya Sharma',
    });
    const arg = Brevo._mockSendTransacEmail.mock.calls[0][0];
    expect(arg.subject).toBe('Appointment Confirmed');
  });
});

describe('sendPasswordResetEmail', () => {
  it('calls sendTransacEmail with correct subject', async () => {
    await emailService.sendPasswordResetEmail({
      to: 'client@example.com',
      clientName: 'Ramesh Kumar',
      resetUrl: 'https://portal.example.com/reset?token=abc123',
    });
    const arg = Brevo._mockSendTransacEmail.mock.calls[0][0];
    expect(arg.subject).toBe('Reset Your Password');
  });
});
