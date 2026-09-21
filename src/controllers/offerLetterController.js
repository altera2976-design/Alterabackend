const mongoose = require('mongoose');
const OfferLetter = require('../models/OfferLetter');
const { sendOfferLetterEmail } = require('../services/emailService');

/**
 * Generate next sequential Offer Letter Number (e.g. OFR-2026-0001)
 */
async function generateOfferNumber() {
  const currentYear = new Date().getFullYear();
  const prefix = `OFR-${currentYear}-`;

  const latestDoc = await OfferLetter.findOne({
    offerLetterNumber: new RegExp(`^${prefix}`),
  })
    .sort({ createdAt: -1 })
    .exec();

  if (!latestDoc || !latestDoc.offerLetterNumber) {
    return `${prefix}0001`;
  }

  const lastSeqStr = latestDoc.offerLetterNumber.replace(prefix, '');
  const lastSeq = parseInt(lastSeqStr, 10);
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Helper to find offer letter by publicToken or _id
 */
async function findOfferByTokenOrId(token) {
  if (!token) return null;
  let doc = await OfferLetter.findOne({ publicToken: token });
  if (!doc && mongoose.Types.ObjectId.isValid(token)) {
    doc = await OfferLetter.findById(token);
  }
  return doc;
}

/**
 * Create a new Offer Letter (Draft)
 */
const createOfferLetter = async (req, res) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    const userEmail = (req.user?.email || '').toLowerCase();
    const isSuper = userRole === 'SUPER_ADMIN' || userEmail === 'admin@alterainterior.com' || userEmail === 'admin@company.com';
    const isAdmin = userRole === 'ADMIN' || userRole.includes('ADMIN') || isSuper;

    // Verify Admin or create permission
    if (!isAdmin && !req.user?.permissions?.offerLetters?.create) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to create offer letters.',
      });
    }

    const {
      candidateName,
      fatherGuardianName,
      address,
      mobile,
      email,
      designation,
      department,
      joiningDate,
      employmentType,
      reportingManager,
      workLocation,
      probationPeriod,
      noticePeriod,
      monthlySalary,
      annualCTC,
      salaryPaymentCycle,
      greetingText,
      offerParagraph,
      rulesAndRegulations,
    } = req.body;

    const offerLetterNumber = await generateOfferNumber();
    const defaultRules = OfferLetter.getDefaultRules();

    const offerLetter = new OfferLetter({
      offerLetterNumber,
      offerLetterDate: req.body.offerLetterDate || new Date(),
      candidateName: candidateName || 'Candidate',
      fatherGuardianName: fatherGuardianName || 'N/A',
      address: address || 'N/A',
      mobile: mobile || 'N/A',
      email: email || 'candidate@example.com',
      designation: designation || 'Employee',
      department: department || 'Operations',
      joiningDate: joiningDate || new Date(),
      employmentType: employmentType || 'Full Time',
      reportingManager: reportingManager || 'Management / HR',
      workLocation: workLocation || 'Gurugram, Haryana',
      probationPeriod: probationPeriod || '3 Months',
      noticePeriod: noticePeriod || '30 Days',
      monthlySalary: Number(monthlySalary) || 0,
      annualCTC: Number(annualCTC) || 0,
      salaryPaymentCycle:
        salaryPaymentCycle ||
        'Salary will be credited / paid on or before the 10th of every month, subject to attendance, approved leave and applicable company policies.',
      greetingText: greetingText || `Dear ${candidateName || 'Candidate'},`,
      offerParagraph:
        offerParagraph ||
        `We are pleased to offer you employment with Altera Interior for the position of ${designation || 'Employee'}. Based on your profile, skills and discussions with the company, we believe that you can contribute positively to our team and ongoing projects.`,
      rulesAndRegulations:
        Array.isArray(rulesAndRegulations) && rulesAndRegulations.length > 0
          ? rulesAndRegulations
          : defaultRules,
      status: 'DRAFT',
      createdBy: req.user?._id,
      createdByName: req.user?.name || 'Administrator',
      auditLogs: [
        {
          user: req.user?._id,
          userName: req.user?.name || 'Administrator',
          userRole: req.user?.role || 'ADMIN',
          action: 'Offer letter created as draft',
          timestamp: new Date(),
          ip: req.ip || '',
          details: `Created for candidate ${candidateName || 'Candidate'} (${email}) for position ${designation || 'Employee'}`,
        },
      ],
    });

    await offerLetter.save();

    return res.status(201).json({
      success: true,
      message: 'Offer letter draft created successfully.',
      offerLetter,
    });
  } catch (error) {
    console.error('Error creating offer letter:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create offer letter.',
    });
  }
};

/**
 * List Offer Letters with search, filter, and metrics summary
 */
const getOfferLetters = async (req, res) => {
  try {
    const {
      search,
      status,
      department,
      designation,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { candidateName: { $regex: search, $options: 'i' } },
        { offerLetterNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (department && department !== 'ALL') {
      filter.department = department;
    }

    if (designation && designation !== 'ALL') {
      filter.designation = designation;
    }

    if (startDate || endDate) {
      filter.joiningDate = {};
      if (startDate) filter.joiningDate.$gte = new Date(startDate);
      if (endDate) filter.joiningDate.$lte = new Date(endDate);
    }

    const totalDocs = await OfferLetter.countDocuments(filter);
    const offerLetters = await OfferLetter.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name email role')
      .populate('releasedBy', 'name email role')
      .exec();

    // Aggregate counts by status
    const allRecords = await OfferLetter.find({}, 'status').exec();
    const stats = {
      total: allRecords.length,
      draft: allRecords.filter((r) => r.status === 'DRAFT').length,
      pending: allRecords.filter((r) => r.status === 'PENDING_APPROVAL').length,
      released: allRecords.filter((r) => r.status === 'RELEASED').length,
      accepted: allRecords.filter((r) => r.status === 'ACCEPTED').length,
      rejected: allRecords.filter((r) => r.status === 'REJECTED').length,
      revoked: allRecords.filter((r) => r.status === 'REVOKED').length,
      expired: allRecords.filter((r) => r.status === 'EXPIRED').length,
    };

    return res.json({
      success: true,
      offerLetters,
      totalDocs,
      page: Number(page),
      totalPages: Math.ceil(totalDocs / limit),
      stats,
    });
  } catch (error) {
    console.error('Error fetching offer letters:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch offer letters.',
    });
  }
};

/**
 * Get single Offer Letter by ID
 */
const getOfferLetterById = async (req, res) => {
  try {
    const offerLetter = await OfferLetter.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('releasedBy', 'name email role')
      .populate('revokedBy', 'name email role')
      .exec();

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found.',
      });
    }

    return res.json({
      success: true,
      offerLetter,
    });
  } catch (error) {
    console.error('Error fetching offer letter details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load offer letter details.',
    });
  }
};

/**
 * Update Offer Letter (Draft/Pending only)
 */
const updateOfferLetter = async (req, res) => {
  try {
    const offerLetter = await OfferLetter.findById(req.params.id);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found.',
      });
    }

    const isSuper = req.user?.role === 'SUPER_ADMIN';

    // Lock edit if already RELEASED or ACCEPTED unless Super Admin
    if (!isSuper && ['RELEASED', 'ACCEPTED', 'REVOKED'].includes(offerLetter.status)) {
      return res.status(403).json({
        success: false,
        message: `Cannot edit offer letter in ${offerLetter.status} status.`,
      });
    }

    const allowedFields = [
      'candidateName',
      'fatherGuardianName',
      'address',
      'mobile',
      'email',
      'designation',
      'department',
      'joiningDate',
      'employmentType',
      'reportingManager',
      'workLocation',
      'probationPeriod',
      'noticePeriod',
      'monthlySalary',
      'annualCTC',
      'salaryPaymentCycle',
      'greetingText',
      'offerParagraph',
      'rulesAndRegulations',
      'offerLetterDate',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        offerLetter[field] = req.body[field];
      }
    });

    offerLetter.auditLogs.push({
      user: req.user?._id,
      userName: req.user?.name || 'User',
      userRole: req.user?.role || 'ADMIN',
      action: 'Offer letter updated',
      timestamp: new Date(),
      ip: req.ip || '',
      details: `Updated offer details for candidate ${offerLetter.candidateName}`,
    });

    await offerLetter.save();

    return res.json({
      success: true,
      message: 'Offer letter updated successfully.',
      offerLetter,
    });
  } catch (error) {
    console.error('Error updating offer letter:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update offer letter.',
    });
  }
};

/**
 * Delete Offer Letter (Draft only)
 */
const deleteOfferLetter = async (req, res) => {
  try {
    const offerLetter = await OfferLetter.findById(req.params.id);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found.',
      });
    }

    // Do NOT allow deletion of RELEASED or ACCEPTED offer letters
    if (offerLetter.status === 'RELEASED' || offerLetter.status === 'ACCEPTED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an official RELEASED or ACCEPTED offer letter. You may revoke it instead.',
      });
    }

    await OfferLetter.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message: 'Offer letter draft deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting offer letter:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete offer letter.',
    });
  }
};

/**
 * Release Offer Letter (SUPER ADMIN or granted permission only)
 */
const releaseOfferLetter = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const isSuper = userRole === 'SUPER_ADMIN';

    if (!isSuper && !req.user?.permissions?.offerLetters?.release) {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin (or explicit release permission) can release an offer letter.',
      });
    }

    const offerLetter = await OfferLetter.findById(req.params.id);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found.',
      });
    }

    if (offerLetter.status === 'RELEASED') {
      return res.status(400).json({
        success: false,
        message: 'This offer letter has already been released.',
      });
    }

    offerLetter.status = 'RELEASED';
    offerLetter.releasedBy = req.user?._id;
    offerLetter.releasedByName = req.user?.name || 'Super Admin';
    offerLetter.releasedAt = new Date();

    offerLetter.auditLogs.push({
      user: req.user?._id,
      userName: req.user?.name || 'Super Admin',
      userRole: req.user?.role || 'SUPER_ADMIN',
      action: 'Offer letter released',
      timestamp: new Date(),
      ip: req.ip || '',
      details: `Released by ${req.user?.name} to ${offerLetter.candidateName} (${offerLetter.email})`,
    });

    await offerLetter.save();

    return res.json({
      success: true,
      message: `Offer letter ${offerLetter.offerLetterNumber} released successfully to ${offerLetter.candidateName}!`,
      offerLetter,
    });
  } catch (error) {
    console.error('Error releasing offer letter:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to release offer letter.',
    });
  }
};

/**
 * Send Offer Letter Email with PDF attachment
 */
const sendOfferLetterEmailAction = async (req, res) => {
  try {
    const offerLetter = await OfferLetter.findById(req.params.id);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found.',
      });
    }

    const { pdfBase64, customEmail } = req.body;
    const recipientEmail = customEmail || offerLetter.email;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Candidate email address is required.',
      });
    }

    const cleanCandidateName = offerLetter.candidateName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
    const pdfFilename = `Offer_Letter_${cleanCandidateName}_${offerLetter.offerLetterNumber}.pdf`;

    const publicUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/offer-letter/public/${offerLetter.publicToken}`;

    const attachments = pdfBase64
      ? [
          {
            filename: pdfFilename,
            content: pdfBase64,
            encoding: 'base64',
            contentType: 'application/pdf',
          },
        ]
      : [];

    const formattedJoiningDate = new Date(offerLetter.joiningDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    await sendOfferLetterEmail({
      to: recipientEmail,
      candidateName: offerLetter.candidateName,
      designation: offerLetter.designation,
      joiningDate: formattedJoiningDate,
      offerLetterNumber: offerLetter.offerLetterNumber,
      publicUrl,
      attachments,
    });

    offerLetter.auditLogs.push({
      user: req.user?._id,
      userName: req.user?.name || 'User',
      userRole: req.user?.role || 'SUPER_ADMIN',
      action: 'Offer letter emailed to candidate',
      timestamp: new Date(),
      ip: req.ip || '',
      details: `Email sent to ${recipientEmail} with attachment ${pdfFilename}`,
    });

    await offerLetter.save();

    return res.json({
      success: true,
      message: `Offer letter email sent successfully to ${recipientEmail}.`,
    });
  } catch (error) {
    console.error('Error sending offer letter email:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send offer letter email.',
    });
  }
};

/**
 * Revoke Offer Letter (Super Admin only)
 */
const revokeOfferLetter = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const isSuper = userRole === 'SUPER_ADMIN';

    if (!isSuper && !req.user?.permissions?.offerLetters?.revoke) {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can revoke an offer letter.',
      });
    }

    const offerLetter = await OfferLetter.findById(req.params.id);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found.',
      });
    }

    offerLetter.status = 'REVOKED';
    offerLetter.revokedAt = new Date();
    offerLetter.revokedBy = req.user?._id;
    offerLetter.revokedByName = req.user?.name || 'Super Admin';
    offerLetter.revokeReason = req.body.reason || 'Revoked by management';

    offerLetter.auditLogs.push({
      user: req.user?._id,
      userName: req.user?.name || 'Super Admin',
      userRole: req.user?.role || 'SUPER_ADMIN',
      action: 'Offer letter revoked',
      timestamp: new Date(),
      ip: req.ip || '',
      details: `Revoked by ${req.user?.name}. Reason: ${offerLetter.revokeReason}`,
    });

    await offerLetter.save();

    return res.json({
      success: true,
      message: `Offer letter ${offerLetter.offerLetterNumber} has been revoked.`,
      offerLetter,
    });
  } catch (error) {
    console.error('Error revoking offer letter:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to revoke offer letter.',
    });
  }
};

/**
 * Public Candidate View API (by public token or ID)
 */
const getPublicOfferLetter = async (req, res) => {
  try {
    const { token } = req.params;
    const offerLetter = await findOfferByTokenOrId(token);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter link is invalid or expired.',
      });
    }

    if (offerLetter.status === 'RELEASED' && !offerLetter.viewedAt) {
      offerLetter.viewedAt = new Date();
      offerLetter.status = 'VIEWED';
      offerLetter.auditLogs.push({
        userName: offerLetter.candidateName,
        userRole: 'CANDIDATE',
        action: 'Offer letter viewed by candidate online',
        timestamp: new Date(),
        ip: req.ip || '',
        details: `Candidate opened public offer link`,
      });
      await offerLetter.save();
    }

    return res.json({
      success: true,
      offerLetter,
    });
  } catch (error) {
    console.error('Error fetching public offer letter:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load offer letter.',
    });
  }
};

/**
 * Public Candidate Acceptance API
 */
const acceptPublicOfferLetter = async (req, res) => {
  try {
    const { token } = req.params;
    const { signature } = req.body;

    const offerLetter = await findOfferByTokenOrId(token);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found or invalid token.',
      });
    }

    if (['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(offerLetter.status)) {
      return res.status(400).json({
        success: false,
        message: `This offer letter is currently in ${offerLetter.status} state.`,
      });
    }

    offerLetter.status = 'ACCEPTED';
    offerLetter.acceptedAt = new Date();
    offerLetter.acceptedIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    offerLetter.candidateSignature = signature || offerLetter.candidateName;

    offerLetter.auditLogs.push({
      userName: offerLetter.candidateName,
      userRole: 'CANDIDATE',
      action: 'Offer letter accepted by candidate',
      timestamp: new Date(),
      ip: offerLetter.acceptedIP,
      details: `Accepted by candidate with digital signature confirmation`,
    });

    await offerLetter.save();

    return res.json({
      success: true,
      message: 'Thank you! You have successfully accepted the offer letter.',
      offerLetter,
    });
  } catch (error) {
    console.error('Error accepting public offer letter:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process offer acceptance.',
    });
  }
};

/**
 * Public Candidate Rejection API
 */
const rejectPublicOfferLetter = async (req, res) => {
  try {
    const { token } = req.params;
    const { reason } = req.body;

    const offerLetter = await findOfferByTokenOrId(token);

    if (!offerLetter) {
      return res.status(404).json({
        success: false,
        message: 'Offer letter not found or invalid token.',
      });
    }

    offerLetter.status = 'REJECTED';
    offerLetter.rejectedAt = new Date();
    offerLetter.rejectionReason = reason || 'Declined by candidate';

    offerLetter.auditLogs.push({
      userName: offerLetter.candidateName,
      userRole: 'CANDIDATE',
      action: 'Offer letter rejected by candidate',
      timestamp: new Date(),
      ip: req.ip || '',
      details: `Reason provided: ${offerLetter.rejectionReason}`,
    });

    await offerLetter.save();

    return res.json({
      success: true,
      message: 'Your response has been recorded.',
      offerLetter,
    });
  } catch (error) {
    console.error('Error rejecting offer letter:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record response.',
    });
  }
};

module.exports = {
  createOfferLetter,
  getOfferLetters,
  getOfferLetterById,
  updateOfferLetter,
  deleteOfferLetter,
  releaseOfferLetter,
  sendOfferLetterEmailAction,
  revokeOfferLetter,
  getPublicOfferLetter,
  acceptPublicOfferLetter,
  rejectPublicOfferLetter,
};
