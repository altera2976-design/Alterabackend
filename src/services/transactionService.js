const Transaction = require('../models/Transaction');

/**
 * Generate unique sequential transaction ID: TXN-YYYYMMDD-XXXXXX
 */
async function generateTransactionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const prefix = `TXN-${dateStr}-`;

  // Find latest transaction created today with this prefix
  const latest = await Transaction.findOne({
    transactionId: new RegExp(`^${prefix}`),
  })
    .sort({ transactionId: -1, createdAt: -1 })
    .select('transactionId')
    .lean();

  let nextSeq = 1;
  if (latest && latest.transactionId) {
    const parts = latest.transactionId.split('-');
    if (parts.length >= 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(6, '0')}`;
}

/**
 * Centralized transaction summary calculations via MongoDB Aggregations
 */
async function calculateTransactionTotals(baseQuery = {}) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Single-pass MongoDB Aggregation for maximum speed
  const aggResult = await Transaction.aggregate([
    { $match: baseQuery },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: { $toUpper: '$status' },
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
            },
          },
        ],
        todayStats: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [{ $toUpper: '$status' }, 'COMPLETED'] },
                  { $gte: [{ $ifNull: ['$transactionDate', '$createdAt'] }, startOfToday] },
                ],
              },
            },
          },
          { $group: { _id: null, sum: { $sum: '$amount' } } },
        ],
        monthStats: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [{ $toUpper: '$status' }, 'COMPLETED'] },
                  { $gte: [{ $ifNull: ['$transactionDate', '$createdAt'] }, startOfMonth] },
                ],
              },
            },
          },
          { $group: { _id: null, sum: { $sum: '$amount' } } },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const facet = aggResult[0] || {};
  const totalsList = facet.totals || [];
  const todayTotal = facet.todayStats?.[0]?.sum || 0;
  const monthTotal = facet.monthStats?.[0]?.sum || 0;
  const totalTransactions = facet.totalCount?.[0]?.count || 0;

  let completedTotalAmount = 0;
  let completedCount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let refundedAmount = 0;
  let refundedCount = 0;

  totalsList.forEach((st) => {
    const status = st._id;
    if (status === 'COMPLETED') {
      completedCount = st.count;
      completedTotalAmount = st.totalAmount;
    } else if (status === 'PENDING') {
      pendingCount = st.count;
      pendingAmount = st.totalAmount;
    } else if (status === 'REFUNDED') {
      refundedCount = st.count;
      refundedAmount = st.totalAmount;
    } else if (status === 'FAILED') {
      failedCount = st.count;
    }
  });

  return {
    totalTransactions,
    totalAmount: completedTotalAmount,
    completedTotalAmount,
    completedCount,
    totalCompletedCount: completedCount,
    pendingAmount,
    pendingCount,
    totalPendingCount: pendingCount,
    failedCount,
    refundedAmount,
    refundedCount,
    totalRefundedCount: refundedCount,
    todayTotal,
    monthTotal,
    monthlyTotal: monthTotal,
  };
}

module.exports = {
  generateTransactionId,
  calculateTransactionTotals,
};
