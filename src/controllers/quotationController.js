const mongoose = require('mongoose');
const Quotation = require('../models/Quotation');
const Client = require('../models/Client');
const Project = require('../models/Project');
const {
  generateQuotationNumber,
  getQuotationConfig,
  calculateQuotationPricing,
  generatePublicToken,
  convertQuotationToProject,
  DEFAULT_TERMS,
  DEFAULT_MILESTONES,
  DEFAULT_COMPANY_DETAILS,
  DEFAULT_BANK_DETAILS,
} = require('../services/quotationService');
const { sendQuotationEmail } = require('../services/emailService');

/**
 * Format currency helper for logging
 */
function formatINR(val) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

/**
 * POST /api/quotations
 * Create a new interior quotation
 */
exports.createQuotation = async (req, res, next) => {
  try {
    const {
      clientId,
      client,
      projectTitle,
      projectType,
      siteLocation,
      assignedDesigner,
      quotationDate,
      validUntil,
      items,
      pricing: pricingOptions = {},
      paymentMilestones,
      termsAndConditions,
      bankDetails,
      companyDetails,
      notes,
    } = req.body;

    if (!client || !client.name) {
      return res.status(400).json({ success: false, message: 'Client name is required.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one quotation item is required.' });
    }

    // Default validity date to 30 days ahead if not provided
    const qDate = quotationDate ? new Date(quotationDate) : new Date();
    const vUntil = validUntil ? new Date(validUntil) : new Date(qDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (vUntil < qDate) {
      return res.status(400).json({
        success: false,
        message: 'Quotation validity date cannot be before the quotation date.',
      });
    }

    // Fetch defaults from config
    const globalConfig = await getQuotationConfig();

    // Auto-generate sequential quotation number
    const quotationNumber = await generateQuotationNumber();
    const publicToken = generatePublicToken();

    // Run Calculation Engine
    const { calculatedItems, pricing, paymentMilestones: calculatedMilestones, isMilestonesValid, totalPercentage } =
      calculateQuotationPricing(items, pricingOptions, paymentMilestones || globalConfig.defaultMilestones);

    if (!isMilestonesValid) {
      return res.status(400).json({
        success: false,
        message: `Payment milestone percentages must equal 100%. Current sum: ${totalPercentage}%`,
      });
    }

    const assignedDesignerName = req.user ? req.user.name : '';

    const newQuotation = new Quotation({
      quotationNumber,
      revision: 0,
      isLatest: true,
      clientId: clientId && mongoose.Types.ObjectId.isValid(clientId) ? clientId : undefined,
      client: {
        name: client.name,
        company: client.company || '',
        phone: client.phone || '',
        email: client.email || '',
        address: client.address || siteLocation || '',
        gstin: client.gstin || '',
      },
      projectTitle: projectTitle || `${client.name} Residence Interior`,
      projectType: projectType || 'Residential Interior',
      siteLocation: siteLocation || client.address || '',
      assignedDesigner: assignedDesigner || req.user?._id,
      assignedDesignerName,
      status: 'Draft',
      quotationDate: qDate,
      validUntil: vUntil,
      items: calculatedItems,
      pricing,
      paymentMilestones: calculatedMilestones,
      termsAndConditions: termsAndConditions && termsAndConditions.length > 0 ? termsAndConditions : globalConfig.termsAndConditions,
      bankDetails: bankDetails || globalConfig.bankDetails,
      companyDetails: companyDetails || globalConfig.companyDetails,
      publicToken,
      notes: notes || '',
      createdBy: req.user?._id,
      auditLog: [
        {
          action: 'QUOTATION_CREATED',
          performedBy: req.user?._id,
          performedByName: req.user?.name || 'System',
          timestamp: new Date(),
          details: `Created quotation ${quotationNumber} with ${calculatedItems.length} items. Total: ${formatINR(pricing.grandTotal)}`,
        },
      ],
    });

    await newQuotation.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('quotation_created', {
        id: newQuotation._id,
        quotationNumber: newQuotation.quotationNumber,
        clientName: newQuotation.client?.name,
        grandTotal: newQuotation.pricing?.grandTotal,
      });
    }

    res.status(201).json({
      success: true,
      message: `Quotation ${quotationNumber} created successfully.`,
      quotation: newQuotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to calculate Quotation Payment Summary from Transaction model
 */
async function getQuotationPaymentDetails(quotationId, grandTotal = 0) {
  const Transaction = require('../models/Transaction');
  const transactions = await Transaction.find({ quotationId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .lean();

  let paidAmount = 0;
  transactions.forEach((tx) => {
    if (tx.status === 'Completed' || tx.status === 'PAID' || tx.status === 'COMPLETED') {
      if (tx.transactionType === 'Refund') {
        paidAmount -= Number(tx.amount || 0);
      } else {
        paidAmount += Number(tx.amount || 0);
      }
    }
  });

  if (paidAmount < 0) paidAmount = 0;
  const totalAmount = Number(grandTotal || 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  let paymentStatus = 'UNPAID';
  if (paidAmount >= totalAmount && totalAmount > 0) {
    paymentStatus = 'PAID';
  } else if (paidAmount > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  }

  return {
    paymentSummary: {
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentStatus,
    },
    transactions,
  };
}

/**
 * GET /api/quotations
 * Query quotations with search, filters, pagination
 */
exports.getQuotations = async (req, res, next) => {
  try {
    const {
      search,
      status,
      clientId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      allRevisions,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {};

    // By default show only latest revisions
    if (allRevisions !== 'true') {
      query.isLatest = true;
    }

    // Role-based visibility
    if (req.user && req.user.role !== 'ADMIN') {
      // Non-admins can see quotations they created or are assigned to
      query.$or = [{ assignedDesigner: req.user._id }, { createdBy: req.user._id }];
    }

    // Status filter
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // Client filter
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      query.clientId = clientId;
    }

    // Date range
    if (startDate || endDate) {
      query.quotationDate = {};
      if (startDate) query.quotationDate.$gte = new Date(startDate);
      if (endDate) query.quotationDate.$lte = new Date(endDate);
    }

    // Amount range
    if (minAmount || maxAmount) {
      query['pricing.grandTotal'] = {};
      if (minAmount) query['pricing.grandTotal'].$gte = Number(minAmount);
      if (maxAmount) query['pricing.grandTotal'].$lte = Number(maxAmount);
    }

    // Text search
    if (search && search.trim()) {
      const term = search.trim();
      const regex = new RegExp(term, 'i');
      query.$or = [
        { quotationNumber: regex },
        { 'client.name': regex },
        { 'client.phone': regex },
        { 'client.email': regex },
        { projectTitle: regex },
        { siteLocation: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [quotations, totalCount] = await Promise.all([
      Quotation.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('assignedDesigner', 'name email employeeId designation')
        .lean(),
      Quotation.countDocuments(query),
    ]);

    // Aggregate paid amounts for transactions associated with these quotations
    const quotationIds = quotations.map((q) => q._id);
    const Transaction = require('../models/Transaction');
    const paidSummaryAgg = await Transaction.aggregate([
      {
        $match: {
          quotationId: { $in: quotationIds },
          status: { $in: ['Completed', 'PAID', 'COMPLETED'] },
        },
      },
      {
        $group: {
          _id: '$quotationId',
          totalPaid: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'Refund'] }, { $multiply: ['$amount', -1] }, '$amount'],
            },
          },
        },
      },
    ]);

    const paidMap = {};
    paidSummaryAgg.forEach((item) => {
      paidMap[item._id.toString()] = Math.max(0, item.totalPaid || 0);
    });

    const enrichedQuotations = quotations.map((q) => {
      const grandTotal = q.pricing?.grandTotal || 0;
      const paidAmount = paidMap[q._id.toString()] || 0;
      const remainingAmount = Math.max(0, grandTotal - paidAmount);
      let paymentStatus = 'UNPAID';
      if (paidAmount >= grandTotal && grandTotal > 0) {
        paymentStatus = 'PAID';
      } else if (paidAmount > 0) {
        paymentStatus = 'PARTIALLY_PAID';
      }
      return {
        ...q,
        paymentSummary: {
          totalAmount: grandTotal,
          paidAmount,
          remainingAmount,
          paymentStatus,
        },
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedQuotations.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      quotations: enrichedQuotations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/quotations/summary
 * Dashboard KPIs & metrics
 */
exports.getQuotationSummary = async (req, res, next) => {
  try {
    const baseQuery = { isLatest: true };
    if (req.user && req.user.role !== 'ADMIN') {
      baseQuery.$or = [{ assignedDesigner: req.user._id }, { createdBy: req.user._id }];
    }

    const allQuotations = await Quotation.find(baseQuery)
      .select('status pricing.grandTotal quotationNumber client.name projectTitle createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const totalQuotations = allQuotations.length;
    let draftCount = 0;
    let sentCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let expiredCount = 0;
    let convertedCount = 0;
    let totalPipelineValue = 0;
    let approvedValue = 0;

    allQuotations.forEach(q => {
      const val = q.pricing?.grandTotal || 0;
      totalPipelineValue += val;

      switch (q.status) {
        case 'Draft':
          draftCount++;
          break;
        case 'Sent':
        case 'Viewed':
        case 'Under Discussion':
          sentCount++;
          break;
        case 'Approved':
          approvedCount++;
          approvedValue += val;
          break;
        case 'Rejected':
          rejectedCount++;
          break;
        case 'Expired':
          expiredCount++;
          break;
        case 'Converted to Project':
          convertedCount++;
          approvedValue += val;
          break;
        default:
          break;
      }
    });

    res.status(200).json({
      success: true,
      summary: {
        totalQuotations,
        draftCount,
        sentCount,
        approvedCount,
        rejectedCount,
        expiredCount,
        convertedCount,
        totalPipelineValue,
        approvedValue,
      },
      recentQuotations: allQuotations.slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/quotations/:id
 * Full quotation detail with items, payment summary, transactions, and revisions history
 */
exports.getQuotationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const quotation = await Quotation.findById(id)
      .populate('assignedDesigner', 'name email employeeId designation')
      .populate('convertedProject.projectId', 'projectId name status')
      .lean();

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    // Fetch revisions if any
    const revisions = await Quotation.find({
      quotationNumber: quotation.quotationNumber,
    })
      .select('revision isLatest status pricing.grandTotal createdAt auditLog')
      .sort({ revision: -1 })
      .lean();

    // Fetch transactions & payment summary
    const { paymentSummary, transactions } = await getQuotationPaymentDetails(id, quotation.pricing?.grandTotal);

    res.status(200).json({
      success: true,
      quotation: {
        ...quotation,
        paymentSummary,
        transactions,
      },
      revisions,
      paymentSummary,
      transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/quotations/:id
 * Update quotation or fork into revision if already sent/approved
 */
exports.updateQuotation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      client,
      projectTitle,
      projectType,
      siteLocation,
      assignedDesigner,
      validUntil,
      items,
      pricing: pricingOptions = {},
      paymentMilestones,
      termsAndConditions,
      bankDetails,
      companyDetails,
      notes,
      createRevision = false,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const existing = await Quotation.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    // Calculation Engine
    const { calculatedItems, pricing, paymentMilestones: calculatedMilestones, isMilestonesValid, totalPercentage } =
      calculateQuotationPricing(
        items || existing.items,
        pricingOptions,
        paymentMilestones || existing.paymentMilestones
      );

    if (!isMilestonesValid) {
      return res.status(400).json({
        success: false,
        message: `Payment milestone percentages must equal 100%. Current sum: ${totalPercentage}%`,
      });
    }

    // Check if we should create a new revision (sent/approved quotation or explicit request)
    const shouldForkRevision =
      createRevision || existing.status === 'Sent' || existing.status === 'Approved' || existing.status === 'Converted to Project';

    if (shouldForkRevision) {
      // Archive current version
      existing.isLatest = false;
      existing.status = 'Revised';
      existing.auditLog.push({
        action: 'QUOTATION_REVISED',
        performedBy: req.user?._id,
        performedByName: req.user?.name || 'User',
        timestamp: new Date(),
        details: `Created new Revision ${existing.revision + 1}`,
      });
      await existing.save();

      // Create new Revision document
      const newRev = new Quotation({
        quotationNumber: existing.quotationNumber,
        revision: existing.revision + 1,
        isLatest: true,
        parentQuotationId: existing._id,
        clientId: existing.clientId,
        client: client || existing.client,
        projectTitle: projectTitle || existing.projectTitle,
        projectType: projectType || existing.projectType,
        siteLocation: siteLocation || existing.siteLocation,
        assignedDesigner: assignedDesigner || existing.assignedDesigner,
        assignedDesignerName: req.user?.name || existing.assignedDesignerName,
        status: 'Draft',
        quotationDate: existing.quotationDate,
        validUntil: validUntil ? new Date(validUntil) : existing.validUntil,
        items: calculatedItems,
        pricing,
        paymentMilestones: calculatedMilestones,
        termsAndConditions: termsAndConditions || existing.termsAndConditions,
        bankDetails: bankDetails || existing.bankDetails,
        companyDetails: companyDetails || existing.companyDetails,
        publicToken: generatePublicToken(),
        notes: notes !== undefined ? notes : existing.notes,
        createdBy: req.user?._id || existing.createdBy,
        auditLog: [
          ...existing.auditLog,
          {
            action: 'REVISION_CREATED',
            performedBy: req.user?._id,
            performedByName: req.user?.name || 'User',
            timestamp: new Date(),
            details: `Revision ${existing.revision + 1} generated. Grand Total: ${formatINR(pricing.grandTotal)}`,
          },
        ],
      });

      await newRev.save();

      return res.status(200).json({
        success: true,
        message: `Created Revision ${newRev.revision} for ${newRev.quotationNumber}.`,
        quotation: newRev,
      });
    }

    // In-place update for Drafts
    if (client) existing.client = { ...existing.client, ...client };
    if (projectTitle) existing.projectTitle = projectTitle;
    if (projectType) existing.projectType = projectType;
    if (siteLocation !== undefined) existing.siteLocation = siteLocation;
    if (assignedDesigner) existing.assignedDesigner = assignedDesigner;
    if (validUntil) existing.validUntil = new Date(validUntil);
    if (items) existing.items = calculatedItems;
    existing.pricing = pricing;
    existing.paymentMilestones = calculatedMilestones;
    if (termsAndConditions) existing.termsAndConditions = termsAndConditions;
    if (bankDetails) existing.bankDetails = bankDetails;
    if (companyDetails) existing.companyDetails = companyDetails;
    if (notes !== undefined) existing.notes = notes;

    existing.auditLog.push({
      action: 'QUOTATION_UPDATED',
      performedBy: req.user?._id,
      performedByName: req.user?.name || 'User',
      timestamp: new Date(),
      details: `Updated quotation items/pricing. New Total: ${formatINR(pricing.grandTotal)}`,
    });

    await existing.save();

    res.status(200).json({
      success: true,
      message: `Quotation ${existing.quotationNumber} updated successfully.`,
      quotation: existing,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/quotations/:id/send
 * Dispatch official PDF proposal to client email
 */
exports.sendQuotation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { recipientEmail, cc, subject, message, pdfBase64 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    const targetEmail = recipientEmail || quotation.client?.email;
    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Recipient email address is required.' });
    }

    if (!pdfBase64) {
      return res.status(400).json({ success: false, message: 'Quotation PDF base64 is required.' });
    }

    const appUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5001';
    const publicUrl = `${appUrl}/api/quotations/public/${quotation.publicToken}`;
    const filename = `Quotation_${quotation.quotationNumber}_${(quotation.client?.name || 'Client').replace(/\s+/g, '_')}.pdf`;

    const emailResult = await sendQuotationEmail({
      to: targetEmail,
      cc,
      clientName: quotation.client?.name || 'Valued Client',
      quotationNumber: quotation.quotationNumber,
      projectTitle: quotation.projectTitle,
      grandTotal: quotation.pricing?.grandTotal,
      publicUrl,
      message,
      attachments: [
        {
          filename,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    });

    quotation.status = 'Sent';
    quotation.auditLog.push({
      action: 'QUOTATION_SENT',
      performedBy: req.user?._id,
      performedByName: req.user?.name || 'User',
      timestamp: new Date(),
      details: `Quotation PDF dispatched to ${targetEmail}`,
    });
    await quotation.save();

    res.status(200).json({
      success: true,
      message: `Quotation successfully sent to ${targetEmail}.`,
      previewUrl: emailResult.previewUrl,
      quotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/quotations/public/:token
 * Secure client-facing quotation view
 */
exports.getPublicQuotation = async (req, res, next) => {
  try {
    const { token } = req.params;

    const quotation = await Quotation.findOne({ publicToken: token })
      .select('-auditLog -createdBy')
      .lean();

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found or link has expired.' });
    }

    // If currently 'Sent', mark as 'Viewed'
    if (quotation.status === 'Sent') {
      await Quotation.updateOne(
        { publicToken: token },
        {
          $set: { status: 'Viewed' },
          $push: {
            auditLog: {
              action: 'CLIENT_VIEWED',
              performedByName: quotation.client?.name || 'Client',
              timestamp: new Date(),
              details: `Client viewed quotation link from ${req.ip}`,
            },
          },
        }
      );
      quotation.status = 'Viewed';
    }

    res.status(200).json({
      success: true,
      quotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/quotations/public/:token/approve
 * Client approves quotation via secure link or in-app
 */
exports.clientApproveQuotation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { comments, clientName } = req.body;

    const quotation = await Quotation.findOne({ publicToken: token });
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    quotation.status = 'Approved';
    quotation.clientApproval = {
      approved: true,
      approvedAt: new Date(),
      clientComments: comments || '',
      rejectionReason: '',
      clientIp: req.ip,
    };

    quotation.auditLog.push({
      action: 'CLIENT_APPROVED',
      performedByName: clientName || quotation.client?.name || 'Client',
      timestamp: new Date(),
      details: `Quotation officially approved by client. Comments: ${comments || 'None'}`,
    });

    await quotation.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('quotation_approved', {
        id: quotation._id,
        quotationNumber: quotation.quotationNumber,
        clientName: quotation.client?.name,
        grandTotal: quotation.pricing?.grandTotal,
      });
    }

    res.status(200).json({
      success: true,
      message: `Quotation ${quotation.quotationNumber} has been approved! Our team will contact you shortly.`,
      quotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/quotations/public/:token/reject
 * Client rejects quotation with reason
 */
exports.clientRejectQuotation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { reason, clientName } = req.body;

    const quotation = await Quotation.findOne({ publicToken: token });
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    quotation.status = 'Rejected';
    quotation.clientApproval = {
      approved: false,
      approvedAt: null,
      clientComments: '',
      rejectionReason: reason || 'Not specified',
      clientIp: req.ip,
    };

    quotation.auditLog.push({
      action: 'CLIENT_REJECTED',
      performedByName: clientName || quotation.client?.name || 'Client',
      timestamp: new Date(),
      details: `Client rejected quotation. Reason: ${reason || 'Not specified'}`,
    });

    await quotation.save();

    res.status(200).json({
      success: true,
      message: `Quotation feedback recorded. Thank you for your review.`,
      quotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/quotations/:id/convert-to-project
 * Automatically creates Project & Client records from approved quotation
 */
exports.convertToProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    if (quotation.status === 'Converted to Project') {
      return res.status(400).json({
        success: false,
        message: 'This quotation has already been converted to a Project.',
      });
    }

    const { project, client } = await convertQuotationToProject(quotation, req.user);

    quotation.status = 'Converted to Project';
    quotation.clientId = client._id;
    quotation.convertedProject = {
      projectId: project._id,
      convertedAt: new Date(),
      convertedBy: req.user?._id,
    };

    quotation.auditLog.push({
      action: 'CONVERTED_TO_PROJECT',
      performedBy: req.user?._id,
      performedByName: req.user?.name || 'User',
      timestamp: new Date(),
      details: `Converted to Project ${project.projectId} (${project.name}) with budget ${formatINR(project.value)}`,
    });

    await quotation.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('project_created', {
        projectId: project.projectId,
        name: project.name,
        client: project.client,
        value: project.value,
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully converted Quotation ${quotation.quotationNumber} to Project ${project.projectId}!`,
      project,
      client,
      quotation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/quotations/:id
 * Delete quotation
 */
exports.deleteQuotation = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    if (quotation.status === 'Converted to Project') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a quotation that has already been converted to a Project.',
      });
    }

    await Quotation.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: `Quotation ${quotation.quotationNumber} deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/quotations/config
 * Get default company metadata, bank details, room categories, terms
 */
exports.getConfig = async (req, res, next) => {
  try {
    const config = await getQuotationConfig();
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/quotations/config
 * Update global quotation configuration
 */
exports.updateConfig = async (req, res, next) => {
  try {
    const Setting = require('../models/Setting');
    const {
      companyDetails,
      bankDetails,
      termsAndConditions,
      defaultMilestones,
      roomCategories,
      defaultGstPercent,
      defaultHandlingFeePercent,
      defaultDesignFeePercent,
    } = req.body;

    const currentConfig = await getQuotationConfig();
    const updated = {
      ...currentConfig,
      ...(companyDetails ? { companyDetails } : {}),
      ...(bankDetails ? { bankDetails } : {}),
      ...(termsAndConditions ? { termsAndConditions } : {}),
      ...(defaultMilestones ? { defaultMilestones } : {}),
      ...(roomCategories ? { roomCategories } : {}),
      ...(defaultGstPercent !== undefined ? { defaultGstPercent: Number(defaultGstPercent) } : {}),
      ...(defaultHandlingFeePercent !== undefined ? { defaultHandlingFeePercent: Number(defaultHandlingFeePercent) } : {}),
      ...(defaultDesignFeePercent !== undefined ? { defaultDesignFeePercent: Number(defaultDesignFeePercent) } : {}),
    };

    const setting = await Setting.findOneAndUpdate(
      { key: 'QUOTATION_CONFIG' },
      { value: updated, description: 'Interior quotation templates, company metadata, bank details, and room categories' },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Quotation settings updated successfully.',
      data: setting.value,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/quotations/:id/transactions
 * Retrieve all transactions linked to a quotation along with calculated payment summary
 */
exports.getQuotationTransactions = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const quotation = await Quotation.findById(id).select('quotationNumber pricing.grandTotal client').lean();
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    const { paymentSummary, transactions } = await getQuotationPaymentDetails(id, quotation.pricing?.grandTotal);

    res.status(200).json({
      success: true,
      quotationNumber: quotation.quotationNumber,
      paymentSummary,
      transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/quotations/:id/transactions
 * Record a new payment/transaction against a quotation
 */
exports.addQuotationTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, referenceId, description, notes, status = 'Completed', transactionDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid quotation ID.' });
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found.' });
    }

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid transaction amount is required.' });
    }

    const { generateTransactionId } = require('../services/transactionService');
    const Transaction = require('../models/Transaction');

    // Duplicate transaction check via referenceId if provided
    if (referenceId && referenceId.trim()) {
      const existingRef = await Transaction.findOne({ referenceId: referenceId.trim() }).lean();
      if (existingRef) {
        return res.status(409).json({
          success: false,
          message: `Duplicate transaction. Reference ID ${referenceId} already exists as ${existingRef.transactionId}.`,
        });
      }
    }

    const transactionId = await generateTransactionId();

    const newTransaction = new Transaction({
      transactionId,
      referenceId: referenceId ? referenceId.trim() : '',
      quotationId: quotation._id,
      customerId: quotation.clientId,
      customerName: quotation.client?.name || '',
      transactionType: 'Quotation Payment',
      paymentMethod: paymentMethod || 'UPI',
      amount: Number(amount),
      currency: 'INR',
      status: status || 'Completed',
      description: description?.trim() || `Payment received for Quotation ${quotation.quotationNumber}`,
      notes: notes?.trim() || '',
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      createdBy: req.user?._id,
      createdByName: req.user?.name || 'System',
      timeline: [
        {
          previousStatus: '',
          newStatus: status || 'Completed',
          changedBy: req.user?._id,
          changedByName: req.user?.name || 'System',
          changedAt: new Date(),
          reason: 'Quotation transaction created.',
        },
      ],
    });

    await newTransaction.save();

    // Log transaction entry in Quotation Audit Log
    quotation.auditLog.push({
      action: 'PAYMENT_RECEIVED',
      performedBy: req.user?._id,
      performedByName: req.user?.name || 'User',
      timestamp: new Date(),
      details: `Payment ${newTransaction.transactionId} of ${formatINR(amount)} received via ${newTransaction.paymentMethod}`,
    });
    const { paymentSummary, transactions } = await getQuotationPaymentDetails(quotation._id, quotation.pricing?.grandTotal);
    quotation.paymentSummary = paymentSummary;
    await quotation.save();

    // Socket.io Real-time emit
    const io = req.app.get('io');
    if (io) {
      io.emit('quotation_transaction_created', {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        transaction: newTransaction,
        paymentSummary,
      });
      io.emit('transaction_created', {
        id: newTransaction._id,
        transactionId: newTransaction.transactionId,
        amount: newTransaction.amount,
        status: newTransaction.status,
      });
    }

    res.status(201).json({
      success: true,
      message: `Payment of ${formatINR(amount)} recorded for Quotation ${quotation.quotationNumber}.`,
      data: newTransaction,
      paymentSummary,
      transactions,
    });
  } catch (error) {
    next(error);
  }
};
