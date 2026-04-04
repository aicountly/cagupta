const { Router } = require('express');
const emailService = require('../services/email.service');

const router = Router();

/**
 * POST /api/email/welcome
 * Body: { to, clientName, loginUrl }
 */
router.post('/welcome', async (req, res) => {
  const { to, clientName, loginUrl } = req.body;
  if (!to || !clientName || !loginUrl) {
    return res.status(400).json({ error: 'Missing required fields: to, clientName, loginUrl' });
  }
  try {
    await emailService.sendWelcomeEmail({ to, clientName, loginUrl });
    res.json({ success: true, message: 'Welcome email sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/document-shared
 * Body: { to, clientName, documentName, downloadUrl }
 */
router.post('/document-shared', async (req, res) => {
  const { to, clientName, documentName, downloadUrl } = req.body;
  if (!to || !clientName || !documentName || !downloadUrl) {
    return res.status(400).json({ error: 'Missing required fields: to, clientName, documentName, downloadUrl' });
  }
  try {
    await emailService.sendDocumentSharedEmail({ to, clientName, documentName, downloadUrl });
    res.json({ success: true, message: 'Document-shared email sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/invoice-raised
 * Body: { to, clientName, invoiceNumber, amount, dueDate, invoiceUrl }
 */
router.post('/invoice-raised', async (req, res) => {
  const { to, clientName, invoiceNumber, amount, dueDate, invoiceUrl } = req.body;
  if (!to || !clientName || !invoiceNumber || !amount || !dueDate || !invoiceUrl) {
    return res.status(400).json({ error: 'Missing required fields: to, clientName, invoiceNumber, amount, dueDate, invoiceUrl' });
  }
  try {
    await emailService.sendInvoiceRaisedEmail({ to, clientName, invoiceNumber, amount, dueDate, invoiceUrl });
    res.json({ success: true, message: 'Invoice email sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/appointment-confirmation
 * Body: { to, clientName, appointmentDate, appointmentTime, staffName }
 */
router.post('/appointment-confirmation', async (req, res) => {
  const { to, clientName, appointmentDate, appointmentTime, staffName } = req.body;
  if (!to || !clientName || !appointmentDate || !appointmentTime || !staffName) {
    return res.status(400).json({ error: 'Missing required fields: to, clientName, appointmentDate, appointmentTime, staffName' });
  }
  try {
    await emailService.sendAppointmentConfirmationEmail({ to, clientName, appointmentDate, appointmentTime, staffName });
    res.json({ success: true, message: 'Appointment confirmation email sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/password-reset
 * Body: { to, clientName, resetUrl }
 */
router.post('/password-reset', async (req, res) => {
  const { to, clientName, resetUrl } = req.body;
  if (!to || !clientName || !resetUrl) {
    return res.status(400).json({ error: 'Missing required fields: to, clientName, resetUrl' });
  }
  try {
    await emailService.sendPasswordResetEmail({ to, clientName, resetUrl });
    res.json({ success: true, message: 'Password-reset email sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/login-otp
 * Body: { to, userName, otpCode, expiryMinutes }
 */
router.post('/login-otp', async (req, res) => {
  const { to, userName, otpCode, expiryMinutes } = req.body;
  if (!to || !userName || !otpCode) {
    return res.status(400).json({ error: 'Missing required fields: to, userName, otpCode' });
  }
  try {
    await emailService.sendLoginOtpEmail({ to, userName, otpCode, expiryMinutes: expiryMinutes || 10 });
    res.json({ success: true, message: 'Login OTP email sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/password-changed
 * Body: { to, userName, userEmail, changedAt, ipAddress }
 */
router.post('/password-changed', async (req, res) => {
  const { to, userName, userEmail, changedAt, ipAddress } = req.body;
  if (!to || !userName || !userEmail) {
    return res.status(400).json({ error: 'Missing required fields: to, userName, userEmail' });
  }
  try {
    await emailService.sendPasswordChangedEmail({
      to,
      userName,
      userEmail,
      changedAt: changedAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ipAddress: ipAddress || 'Unknown',
    });
    res.json({ success: true, message: 'Password-changed alert sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/contact-activity
 * Body: { to, action, contactName, actorName, actorEmail, timestamp, status }
 */
router.post('/contact-activity', async (req, res) => {
  const { to, action, contactName, actorName, actorEmail, timestamp, status } = req.body;
  if (!to || !action || !contactName) {
    return res.status(400).json({ error: 'Missing required fields: to, action, contactName' });
  }
  try {
    await emailService.sendContactActivityEmail({
      to,
      action,
      contactName,
      actorName:  actorName  || 'Unknown',
      actorEmail: actorEmail || 'Unknown',
      timestamp:  timestamp  || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      status:     status     || 'Unknown',
    });
    res.json({ success: true, message: 'Contact activity alert sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/organization-activity
 * Body: { to, action, orgName, actorName, actorEmail, timestamp, status }
 */
router.post('/organization-activity', async (req, res) => {
  const { to, action, orgName, actorName, actorEmail, timestamp, status } = req.body;
  if (!to || !action || !orgName) {
    return res.status(400).json({ error: 'Missing required fields: to, action, orgName' });
  }
  try {
    await emailService.sendOrganizationActivityEmail({
      to,
      action,
      orgName,
      actorName:  actorName  || 'Unknown',
      actorEmail: actorEmail || 'Unknown',
      timestamp:  timestamp  || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      status:     status     || 'Unknown',
    });
    res.json({ success: true, message: 'Organization activity alert sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
