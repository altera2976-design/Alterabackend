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
    const escaped = paymentMethod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.paymentMethod = new RegExp(`^${escaped}$`, 'i');
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
      { quotationRef: searchRegex },
      { invoiceRef: searchRegex },
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
    let limit = parseInt(req.query.limit, 10);
    const fetchAll = req.query.limit === '0' || req.query.limit === 'all' || limit === 0 || limit > 5000;
    if (isNaN(limit) || limit < 0) limit = 20;
    const skip = fetchAll ? 0 : (page - 1) * limit;

    let txQuery = Transaction.find(filterQuery)
      .populate('quotationId', 'quotationNumber projectTitle')
      .populate('invoiceId', 'invoiceNumber')
      .populate('customerId', 'name company phone email')
      .populate('employeeId', 'name email employeeId')
      .sort({ transactionDate: -1, createdAt: -1 });

    if (!fetchAll) {
      txQuery = txQuery.skip(skip).limit(limit);
    }

    const [transactions, total] = await Promise.all([
      txQuery.lean(),
      Transaction.countDocuments(filterQuery),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      page: fetchAll ? 1 : page,
      pages: fetchAll ? 1 : Math.ceil(total / limit),
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
      employeeName: inputEmployeeName,
      adminId,
      adminName: inputAdminName,
      customerId,
      customerName: inputCustomerName,
      quotationId,
      quotationRef: inputQuotationRef,
      invoiceId,
      invoiceRef: inputInvoiceRef,
      transactionType,
      paymentMethod,
      amount,
      currency,
      status,
      description,
      notes,
      mobileNumber,
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

    // Resolve Employee / Admin names
    let resolvedEmployeeName = (inputEmployeeName || '').trim();
    let resolvedEmployeeId = employeeId && mongoose.Types.ObjectId.isValid(employeeId) ? employeeId : undefined;
    if (resolvedEmployeeId) {
      const emp = await User.findById(resolvedEmployeeId).lean();
      if (emp) resolvedEmployeeName = emp.name;
    } else if (resolvedEmployeeName) {
      const emp = await User.findOne({ name: new RegExp('^' + resolvedEmployeeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
      if (emp) resolvedEmployeeId = emp._id;
    }

    let resolvedAdminName = (inputAdminName || '').trim();
    let resolvedAdminId = adminId && mongoose.Types.ObjectId.isValid(adminId) ? adminId : undefined;
    if (resolvedAdminId) {
      const adm = await User.findById(resolvedAdminId).lean();
      if (adm) resolvedAdminName = adm.name;
    }

    // Resolve Customer Name & ID
    let resolvedCustomerName = (inputCustomerName || '').trim();
    let resolvedCustomerId = customerId && mongoose.Types.ObjectId.isValid(customerId) ? customerId : undefined;
    if (resolvedCustomerId) {
      const cust = await Client.findById(resolvedCustomerId).lean();
      if (cust) resolvedCustomerName = cust.name;
    } else if (resolvedCustomerName) {
      const cust = await Client.findOne({ name: new RegExp('^' + resolvedCustomerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
      if (cust) resolvedCustomerId = cust._id;
    }

    // Resolve Quotation Ref & ID
    let resolvedQuotationRef = (inputQuotationRef || '').trim();
    let resolvedQuotationId = quotationId && mongoose.Types.ObjectId.isValid(quotationId) ? quotationId : undefined;
    if (resolvedQuotationId) {
      const q = await Quotation.findById(resolvedQuotationId).lean();
      if (q) resolvedQuotationRef = q.quotationNumber || resolvedQuotationRef;
    } else if (resolvedQuotationRef) {
      const q = await Quotation.findOne({ quotationNumber: new RegExp('^' + resolvedQuotationRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
      if (q) resolvedQuotationId = q._id;
    }

    // Resolve Invoice Ref & ID
    let resolvedInvoiceRef = (inputInvoiceRef || '').trim();
    let resolvedInvoiceId = invoiceId && mongoose.Types.ObjectId.isValid(invoiceId) ? invoiceId : undefined;
    if (resolvedInvoiceId) {
      const inv = await Invoice.findById(resolvedInvoiceId).lean();
      if (inv) resolvedInvoiceRef = inv.invoiceNumber || resolvedInvoiceRef;
    } else if (resolvedInvoiceRef) {
      const inv = await Invoice.findOne({ invoiceNumber: new RegExp('^' + resolvedInvoiceRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
      if (inv) resolvedInvoiceId = inv._id;
    }

    const initStatus = status || 'Completed';

    const newTransaction = new Transaction({
      transactionId,
      referenceId: referenceId ? referenceId.trim() : '',
      userId: req.user?._id,
      employeeId: resolvedEmployeeId || (req.user?.role === 'EMPLOYEE' ? req.user._id : undefined),
      employeeName: resolvedEmployeeName || req.user?.name || '',
      adminId: resolvedAdminId || (req.user?.role === 'ADMIN' ? req.user._id : undefined),
      adminName: resolvedAdminName || (req.user?.role === 'ADMIN' ? req.user.name : ''),
      customerId: resolvedCustomerId,
      customerName: resolvedCustomerName,
      quotationId: resolvedQuotationId,
      quotationRef: resolvedQuotationRef,
      invoiceId: resolvedInvoiceId,
      invoiceRef: resolvedInvoiceRef,
      transactionType: transactionType || 'Payment Received',
      paymentMethod: paymentMethod || 'UPI',
      amount: Number(amount),
      currency: currency || 'INR',
      status: initStatus,
      description: description ? description.trim() : '',
      notes: notes ? notes.trim() : '',
      mobileNumber: mobileNumber ? mobileNumber.trim() : '',
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

    // Populate references before sending response so frontend immediately has all data
    const populatedTransaction = await Transaction.findById(newTransaction._id)
      .populate('userId', 'name email phone role')
      .populate('employeeId', 'name email phone department designation')
      .populate('adminId', 'name email phone')
      .populate('customerId', 'name company phone email gstin')
      .populate('quotationId', 'quotationNumber projectTitle pricing')
      .populate('invoiceId', 'invoiceNumber amount status')
      .lean();

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
      data: populatedTransaction || newTransaction,
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

    const {
      status,
      description,
      notes,
      paymentMethod,
      transactionType,
      reason,
      amount,
      referenceId,
      customerName,
      employeeName,
      quotationRef,
      invoiceRef,
      quotationId,
      invoiceId,
    } = req.body;

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

    if (amount !== undefined && amount !== null && amount !== '' && !isNaN(Number(amount))) {
      transaction.amount = Number(amount);
    }
    if (referenceId !== undefined) transaction.referenceId = String(referenceId || '').trim();
    if (customerName !== undefined) {
      const cName = String(customerName || '').trim();
      transaction.customerName = cName;
      if (cName && !transaction.customerId) {
        const cust = await Client.findOne({ name: new RegExp('^' + cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
        if (cust) transaction.customerId = cust._id;
      }
    }
    if (employeeName !== undefined) {
      const eName = String(employeeName || '').trim();
      transaction.employeeName = eName;
      if (eName && !transaction.employeeId) {
        const emp = await User.findOne({ name: new RegExp('^' + eName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
        if (emp) transaction.employeeId = emp._id;
      }
    }
    if (quotationRef !== undefined) {
      const qRef = String(quotationRef || '').trim();
      transaction.quotationRef = qRef;
      if (qRef && !transaction.quotationId) {
        const q = await Quotation.findOne({ quotationNumber: new RegExp('^' + qRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
        if (q) transaction.quotationId = q._id;
      }
    }
    if (invoiceRef !== undefined) {
      const invRef = String(invoiceRef || '').trim();
      transaction.invoiceRef = invRef;
      if (invRef && !transaction.invoiceId) {
        const inv = await Invoice.findOne({ invoiceNumber: new RegExp('^' + invRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
        if (inv) transaction.invoiceId = inv._id;
      }
    }
    if (quotationId !== undefined && mongoose.Types.ObjectId.isValid(quotationId)) {
      transaction.quotationId = quotationId;
    }
    if (invoiceId !== undefined && mongoose.Types.ObjectId.isValid(invoiceId)) {
      transaction.invoiceId = invoiceId;
    }
    if (description !== undefined) transaction.description = String(description || '').trim();
    if (notes !== undefined) transaction.notes = String(notes || '').trim();
    if (paymentMethod !== undefined) transaction.paymentMethod = paymentMethod;
    if (transactionType !== undefined) transaction.transactionType = transactionType;

    await transaction.save();

    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate('userId', 'name email phone role')
      .populate('employeeId', 'name email phone department designation')
      .populate('adminId', 'name email phone')
      .populate('customerId', 'name company phone email gstin')
      .populate('quotationId', 'quotationNumber projectTitle pricing')
      .populate('invoiceId', 'invoiceNumber amount status')
      .lean();

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
      data: populatedTransaction || transaction,
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
      .populate('quotationId', 'quotationNumber projectTitle')
      .populate('invoiceId', 'invoiceNumber')
      .populate('customerId', 'name company phone email')
      .populate('employeeId', 'name email employeeId')
      .sort({ transactionDate: -1, createdAt: -1 })
      .lean();

    const format = (req.query.format || 'csv').toLowerCase();

    if (format === 'csv') {
      let csv = 'Transaction ID,Date,Employee/Admin,Customer,Type,Payment Method,Amount,Status,Reference ID,Quotation Ref,Invoice Ref,Recorded By,Description\n';
      transactions.forEach((tx) => {
        const d = tx.transactionDate ? new Date(tx.transactionDate).toISOString().split('T')[0] : '';
        const empAdmin = (tx.employeeName || tx.employeeId?.name || tx.adminName || '').replace(/,/g, ' ');
        const cust = (tx.customerName || tx.customerId?.name || '').replace(/,/g, ' ');
        const qRef = (tx.quotationRef || tx.quotationId?.quotationNumber || '').replace(/,/g, ' ');
        const invRef = (tx.invoiceRef || tx.invoiceId?.invoiceNumber || '').replace(/,/g, ' ');
        const recordedBy = (tx.createdByName || '').replace(/,/g, ' ');
        const desc = (tx.description || '').replace(/,/g, ' ');
        csv += `"${tx.transactionId}","${d}","${empAdmin}","${cust}","${tx.transactionType}","${tx.paymentMethod}",${tx.amount},"${tx.status}","${tx.referenceId || ''}","${qRef}","${invRef}","${recordedBy}","${desc}"\n`;
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
    const userRole = (req.user?.role || '').toUpperCase();
    const userEmail = (req.user?.email || '').toLowerCase();
    const isSuper =
      userRole === 'SUPER_ADMIN' ||
      userEmail === (process.env.SUPER_ADMIN_EMAIL || "alterakitcheninteriorr@gmail.com").toLowerCase();

    if (!isSuper) {
      return res.status(403).json({ success: false, message: 'Only Super Admin is authorized to delete transactions.' });
    }

    const transaction = await Transaction.findByIdAndDelete(id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    // Socket.io Real-time emit
    const io = req.app.get('io');
    if (io) {
      io.emit('transaction_deleted', {
        id: transaction._id,
        transactionId: transaction.transactionId,
      });
    }

    res.status(200).json({
      success: true,
      message: `Transaction ${transaction.transactionId} deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};
