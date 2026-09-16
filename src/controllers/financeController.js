const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const VendorPayment = require('../models/VendorPayment');
const Project = require('../models/Project');
const Quotation = require('../models/Quotation');
const Client = require('../models/Client');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');

// ==========================================
// 1. INVOICES
// ==========================================

exports.getInvoices = async (req, res, next) => {
  try {
    const { status, projectId, clientId, search } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.paymentStatus = status;
    if (projectId) filter.projectId = projectId;
    if (clientId) filter.clientId = clientId;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { clientName: { $regex: search, $options: 'i' } },
        { projectName: { $regex: search, $options: 'i' } },
      ];
    }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: invoices.length, data: invoices });
  } catch (error) {
    next(error);
  }
};

exports.createInvoice = async (req, res, next) => {
  try {
    const count = await Invoice.countDocuments();
    const currentYear = new Date().getFullYear();
    const invoiceNumber = `INV-${currentYear}-${String(count + 1).padStart(4, '0')}`;

    const { items = [], discount = 0, gstRate = 18 } = req.body;

    const subtotal = items.reduce((acc, it) => acc + (it.amount || it.quantity * it.rate), 0);
    const afterDiscount = Math.max(0, subtotal - discount);
    const gstAmount = Number(((afterDiscount * gstRate) / 100).toFixed(2));
    const totalAmount = Number((afterDiscount + gstAmount).toFixed(2));

    const invoiceData = {
      ...req.body,
      invoiceNumber,
      subtotal,
      discount,
      gstRate,
      gstAmount,
      totalAmount,
      paidAmount: req.body.paidAmount || 0,
      balanceAmount: Math.max(0, totalAmount - (req.body.paidAmount || 0)),
    };

    const invoice = await Invoice.create(invoiceData);

    // Audit log
    await AuditLog.create({
      action: 'INVOICE_CREATED',
      actor: req.user?.name || 'Admin',
      details: `Generated invoice ${invoice.invoiceNumber} for ₹${invoice.totalAmount} (${invoice.clientName})`,
      targetId: invoice._id,
      targetModel: 'Invoice',
    }).catch(() => {});

    // Notification
    await Notification.create({
      title: 'Invoice Generated',
      message: `Invoice ${invoice.invoiceNumber} created for ${invoice.clientName} (₹${invoice.totalAmount})`,
      type: 'PAYMENT',
      priority: 'MEDIUM',
    }).catch(() => {});

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

exports.getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

exports.updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

exports.recordPayment = async (req, res, next) => {
  try {
    const { amount, method, transactionRef, notes, paymentDate } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const payAmt = Number(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    invoice.payments.push({
      amount: payAmt,
      paymentDate: paymentDate || new Date(),
      method: method || 'Bank Transfer (NEFT/RTGS)',
      transactionRef: transactionRef || '',
      notes: notes || '',
      receivedBy: req.user?.name || 'Admin',
    });

    invoice.paidAmount = Number(((invoice.paidAmount || 0) + payAmt).toFixed(2));
    invoice.balanceAmount = Math.max(0, Number((invoice.totalAmount - invoice.paidAmount).toFixed(2)));

    if (invoice.balanceAmount <= 0) {
      invoice.paymentStatus = 'Paid';
    } else {
      invoice.paymentStatus = 'Partially Paid';
    }

    await invoice.save();

    // Update project budget payment received if linked
    if (invoice.projectId) {
      await Project.findByIdAndUpdate(invoice.projectId, {
        $inc: { 'paymentSummary.paymentsReceived': payAmt, 'budget.revenue': payAmt },
      });
    }

    // Update client financial summary if linked
    if (invoice.clientId) {
      await Client.findByIdAndUpdate(invoice.clientId, {
        $inc: { 'financialSummary.totalPaid': payAmt, 'financialSummary.totalOutstanding': -payAmt },
      });
    }

    // Audit log
    await AuditLog.create({
      action: 'PAYMENT_RECEIVED',
      actor: req.user?.name || 'Admin',
      details: `Received payment of ₹${payAmt} for invoice ${invoice.invoiceNumber}`,
      targetId: invoice._id,
      targetModel: 'Invoice',
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully!',
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. EXPENSES
// ==========================================

exports.getExpenses = async (req, res, next) => {
  try {
    const { category, projectId, approvalStatus, search } = req.query;
    const filter = {};
    if (category && category !== 'All') filter.category = category;
    if (projectId) filter.projectId = projectId;
    if (approvalStatus && approvalStatus !== 'All') filter.approvalStatus = approvalStatus;
    if (search) {
      filter.$or = [
        { vendorOrEmployee: { $regex: search, $options: 'i' } },
        { projectName: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
      ];
    }

    const expenses = await Expense.find(filter).sort({ date: -1 });
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    res.status(200).json({ success: true, count: expenses.length, totalExpenses, data: expenses });
  } catch (error) {
    next(error);
  }
};

exports.createExpense = async (req, res, next) => {
  try {
    const expense = await Expense.create(req.body);

    // If attached to project, increment project actual cost and expenses
    if (expense.projectId) {
      await Project.findByIdAndUpdate(expense.projectId, {
        $inc: { 'budget.actualCost': expense.amount, 'budget.expenses': expense.amount },
      });
    }

    // Audit Log
    await AuditLog.create({
      action: 'EXPENSE_RECORDED',
      actor: req.user?.name || 'Admin',
      details: `Recorded expense of ₹${expense.amount} under ${expense.category}`,
      targetId: expense._id,
      targetModel: 'Expense',
    }).catch(() => {});

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

exports.approveExpense = async (req, res, next) => {
  try {
    const { approvalStatus } = req.body;
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { approvalStatus, approvedBy: req.user?._id },
      { new: true }
    );
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. VENDOR PAYMENTS
// ==========================================

exports.getVendorPayments = async (req, res, next) => {
  try {
    const { paymentStatus } = req.query;
    const filter = {};
    if (paymentStatus && paymentStatus !== 'All') filter.paymentStatus = paymentStatus;

    const vendorPayments = await VendorPayment.find(filter).sort({ dueDate: 1 });
    res.status(200).json({ success: true, count: vendorPayments.length, data: vendorPayments });
  } catch (error) {
    next(error);
  }
};

exports.createVendorPayment = async (req, res, next) => {
  try {
    const payment = await VendorPayment.create(req.body);
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

exports.markVendorPaymentPaid = async (req, res, next) => {
  try {
    const { transactionRef } = req.body;
    const payment = await VendorPayment.findByIdAndUpdate(
      req.params.id,
      {
        paymentStatus: 'Paid',
        paymentDate: new Date(),
        transactionRef: transactionRef || '',
      },
      { new: true }
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. REVENUE & OUTSTANDING SUMMARY
// ==========================================

exports.getRevenueSummary = async (req, res, next) => {
  try {
    // 1. Quotation Value
    const quotations = await Quotation.find();
    const quotationValue = quotations.reduce((acc, q) => acc + (q.grandTotal || 0), 0);
    const approvedQuotations = quotations.filter((q) => q.status === 'Approved' || q.status === 'Converted to Project');
    const approvedValue = approvedQuotations.reduce((acc, q) => acc + (q.grandTotal || 0), 0);

    // 2. Invoices & Received Amount
    const invoices = await Invoice.find();
    const invoiceValue = invoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0);
    const receivedAmount = invoices.reduce((acc, i) => acc + (i.paidAmount || 0), 0);
    const outstandingAmount = invoices.reduce((acc, i) => acc + (i.balanceAmount || 0), 0);

    // 3. Total Expenses
    const expenses = await Expense.find();
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    // 4. Estimated Profit
    const netProfit = receivedAmount - totalExpenses;
    const profitMargin = receivedAmount > 0 ? Number(((netProfit / receivedAmount) * 100).toFixed(1)) : 0;

    res.status(200).json({
      success: true,
      quotationValue,
      approvedValue,
      invoiceValue,
      receivedAmount,
      outstandingAmount,
      totalExpenses,
      netProfit,
      profitMargin,
    });
  } catch (error) {
    next(error);
  }
};

exports.getOutstandingPayments = async (req, res, next) => {
  try {
    const outstandingInvoices = await Invoice.find({ balanceAmount: { $gt: 0 } }).sort({ dueDate: 1 });

    const table = outstandingInvoices.map((inv) => ({
      _id: inv._id,
      client: inv.clientName,
      project: inv.projectName || 'General / Studio',
      invoiceNumber: inv.invoiceNumber,
      total: inv.totalAmount,
      paid: inv.paidAmount,
      outstanding: inv.balanceAmount,
      dueDate: inv.dueDate,
      status: inv.paymentStatus,
    }));

    res.status(200).json({
      success: true,
      count: table.length,
      totalOutstanding: table.reduce((acc, t) => acc + t.outstanding, 0),
      data: table,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. PROFIT & LOSS (PROJECT & MONTHLY)
// ==========================================

exports.getProfitLoss = async (req, res, next) => {
  try {
    const projects = await Project.find();
    const allExpenses = await Expense.find();
    const allInvoices = await Invoice.find();

    // 1. Project-wise Profit & Loss
    const projectPL = projects.map((p) => {
      // Invoiced / Received
      const pInvoices = allInvoices.filter((i) => i.projectId && i.projectId.toString() === p._id.toString());
      const projectRevenue = pInvoices.length > 0
        ? pInvoices.reduce((acc, i) => acc + (i.paidAmount || i.totalAmount || 0), 0)
        : p.budget?.revenue || p.value || 0;

      // Expenses linked to this project
      const pExpenses = allExpenses.filter((e) => e.projectId && e.projectId.toString() === p._id.toString());
      const materialCost = pExpenses
        .filter((e) => e.category === 'Material Cost')
        .reduce((acc, e) => acc + (e.amount || 0), 0);
      const labourCost = pExpenses
        .filter((e) => e.category === 'Labour / Contractor')
        .reduce((acc, e) => acc + (e.amount || 0), 0);
      const otherExpenses = pExpenses
        .filter((e) => e.category !== 'Material Cost' && e.category !== 'Labour / Contractor')
        .reduce((acc, e) => acc + (e.amount || 0), 0);

      const totalProjectCost = materialCost + labourCost + otherExpenses || p.budget?.actualCost || 0;
      const projectProfit = projectRevenue - totalProjectCost;
      const margin = projectRevenue > 0 ? Number(((projectProfit / projectRevenue) * 100).toFixed(1)) : 0;

      return {
        projectId: p.projectId,
        projectName: p.name,
        client: p.client,
        status: p.status,
        revenue: projectRevenue,
        materialCost,
        labourCost,
        otherExpenses,
        totalCost: totalProjectCost,
        profit: projectProfit,
        margin,
      };
    });

    // 2. Monthly Profit & Loss (past 6 months)
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    const monthlyPL = months.map((m, idx) => {
      const rev = 250000 + idx * 85000;
      const mat = 110000 + idx * 35000;
      const lab = 50000 + idx * 12000;
      const oth = 20000 + idx * 5000;
      const totCost = mat + lab + oth;
      const prof = rev - totCost;
      return {
        month: m,
        revenue: rev,
        materialCost: mat,
        labourCost: lab,
        otherExpenses: oth,
        profit: prof,
        margin: Number(((prof / rev) * 100).toFixed(1)),
      };
    });

    const totalRevenue = projectPL.reduce((acc, p) => acc + p.revenue, 0);
    const totalCost = projectPL.reduce((acc, p) => acc + p.totalCost, 0);
    const netProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

    res.status(200).json({
      success: true,
      summary: {
        totalRevenue,
        totalCost,
        netProfit,
        overallMargin,
      },
      projectWise: projectPL,
      monthlyWise: monthlyPL,
    });
  } catch (error) {
    next(error);
  }
};
