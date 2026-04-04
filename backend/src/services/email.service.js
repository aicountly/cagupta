const Brevo = require('@getbrevo/brevo');
const fs = require('fs');
const path = require('path');
const { apiInstance } = require('../config/brevo');

const SENDER = {
  email: process.env.SENDER_EMAIL,
  name: process.env.SENDER_NAME,
};

/**
 * Load an HTML email template and replace {{placeholder}} tokens.
 * @param {string} templateName - Filename without extension (e.g. 'welcome').
 * @param {Object} variables    - Key/value pairs to substitute.
 * @returns {string} Rendered HTML string.
 */
function loadTemplate(templateName, variables = {}) {
  const filePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

/**
 * Low-level helper — send a transactional email via Brevo.
 * @param {Object} options
 * @param {string|string[]} options.to         - Recipient email or array of emails.
 * @param {string}          options.subject    - Email subject line.
 * @param {string}          options.htmlContent - Rendered HTML body.
 */
async function sendEmail({ to, subject, htmlContent }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email }));

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.sender = SENDER;
  sendSmtpEmail.to = recipients;
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  return apiInstance.sendTransacEmail(sendSmtpEmail);
}

// ─── High-level notification helpers ────────────────────────────────────────

/**
 * Send a welcome email to a newly onboarded client.
 */
async function sendWelcomeEmail({ to, clientName, loginUrl }) {
  const htmlContent = loadTemplate('welcome', { clientName, loginUrl });
  return sendEmail({ to, subject: 'Welcome to Our CA Portal', htmlContent });
}

/**
 * Notify a client that a document has been shared with them.
 */
async function sendDocumentSharedEmail({ to, clientName, documentName, downloadUrl }) {
  const htmlContent = loadTemplate('document-shared', { clientName, documentName, downloadUrl });
  return sendEmail({ to, subject: `Document Shared: ${documentName}`, htmlContent });
}

/**
 * Send an invoice notification to a client.
 */
async function sendInvoiceRaisedEmail({ to, clientName, invoiceNumber, amount, dueDate, invoiceUrl }) {
  const htmlContent = loadTemplate('invoice-raised', {
    clientName,
    invoiceNumber,
    amount,
    dueDate,
    invoiceUrl,
  });
  return sendEmail({ to, subject: `Invoice #${invoiceNumber} from Your CA Firm`, htmlContent });
}

/**
 * Send an appointment confirmation to a client.
 */
async function sendAppointmentConfirmationEmail({ to, clientName, appointmentDate, appointmentTime, staffName }) {
  const htmlContent = loadTemplate('appointment-confirmation', {
    clientName,
    appointmentDate,
    appointmentTime,
    staffName,
  });
  return sendEmail({ to, subject: 'Appointment Confirmed', htmlContent });
}

/**
 * Send a password-reset / OTP email.
 */
async function sendPasswordResetEmail({ to, clientName, resetUrl }) {
  const htmlContent = loadTemplate('password-reset', { clientName, resetUrl });
  return sendEmail({ to, subject: 'Reset Your Password', htmlContent });
}

/**
 * Send a login OTP email to a portal user.
 */
async function sendLoginOtpEmail({ to, userName, otpCode, expiryMinutes }) {
  const htmlContent = loadTemplate('login-otp', { userName, otpCode, expiryMinutes });
  return sendEmail({ to, subject: 'Your Login OTP - CA Rahul Gupta', htmlContent });
}

/**
 * Send a password-changed security alert to the affected user.
 */
async function sendPasswordChangedEmail({ to, userName, userEmail, changedAt, ipAddress }) {
  const htmlContent = loadTemplate('password-changed', { userName, userEmail, changedAt, ipAddress });
  return sendEmail({ to, subject: 'Password Changed Successfully - CA Rahul Gupta', htmlContent });
}

/**
 * Send a contact activity alert to the Superadmin.
 */
async function sendContactActivityEmail({ to, action, contactName, actorName, actorEmail, timestamp, status }) {
  const htmlContent = loadTemplate('contact-activity', { action, contactName, actorName, actorEmail, timestamp, status });
  return sendEmail({ to, subject: `Contact ${action} Alert - CA Rahul Gupta`, htmlContent });
}

/**
 * Send an organization activity alert to the Superadmin.
 */
async function sendOrganizationActivityEmail({ to, action, orgName, actorName, actorEmail, timestamp, status }) {
  const htmlContent = loadTemplate('organization-activity', { action, orgName, actorName, actorEmail, timestamp, status });
  return sendEmail({ to, subject: `Organization ${action} Alert - CA Rahul Gupta`, htmlContent });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendDocumentSharedEmail,
  sendInvoiceRaisedEmail,
  sendAppointmentConfirmationEmail,
  sendPasswordResetEmail,
  sendLoginOtpEmail,
  sendPasswordChangedEmail,
  sendContactActivityEmail,
  sendOrganizationActivityEmail,
};
