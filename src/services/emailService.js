/**
 * emailService.js — Resend HTTPS API (replaces Nodemailer SMTP)
 *
 * Why: Render Free Plan blocks outbound SMTP ports 25, 465, 587.
 *      Resend uses HTTPS (port 443) which is never blocked.
 *
 * Required env vars:
 *   RESEND_API_KEY  — from https://resend.com/api-keys
 *   EMAIL_FROM      — e.g. "Altera Interior <noreply@alterainterior.com>"
 *                     (domain must be verified in Resend dashboard)
 *                     For initial testing use: "onboarding@resend.dev"
 */

const { Resend } = require("resend");

// Lazy client — instantiated only when first send is attempted.
// This prevents a startup crash when RESEND_API_KEY is not yet configured.
let _resendClient = null;
function getResend() {
  if (!_resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        "RESEND_API_KEY is not set. Add it to your .env / Render environment variables.",
      );
    }
    _resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return _resendClient;
}

const FROM_ADDRESS =
  process.env.EMAIL_FROM || '"Altera Interior" <onboarding@resend.dev>';

// ─── Internal helper ────────────────────────────────────────────────────────

/**
 * Sends a single email via Resend HTTPS API.
 * Returns { success, messageId } or throws on error.
 * Never logs actual OTP values or API keys.
 */
async function _send({ from, to, cc, subject, html, attachments }) {
  const payload = {
    from: from || FROM_ADDRESS,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((att) => ({
      filename: att.filename,
      content:
        typeof att.content === "string"
          ? Buffer.from(att.content, att.encoding || "base64")
          : att.content,
    }));
  }

  const { data, error } = await getResend().emails.send(payload);
  if (error) {
    throw new Error(
      `Resend API error: ${error.message || JSON.stringify(error)}`,
    );
  }
  return { success: true, messageId: data?.id };
}

// ─── Public functions (same signatures as before) ───────────────────────────

/**
 * Send an email verification link on registration.
 */
const sendVerificationEmail = async (to, name, token) => {
  const appUrl = process.env.APP_URL || "http://localhost:5001";
  const verificationLink = `${appUrl}/api/auth/verify-email?token=${token}`;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #D60000; text-align: center;">Welcome to EMS, ${name}!</h2>
      <p>Thank you for registering. To complete your account setup and access the application, please verify your email address by clicking the button below.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #D60000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email</a>
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #555;">
        <a href="${verificationLink}">${verificationLink}</a>
      </p>
      <p>This link will expire in 24 hours.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #888; text-align: center;">If you did not request this, please ignore this email.</p>
    </div>
  `;

  try {
    const result = await _send({
      to,
      subject: "Please verify your email address",
      html,
    });
    console.log("✅ Verification email sent. MessageId:", result.messageId);
    return true;
  } catch (error) {
    console.error("❌ Error sending verification email:", error.message);
    return false;
  }
};

/**
 * Send an email with report attachments.
 */
const sendReportEmail = async ({
  to,
  subject,
  message,
  reportType,
  period,
  attachments = [],
}) => {
  const recipients = Array.isArray(to) ? to : [to];

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px;">
      <div style="text-align: center; border-bottom: 2px solid #7A131A; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #7A131A; margin: 0; font-size: 24px; letter-spacing: 1px;">ALTERA INTERIOR</h1>
        <p style="color: #666666; margin: 4px 0 0 0; font-size: 13px;">The Modern Home Maker • Report</p>
      </div>
      <h2 style="color: #111111; font-size: 18px; margin-bottom: 8px;">${reportType} Report — ${period}</h2>
      <p style="color: #555555; font-size: 14px; line-height: 1.6;">${message ? message.replace(/\n/g, "<br/>") : "Please find the requested report attached."}</p>
      <p style="font-size: 13px; color: #777777; line-height: 1.5;">
        The requested report file is attached to this email. You can open, download, or import it into your financial software.
      </p>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0 16px 0;" />
      <p style="font-size: 11px; color: #999999; text-align: center; margin: 0;">
        © ${new Date().getFullYear()} Altera Interior. All rights reserved. This is an automated email from your EMS application.
      </p>
    </div>
  `;

  try {
    const result = await _send({
      from:
        process.env.EMAIL_FROM ||
        '"Altera Interior" <reports@alterainterior.com>',
      to: recipients,
      subject: subject || `[Altera Interior] ${reportType} Report - ${period}`,
      html,
      attachments,
    });
    console.log(
      "✅ Report email sent successfully. MessageId:",
      result.messageId,
    );
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending report email:", error.message);
    throw error;
  }
};

/**
 * Send an email with a payslip attachment.
 */
const sendPayslipEmail = async ({
  to,
  employeeName,
  employeeId,
  month,
  netSalary,
  customMessage,
  attachments = [],
}) => {
  const recipients = Array.isArray(to) ? to : [to];
  const formattedSalary = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(netSalary || 0);

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px;">
      <div style="text-align: center; border-bottom: 2px solid #7A131A; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #7A131A; margin: 0; font-size: 24px; letter-spacing: 1px;">ALTERA INTERIOR</h1>
        <p style="color: #666666; margin: 4px 0 0 0; font-size: 13px;">The Modern Home Maker • Employee Payroll</p>
      </div>

      <div style="margin-bottom: 20px;">
        <h2 style="color: #111111; font-size: 18px; margin-bottom: 8px;">Monthly Payslip - ${month}</h2>
        <p style="color: #444444; font-size: 14px; line-height: 1.6; margin: 0;">
          Dear <strong>${employeeName}</strong>,
        </p>
        <p style="color: #555555; font-size: 14px; line-height: 1.6; margin-top: 8px;">
          ${customMessage ? customMessage.replace(/\n/g, "<br/>") : "Your salary statement and official payslip for the month of " + month + " has been processed. Please review the summary below and find your complete payslip attached as a PDF."}
        </p>
      </div>

      <div style="background-color: #FFF5F5; border-radius: 8px; padding: 18px; margin-bottom: 24px; border: 1px solid #FEB2B2;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #7A131A; font-weight: 600; font-size: 13px;">Employee ID:</span>
          <span style="color: #111; font-weight: 700; font-size: 13px; font-family: monospace;">${employeeId || "—"}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #7A131A; font-weight: 600; font-size: 13px;">Pay Period:</span>
          <span style="color: #111; font-weight: 700; font-size: 13px;">${month}</span>
        </div>
        <hr style="border: none; border-top: 1px dashed #E2E8F0; margin: 10px 0;" />
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #1A202C; font-weight: 700; font-size: 15px;">Net Payable Salary:</span>
          <span style="color: #10B981; font-weight: 800; font-size: 20px;">${formattedSalary}</span>
        </div>
      </div>

      <p style="font-size: 13px; color: #666666; line-height: 1.5;">
        This document contains confidential compensation information. If you have any inquiries regarding your attendance deductions or tax withholdings, please contact the HR or Finance department.
      </p>

      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0 16px 0;" />
      <p style="font-size: 11px; color: #999999; text-align: center; margin: 0;">
        © ${new Date().getFullYear()} Altera Interior. All rights reserved. Generated automatically via Altera Payroll System.
      </p>
    </div>
  `;

  try {
    const result = await _send({
      from:
        process.env.EMAIL_FROM ||
        '"Altera Payroll" <payroll@alterainterior.com>',
      to: recipients,
      subject: `[Altera Interior] Payslip for ${month} - ${employeeName}`,
      html,
      attachments,
    });
    console.log(
      "✅ Payslip email sent successfully. MessageId:",
      result.messageId,
    );
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending payslip email:", error.message);
    throw error;
  }
};

/**
 * Send an email with a quotation PDF attachment.
 */
const sendQuotationEmail = async ({
  to,
  cc,
  clientName,
  quotationNumber,
  projectTitle,
  grandTotal,
  publicUrl,
  message,
  attachments = [],
}) => {
  const recipients = Array.isArray(to) ? to : [to];
  const ccRecipients = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;
  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(grandTotal || 0);

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 680px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px;">
      <div style="text-align: center; border-bottom: 2px solid #7A131A; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #7A131A; margin: 0; font-size: 24px; letter-spacing: 1px;">ALTERA INTERIOR</h1>
        <p style="color: #666666; margin: 4px 0 0 0; font-size: 13px;">The Modern Home Maker • Interior | Architect | Construction</p>
      </div>

      <div style="margin-bottom: 20px;">
        <h2 style="color: #111111; font-size: 18px; margin-bottom: 8px;">Quotation Proposal - ${quotationNumber}</h2>
        <p style="color: #444444; font-size: 14px; line-height: 1.6; margin: 0;">
          Dear <strong>${clientName}</strong>,
        </p>
        <p style="color: #555555; font-size: 14px; line-height: 1.6; margin-top: 8px;">
          ${message ? message.replace(/\n/g, "<br/>") : "Thank you for choosing Altera Interior for your project. Please find attached the itemized quotation proposal for " + (projectTitle || "your interior project") + ". We have detailed all room-wise work items, material specifications, and payment milestones."}
        </p>
      </div>

      <div style="background-color: #F8FAFC; border-radius: 8px; padding: 18px; margin-bottom: 24px; border: 1px solid #E2E8F0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #64748B; font-weight: 600; font-size: 13px;">Quotation Reference:</span>
          <span style="color: #7A131A; font-weight: 800; font-size: 13px; font-family: monospace;">${quotationNumber}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #64748B; font-weight: 600; font-size: 13px;">Project Name:</span>
          <span style="color: #1E293B; font-weight: 700; font-size: 13px;">${projectTitle || "Interior Project"}</span>
        </div>
        <hr style="border: none; border-top: 1px dashed #CBD5E1; margin: 10px 0;" />
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #1E293B; font-weight: 700; font-size: 15px;">Estimated Grand Total (incl. GST):</span>
          <span style="color: #7A131A; font-weight: 800; font-size: 20px;">${formattedTotal}</span>
        </div>
      </div>

      ${
        publicUrl
          ? `<div style="text-align: center; margin: 25px 0;">
        <a href="${publicUrl}" style="background-color: #7A131A; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;">
          View &amp; Approve Quotation Online
        </a>
      </div>`
          : ""
      }

      <p style="font-size: 13px; color: #64748B; line-height: 1.5;">
        The detailed quotation document is attached to this email as a PDF. Feel free to review the room specifications, hardware selections, and milestones. If you require any design variations or clarifications, please reply to this email.
      </p>

      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0 16px 0;" />
      <p style="font-size: 11px; color: #94A3B8; text-align: center; margin: 0;">
        © ${new Date().getFullYear()} Altera Interior. All rights reserved. Automated quotation notification.
      </p>
    </div>
  `;

  try {
    const result = await _send({
      from:
        process.env.EMAIL_FROM ||
        '"Altera Interior" <quotations@alterainterior.com>',
      to: recipients,
      cc: ccRecipients,
      subject: `[Altera Interior] Quotation ${quotationNumber} - ${projectTitle || "Interior Proposal"}`,
      html,
      attachments,
    });
    console.log(
      "✅ Quotation email sent successfully. MessageId:",
      result.messageId,
    );
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending quotation email:", error.message);
    throw error;
  }
};

/**
 * Send an email with a 6-digit OTP for password reset.
 * NOTE: The `otp` parameter is the plaintext OTP for display only.
 *       It is never logged here. Hashing happens in authController.
 */
const sendPasswordResetOtp = async (to, otp) => {
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; border-bottom: 2px solid #7A131A; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #7A131A; margin: 0; font-size: 24px; letter-spacing: 1px;">ALTERA INTERIOR</h1>
        <p style="color: #666666; margin: 4px 0 0 0; font-size: 13px;">Password Recovery Verification</p>
      </div>
      <h2 style="color: #111111; font-size: 18px; margin-bottom: 12px; text-align: center;">Your Password Reset Code</h2>
      <p style="color: #444444; font-size: 14px; line-height: 1.6; text-align: center;">We received a request to reset your password. Use the verification code below to proceed:</p>
      <div style="text-align: center; margin: 28px 0; background-color: #FFF5F5; border: 1px solid #FEB2B2; border-radius: 8px; padding: 18px;">
        <span style="color: #7A131A; letter-spacing: 8px; font-size: 38px; font-weight: 800; font-family: monospace;">${otp}</span>
      </div>
      <p style="color: #666666; font-size: 13px; line-height: 1.5; text-align: center;">
        ⏰ <strong>This code is valid for 5 minutes.</strong> For your security, do not share this code with anyone.
      </p>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0 16px 0;" />
      <p style="font-size: 12px; color: #888888; text-align: center; margin: 0;">
        If you did not request a password reset, please ignore this email or contact your administrator immediately.
      </p>
    </div>
  `;

  try {
    const result = await _send({
      from:
        process.env.EMAIL_FROM ||
        '"Altera Interior" <onboarding@resend.dev>',
      to,
      subject: "Your Password Reset Verification Code",
      html,
    });
    console.log(
      "✅ Password reset OTP email sent. MessageId:",
      result.messageId,
    );
    return true;
  } catch (error) {
    console.error("❌ Error sending password reset OTP email:", error.message);
    throw error;
  }
};

/**
 * Send password-changed security confirmation email.
 */
const sendPasswordResetConfirmation = async (to, name) => {
  const resetTime = new Date().toLocaleString("en-IN");

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px;">
      <div style="text-align: center; border-bottom: 2px solid #7A131A; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #7A131A; margin: 0; font-size: 24px; letter-spacing: 1px;">ALTERA INTERIOR</h1>
        <p style="color: #666666; margin: 4px 0 0 0; font-size: 13px;">Security Notification</p>
      </div>
      <h2 style="color: #111111; font-size: 18px; margin-bottom: 12px; text-align: center;">Password Changed Successfully</h2>
      <p style="color: #444444; font-size: 14px; line-height: 1.6;">
        Hello${name ? " <strong>" + name + "</strong>" : ""},
      </p>
      <p style="color: #555555; font-size: 14px; line-height: 1.6;">
        Your account password has been changed successfully. If you made this change, no further action is required.
      </p>
      <div style="background-color: #F8FAFC; border-left: 4px solid #7A131A; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 4px 0; font-size: 13px; color: #333333;"><strong>Time:</strong> ${resetTime}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #333333;"><strong>Status:</strong> Completed</p>
      </div>
      <p style="color: #D60000; font-size: 13px; line-height: 1.5; font-weight: 600;">
        ⚠️ If you did NOT initiate this password reset, please contact your System Administrator immediately to secure your account.
      </p>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0 16px 0;" />
      <p style="font-size: 11px; color: #999999; text-align: center; margin: 0;">
        © ${new Date().getFullYear()} Altera Interior. All rights reserved.
      </p>
    </div>
  `;

  try {
    const result = await _send({
      from:
        process.env.EMAIL_FROM ||
        '"Altera Interior" <noreply@alterainterior.com>',
      to,
      subject: "Security Alert: Password Changed Successfully",
      html,
    });
    console.log(
      "✅ Password reset confirmation sent. MessageId:",
      result.messageId,
    );
    return true;
  } catch (error) {
    console.error(
      "❌ Error sending password reset confirmation email:",
      error.message,
    );
    return false;
  }
};

const { COMPANY_LOGO_DATA_URL } = require("../constants/companyLogo");

/**
 * Send Offer Letter Email to Candidate.
 */
const sendOfferLetterEmail = async ({
  to,
  candidateName,
  designation,
  joiningDate,
  offerLetterNumber,
  publicUrl,
  attachments = [],
}) => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 650px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #FFFFFF;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${COMPANY_LOGO_DATA_URL}" alt="Altera Interior Logo" style="height: 52px; width: auto; max-width: 270px; margin-bottom: 8px;" />
        <p style="color: #64748B; font-size: 13px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Official Employment Offer</p>
      </div>

      <p style="font-size: 15px; color: #1E293B; line-height: 1.6;">
        Dear <strong>${candidateName}</strong>,
      </p>

      <p style="font-size: 15px; color: #334155; line-height: 1.6;">
        We are delighted to offer you the position of <strong>${designation}</strong> at <strong>Altera Interior</strong>!
        Your expected joining date is <strong>${joiningDate}</strong>.
      </p>

      <div style="background-color: #F8FAFC; border-left: 4px solid #9F0B22; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;">
          <strong>Offer Letter Ref:</strong> ${offerLetterNumber}
        </p>
        <p style="margin: 0; font-size: 14px; color: #475569;">
          <strong>Designation:</strong> ${designation}
        </p>
      </div>

      <p style="font-size: 14px; color: #334155; line-height: 1.6;">
        Please find your official Offer Letter attached to this email as a PDF document.
      </p>

      ${
        publicUrl
          ? `<div style="text-align: center; margin: 30px 0;">
        <a href="${publicUrl}" target="_blank" style="background-color: #9F0B22; color: #FFFFFF; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
          View &amp; Respond Online
        </a>
      </div>`
          : ""
      }

      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 16px 0;" />
      <p style="font-size: 12px; color: #94A3B8; text-align: center; margin: 0;">
        © ${new Date().getFullYear()} Altera Interior. All rights reserved.
      </p>
    </div>
  `;

  try {
    const result = await _send({
      from: process.env.EMAIL_FROM || '"Altera HR" <hr@alterainterior.com>',
      to,
      subject: `Employment Offer Letter (${offerLetterNumber}) - Altera Interior`,
      html,
      attachments,
    });
    console.log("✅ Offer letter email sent. MessageId:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending offer letter email:", error.message);
    throw error;
  }
};

// ─── Exports (identical to old nodemailer version) ───────────────────────────
module.exports = {
  sendVerificationEmail,
  sendReportEmail,
  sendPayslipEmail,
  sendQuotationEmail,
  sendOfferLetterEmail,
  sendPasswordResetOtp,
  sendPasswordResetConfirmation,
};
