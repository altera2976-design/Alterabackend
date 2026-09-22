const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Client = require('../models/Client');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const { generateTransactionId, calculateTransactionTotals } = require('../services/transactionService');

/**
 * Build permission-scoped query for authenticated user
 */
function buildScopeQuery(req) {
  const query = {};
  const user = req.user;

  if (!user) return { _id: null }; // block unauthenticated

  const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.role?.toUpperCase() === 'SUPER_ADMIN';
  const hasViewAll = user.permissions?.transactions?.viewAll === true;

  if (isSuperAdmin || hasViewAll) {
    // Full access to all transactions
    return query;
  }

  const isAdmin = user.role === 'ADMIN' || user.isAdminPanelEnabled;
  if (isAdmin) {
    // Admin scoped access: transactions where adminId is req.user._id OR createdBy req.user._id
    query.$or = [{ adminId: user._id }, { createdBy: user._id }, { userId: user._id }];
    return query;
  }

  // Employee/Staff access: transactions specific to their employeeId or userId
  query.$or = [{ employeeId: user._id }, { userId: user._id }, { createdBy: user._id }];
  return query;
}

/**
 * Apply filtering & search to Mongoose query
 */
function applyFiltersAndSearch(req, baseQuery) {
  const query = { ...baseQuery };
  const {
    dateRange,
    startDate,
    endDate,
    transactionType,
    paymentMethod,
    status,
    employeeId,
    adminId,
    customerId,
    minAmount,
    maxAmount,
    search,
  } = req.query;

  // Date Range filter
  if (dateRange) {
    const now = new Date();
    let start, end;

    if (dateRange === 'Today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (dateRange === 'Yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (dateRange === 'This Week') {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      end = new Date();
    } else if (dateRange === 'This Month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date();
    } else if (dateRange === 'Custom' && startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    }

    if (start && end) {
      query.transactionDate = { $gte: start, $lte: end };
    }
  } else if (startDate && endDate) {
    query.transactionDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  // Type & Method
  if (transactionType && transactionType !== 'ALL') {
    query.transactionType = transactionType;
  }
  if (paymentMethod && paymentMethod !== 'ALL') {
    query.paymentMethod = paymentMethod;
  }
  if (status && status !== 'ALL') {
    query.status = status;
  }

  // Related User Filters
  if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
    query.employeeId = employeeId;
  }
  if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
    query.adminId = adminId;
  }
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    query.customerId = customerId;
  }

  // Amount Range
  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) query.amount.$gte = Number(minAmount);
    if (maxAmount) query.amount.$lte = Number(maxAmount);
  }

  // Search by Text
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    const searchConditions = [
      { transactionId: searchRegex },
      { referenceId: searchRegex },
      { customerName: searchRegex },
      { employeeName: searchRegex },
      { adminName: searchRegex },
      { description: searchRegex },
      { notes: searchRegex },
    ];

    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchConditions }];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  return query;
}

/**
 * GET /api/transactions
 */
exports.getTransactions = async (req, res, next) => {
  try {
    const scopeQuery = buildScopeQuery(req);
    const filterQuery = applyFiltersAndSearch(req, scopeQuery);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find(filterQuery)
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filterQuery),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/transactions/summary
 */
exports.getTransactionSummary = async (req, res, next) => {
  try {
    const scopeQuery = buildScopeQuery(req);
    const filterQuery = applyFiltersAndSearch(req, scopeQuery);

    const summary = await calculateTransactionTotals(filterQuery);

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/transactions/:id
 */
exports.getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Transaction ID' });
    }

    const scopeQuery = buildScopeQuery(req);
    const query = { _id: id, ...scopeQuery };

    const transaction = await Transaction.findOne(query)
      .populate('userId', 'name email phone role')
      .populate('employeeId', 'name email phone department designation')
      .populate('adminId', 'name email phone')
      .populate('customerId', 'name company phone email gstin')
      .populate('quotationId', 'quotationNumber projectTitle pricing')
      .populate('invoiceId', 'invoiceNumber amount status')
      .lean();

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found or access denied.' });
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/transactions/:id/timeline
 */
exports.getTransactionTimeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Transaction ID' });
    }

    const scopeQuery = buildScopeQuery(req);
    const transaction = await Transaction.findOne({ _id: id, ...scopeQuery }).select('transactionId status timeline').lean();

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found or access denied.' });
    }

    res.status(200).json({
      success: true,
      transactionId: transaction.transactionId,
      currentStatus: transaction.status,
      timeline: transaction.timeline || [],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/transactions
 */
exports.createTransaction = async (req, res, next) => {
  try {
    const {
      referenceId,
      employeeId,
      adminId,
      customerId,
      quotationId,
      invoiceId,
      transactionType,
      paymentMethod,
      amount,
      currency,
      status,
      description,
      notes,
      transactionDate,
    } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid transaction amount is required.' });
    }

    // Duplicate transaction check via referenceId
    if (referenceId && referenceId.trim()) {
      const existingRef = await Transaction.findOne({ referenceId: referenceId.trim() }).lean();
      if (existingRef) {
        return res.status(409).json({
          success: false,
          message: `Duplicate transaction. Reference ID ${referenceId} already exists as ${existingRef.transactionId}.`,
          existingTransaction: existingRef,
        });
      }
    }

    // Generate unique sequential transaction ID
    const transactionId = await generateTransactionId();

    // Resolve user & names
    let employeeName = '';
    if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
      const emp = await User.findById(employeeId).lean();
      if (emp) employeeName = emp.name;
    }

    let adminName = '';
    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
      const adm = await User.findById(adminId).lean();
      if (adm) adminName = adm.name;
    }

    let customerName = '';
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      const cust = await Client.findById(customerId).lean();
      if (cust) customerName = cust.name;
    }

    const initStatus = status || 'Completed';

    const newTransaction = new Transaction({
      transactionId,
      referenceId: referenceId ? referenceId.trim() : '',
      userId: req.user?._id,
      employeeId: employeeId || (req.user?.role === 'EMPLOYEE' ? req.user._id : undefined),
      employeeName: employeeName || req.user?.name || '',
      adminId: adminId || (req.user?.role === 'ADMIN' ? req.user._id : undefined),
      adminName: adminName || (req.user?.role === 'ADMIN' ? req.user.name : ''),
      customerId: customerId && mongoose.Types.ObjectId.isValid(customerId) ? customerId : undefined,
      customerName,
      quotationId: quotationId && mongoose.Types.ObjectId.isValid(quotationId) ? quotationId : undefined,
      invoiceId: invoiceId && mongoose.Types.ObjectId.isValid(invoiceId) ? invoiceId : undefined,
      transactionType: transactionType || 'Payment Received',
      paymentMethod: paymentMethod || 'UPI',
      amount: Number(amount),
      currency: currency || 'INR',
      status: initStatus,
      description: description ? description.trim() : '',
      notes: notes ? notes.trim() : '',
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      createdBy: req.user?._id,
      createdByName: req.user?.name || 'System',
      timeline: [
        {
          previousStatus: '',
          newStatus: initStatus,
          changedBy: req.user?._id,
          changedByName: req.user?.name || 'System',
          changedAt: new Date(),
          reason: 'Transaction created.',
        },
      ],
    });

    await newTransaction.save();

    // Socket.io Real-time emit
    const io = req.app.get('io');
    if (io) {
      io.emit('transaction_created', {
        id: newTransaction._id,
        transactionId: newTransaction.transactionId,
        amount: newTransaction.amount,
        status: newTransaction.status,
      });
    }

    res.status(201).json({
      success: true,
      message: `Transaction ${newTransaction.transactionId} created successfully.`,
      data: newTransaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/transactions/:id
 */
exports.updateTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Transaction ID' });
    }

    const scopeQuery = buildScopeQuery(req);
    const transaction = await Transaction.findOne({ _id: id, ...scopeQuery });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found or access denied.' });
    }

    const { status, description, notes, paymentMethod, transactionType, reason } = req.body;

    if (status && status !== transaction.status) {
      transaction.timeline.push({
        previousStatus: transaction.status,
        newStatus: status,
        changedBy: req.user?._id,
        changedByName: req.user?.name || 'System',
        changedAt: new Date(),
        reason: reason || `Status updated to ${status}.`,
      });
      transaction.status = status;
    }

    if (description !== undefined) transaction.description = description.trim();
    if (notes !== undefined) transaction.notes = notes.trim();
    if (paymentMethod !== undefined) transaction.paymentMethod = paymentMethod;
    if (transactionType !== undefined) transaction.transactionType = transactionType;

    await transaction.save();

    // Socket.io Real-time emit
    const io = req.app.get('io');
    if (io) {
      io.emit('transaction_updated', {
        id: transaction._id,
        transactionId: transaction.transactionId,
        status: transaction.status,
      });
    }

    res.status(200).json({
      success: true,
      message: `Transaction ${transaction.transactionId} updated successfully.`,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/transactions/:id/refund
 */
exports.refundTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Transaction ID' });
    }

    const scopeQuery = buildScopeQuery(req);
    const transaction = await Transaction.findOne({ _id: id, ...scopeQuery });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found or access denied.' });
    }

    if (transaction.status === 'Refunded') {
      return res.status(400).json({ success: false, message: 'Transaction is already refunded.' });
    }

    const prevStatus = transaction.status;
    transaction.status = 'Refunded';

    transaction.timeline.push({
      previousStatus: prevStatus,
      newStatus: 'Refunded',
      changedBy: req.user?._id,
      changedByName: req.user?.name || 'System',
      changedAt: new Date(),
      reason: reason || 'Refund executed by authorized user.',
    });

    await transaction.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('transaction_refunded', {
        id: transaction._id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
      });
    }

    res.status(200).json({
      success: true,
      message: `Transaction ${transaction.transactionId} refunded successfully.`,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/transactions/export
 */
exports.exportTransactions = async (req, res, next) => {
  try {
    const scopeQuery = buildScopeQuery(req);
    const filterQuery = applyFiltersAndSearch(req, scopeQuery);

    const transactions = await Transaction.find(filterQuery)
      .sort({ transactionDate: -1 })
      .lean();

    const format = (req.query.format || 'csv').toLowerCase();

    if (format === 'csv') {
      let csv = 'Transaction ID,Date,Employee/Admin,Customer,Type,Payment Method,Amount,Status,Reference ID,Description\n';
      transactions.forEach((tx) => {
        const d = tx.transactionDate ? new Date(tx.transactionDate).toISOString().split('T')[0] : '';
        const empAdmin = (tx.employeeName || tx.adminName || '').replace(/,/g, ' ');
        const cust = (tx.customerName || '').replace(/,/g, ' ');
        const desc = (tx.description || '').replace(/,/g, ' ');
        csv += `"${tx.transactionId}","${d}","${empAdmin}","${cust}","${tx.transactionType}","${tx.paymentMethod}",${tx.amount},"${tx.status}","${tx.referenceId || ''}","${desc}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=Transactions_${Date.now()}.csv`);
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/transactions/:id
 */
exports.deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Transaction ID' });
    }

    // Only Super Admin can delete transactions
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Only Super Admin is authorized to delete transactions.' });
    }

    const transaction = await Transaction.findByIdAndDelete(id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    res.status(200).json({
      success: true,
      message: `Transaction ${transaction.transactionId} deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};
