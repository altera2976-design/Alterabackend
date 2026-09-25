const crypto = require('crypto');
const Setting = require('../models/Setting');
const Quotation = require('../models/Quotation');
const Project = require('../models/Project');
const Client = require('../models/Client');

// ── Default Terms & Conditions ───────────────────────────────────────────────
const DEFAULT_TERMS = [
  '1. Quotation Validity: This quotation is valid for 30 days from the date of issue.',
  '2. Measurement & Design Variation: Cost may vary as per actual site measurements and architectural modifications.',
  '3. Extra Work: Any additional work not covered in this estimate will be billed separately with prior client approval.',
  '4. Advance & Booking Policy: 10% booking token required to commence 3D designs and site surveys.',
  '5. Timeline & Delivery: Standard delivery is 40–50 working days from approval of final drawings and receipt of procurement advance.',
  '6. Taxes & Statutory: GST @ 18% is applicable as per government regulations unless specified otherwise.',
  '7. Client Scope: Power supply, water connection, and unhindered site access must be provided by the client during installation.',
  '8. Final Handover: Handover will be conducted upon full settlement of all outstanding milestone payments.',
];

// ── Default Payment Milestones (Reference percentages) ────────────────────────
const DEFAULT_MILESTONES = [
  { milestoneName: 'Booking Token', percentage: 10, stage: 'Initial site survey & layout planning' },
  { milestoneName: 'Design & 3D Finalization', percentage: 20, stage: '3D renders and material approvals' },
  { milestoneName: 'Civil & Material Procurement', percentage: 25, stage: 'Raw material procurement & onsite civil' },
  { milestoneName: 'Modular Factory Production', percentage: 20, stage: 'Carcass and shutter fabrication' },
  { milestoneName: 'Installation & Finishing', percentage: 20, stage: 'Onsite assembly and hardware fitting' },
  { milestoneName: 'Final Handover & Snagging', percentage: 5, stage: 'Quality check and key handover' },
];

// ── Default Room Categories ──────────────────────────────────────────────────
const DEFAULT_ROOM_CATEGORIES = [
  'Living Room',
  'Modular Kitchen',
  'Master Bedroom',
  'Bedroom 01',
  'Bedroom 02',
  'Bedroom 03',
  'Dining Room',
  'Bathroom',
  'Balcony',
  'Entrance / Foyer',
  'Study Room',
  'Home Office',
  'Kids Room',
  'Pooja / Mandir',
  'Walk-in Wardrobe',
  'Utility / Dry Balcony',
  'Other',
];

const DEFAULT_COMPANY_DETAILS = {
  name: 'Altera Interior',
  tagline: 'The Modern Home Maker • Interior | Architect | Construction',
  address: 'Plot 42, Sector 18, Commercial Hub, New Delhi - 110001',
  phone: '+91 98765 43210',
  email: 'contact@alterainterior.com',
  gstin: '07AAAAA0000A1Z5',
  logoUrl: '',
};

const DEFAULT_BANK_DETAILS = {
  accountName: 'Altera Interior Pvt. Ltd.',
  bankName: 'HDFC Bank Ltd.',
  accountNumber: '50200012345678',
  ifscCode: 'HDFC0001234',
  branch: 'Sector 18 Commercial Branch',
  upiId: 'altera@hdfcbank',
};

/**
 * Converts numbers into Indian Currency format words (Rupees ... Only)
 */
function numberToWordsINR(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Zero Rupees Only';
  const val = Math.round(Math.abs(num));
  if (val === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n === 0) return '';
    if (n < 10) return singleDigits[n];
    if (n < 20) return teens[n - 10];
    const unit = n % 10;
    const ten = Math.floor(n / 10);
    return tens[ten] + (unit > 0 ? '-' + singleDigits[unit] : '');
  }

  function convertThreeDigits(n) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let str = '';
    if (hundred > 0) {
      str += singleDigits[hundred] + ' Hundred';
      if (rest > 0) str += ' and ';
    }
    str += convertTwoDigits(rest);
    return str.trim();
  }

  const crore = Math.floor(val / 10000000);
  let rem = val % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundredAndRest = rem;

  const parts = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(convertThreeDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
  if (hundredAndRest > 0) parts.push(convertThreeDigits(hundredAndRest));

  return `Rupees ${parts.join(' ')} Only`;
}

/**
 * Generate sequential unique quotation number: QT-YYYY-XXXXX
 */
async function generateQuotationNumber() {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;

  // Find latest quotation with this prefix
  const latest = await Quotation.findOne({
    quotationNumber: new RegExp(`^${prefix}`),
  })
    .sort({ quotationNumber: -1, createdAt: -1 })
    .lean();

  let nextSeq = 1001;
  if (latest && latest.quotationNumber) {
    const parts = latest.quotationNumber.split('-');
    if (parts.length >= 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

/**
 * Fetch or initialize Quotation global settings
 */
async function getQuotationConfig() {
  let setting = await Setting.findOne({ key: 'QUOTATION_CONFIG' });
  if (!setting) {
    setting = await Setting.create({
      key: 'QUOTATION_CONFIG',
      value: {
        companyDetails: DEFAULT_COMPANY_DETAILS,
        bankDetails: DEFAULT_BANK_DETAILS,
        termsAndConditions: DEFAULT_TERMS,
        defaultMilestones: DEFAULT_MILESTONES,
        roomCategories: DEFAULT_ROOM_CATEGORIES,
        defaultGstPercent: 18,
        defaultHandlingFeePercent: 2,
        defaultDesignFeePercent: 2,
      },
      description: 'Interior quotation templates, company metadata, bank details, and room categories',
    });
  }
  return setting.value;
}

/**
 * Calculates complete itemized amounts, fees, taxes, milestones, and grand total
 */
function calculateQuotationPricing(items = [], pricingOptions = {}, milestones = []) {
  let rawSubtotal = 0;

  // Process item calculations
  const calculatedItems = items.map((item, idx) => {
    const length = Number(item.measurements?.length) || 0;
    const width = Number(item.measurements?.width) || 0;
    const height = Number(item.measurements?.height) || 0;

    let calculatedArea = 0;
    if (length > 0 && (height > 0 || width > 0)) {
      calculatedArea = Math.round(length * (height || width) * 100) / 100;
    }

    // Use calculated area if quantity not explicitly manually modified or default
    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : calculatedArea > 0 ? calculatedArea : 1;
    const rate = Number(item.rate) || 0;
    const itemAmount = Math.round(qty * rate);

    rawSubtotal += itemAmount;

    return {
      ...item,
      itemNumber: item.itemNumber || idx + 1,
      measurements: {
        length,
        width,
        height,
        calculatedArea,
      },
      quantity: qty,
      rate,
      amount: itemAmount,
    };
  });

  // Additional Charges
  const handlingFeePercent = Number(pricingOptions.handlingFeePercent) || 0;
  const handlingFeeAmount =
    pricingOptions.handlingFeeAmount !== undefined
      ? Number(pricingOptions.handlingFeeAmount)
      : Math.round(rawSubtotal * (handlingFeePercent / 100));

  const designFeePercent = Number(pricingOptions.designFeePercent) || 0;
  const designFeeAmount =
    pricingOptions.designFeeAmount !== undefined
      ? Number(pricingOptions.designFeeAmount)
      : Math.round(rawSubtotal * (designFeePercent / 100));

  // Discount
  const discountType = pricingOptions.discountType === 'FIXED' ? 'FIXED' : 'PERCENT';
  const discountValue = Number(pricingOptions.discountValue) || 0;
  let discountAmount = 0;
  if (discountType === 'PERCENT') {
    discountAmount = Math.round(rawSubtotal * (discountValue / 100));
  } else {
    discountAmount = Math.min(rawSubtotal, discountValue);
  }

  // Taxable Amount
  const taxableAmount = Math.max(0, rawSubtotal + handlingFeeAmount + designFeeAmount - discountAmount);

  // GST
  const gstPercent = pricingOptions.gstPercent !== undefined ? Number(pricingOptions.gstPercent) : 18;
  const gstType = ['IGST', 'AS_PER_ACTUAL'].includes(pricingOptions.gstType) ? pricingOptions.gstType : 'CGST_SGST';
  
  let totalGstAmount = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (gstType === 'AS_PER_ACTUAL') {
    totalGstAmount = 0;
  } else if (gstType === 'IGST') {
    totalGstAmount = Math.round(taxableAmount * (gstPercent / 100));
    igstAmount = totalGstAmount;
  } else {
    totalGstAmount = Math.round(taxableAmount * (gstPercent / 100));
    cgstAmount = Math.round(totalGstAmount / 2);
    sgstAmount = totalGstAmount - cgstAmount;
  }

  const grandTotal = Math.round(taxableAmount + totalGstAmount);
  const amountInWords = numberToWordsINR(grandTotal);

  // Milestone validation & amounts
  const activeMilestones = (milestones && milestones.length > 0 ? milestones : DEFAULT_MILESTONES).map(m => {
    const pct = Number(m.percentage) || 0;
    const milestoneAmount = Math.round(grandTotal * (pct / 100));
    return {
      milestoneName: m.milestoneName,
      percentage: pct,
      amount: milestoneAmount,
      stage: m.stage || '',
    };
  });

  const totalPercentage = Math.round(activeMilestones.reduce((acc, m) => acc + m.percentage, 0) * 10) / 10;
  const isMilestonesValid = Math.abs(totalPercentage - 100) < 0.5;

  return {
    calculatedItems,
    pricing: {
      subtotal: rawSubtotal,
      handlingFeePercent,
      handlingFeeAmount,
      designFeePercent,
      designFeeAmount,
      discountType,
      discountValue,
      discountAmount,
      taxableAmount,
      gstPercent,
      gstType,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalGstAmount,
      grandTotal,
      amountInWords,
    },
    paymentMilestones: activeMilestones,
    isMilestonesValid,
    totalPercentage,
  };
}

/**
 * Generate secure public access token for client quotation view & approval
 */
function generatePublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Convert an approved quotation into an active Project document in MongoDB
 */
async function convertQuotationToProject(quotation, user) {
  // Generate Project ID: PR-XXXXX
  const latestProject = await Project.findOne({}).sort({ createdAt: -1 }).lean();
  let nextSeq = 101;
  if (latestProject && latestProject.projectId) {
    const num = parseInt(latestProject.projectId.replace(/\D/g, ''), 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  const projectIdStr = `PR-${String(nextSeq).padStart(3, '0')}`;

  const clientName = quotation.client?.name || 'Client';

  // Check or create Client in CRM
  let clientDoc = null;
  if (quotation.clientId) {
    clientDoc = await Client.findById(quotation.clientId);
  }
  if (!clientDoc && quotation.client?.email) {
    clientDoc = await Client.findOne({ email: quotation.client.email });
  }
  if (!clientDoc) {
    clientDoc = await Client.create({
      name: clientName,
      company: quotation.client?.company || '',
      phone: quotation.client?.phone || '',
      email: quotation.client?.email || '',
      type: 'Client',
      status: 'Active',
      latestActivity: `Converted from Quotation ${quotation.quotationNumber}`,
    });
  } else if (clientDoc.type !== 'Client') {
    clientDoc.type = 'Client';
    clientDoc.status = 'Active';
    clientDoc.latestActivity = `Converted from Quotation ${quotation.quotationNumber}`;
    await clientDoc.save();
  }

  // Create Project document
  const project = await Project.create({
    projectId: projectIdStr,
    name: quotation.projectTitle || `${clientName} Interior`,
    client: clientName,
    value: quotation.pricing?.grandTotal || 0,
    status: 'Planning',
    progress: 10,
    tasks: quotation.items ? quotation.items.length : 12,
    assignedTeam: quotation.assignedDesignerName || user.name || 'Design Team',
    startDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    deadline: quotation.validUntil
      ? new Date(quotation.validUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '',
    description: `Created from Quotation ${quotation.quotationNumber}. Scope: ${quotation.items?.length || 0} interior work items. Site: ${quotation.siteLocation || 'Onsite'}.`,
  });

  return { project, client: clientDoc };
}

/**
 * Calculates payment summary (totalAmount, paidAmount, remainingAmount, paymentStatus)
 * for a quotation from associated Transaction records
 */
async function getQuotationPaymentDetails(quotationId, grandTotal = 0) {
  const Transaction = require('../models/Transaction');
  const transactions = await Transaction.find({ quotationId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .lean();

  const totalAmount = Number(grandTotal) || 0;
  const paidAmount = transactions
    .filter((t) => ['Completed', 'Success', 'Paid'].includes(t.status))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

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

module.exports = {
  DEFAULT_TERMS,
  DEFAULT_MILESTONES,
  DEFAULT_ROOM_CATEGORIES,
  DEFAULT_COMPANY_DETAILS,
  DEFAULT_BANK_DETAILS,
  numberToWordsINR,
  generateQuotationNumber,
  getQuotationConfig,
  calculateQuotationPricing,
  generatePublicToken,
  convertQuotationToProject,
  getQuotationPaymentDetails,
};
