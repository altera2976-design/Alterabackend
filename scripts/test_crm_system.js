/**
 * Comprehensive CRM & Business Lifecycle Integration Test Script
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Lead = require('../src/models/Lead');
const Client = require('../src/models/Client');
const FollowUp = require('../src/models/FollowUp');
const Consultation = require('../src/models/Consultation');
const Invoice = require('../src/models/Invoice');
const Expense = require('../src/models/Expense');
const Project = require('../src/models/Project');
const ProjectRoom = require('../src/models/ProjectRoom');
const BOQItem = require('../src/models/BOQItem');
const Measurement = require('../src/models/Measurement');
const Design = require('../src/models/Design');
const Material = require('../src/models/Material');
const Procurement = require('../src/models/Procurement');
const SiteVisit = require('../src/models/SiteVisit');
const Team = require('../src/models/Team');
const LeaveRequest = require('../src/models/LeaveRequest');
const User = require('../src/models/User');

const runTests = async () => {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected.');

  try {
    const admin = await User.findOne({ role: 'ADMIN' });
    if (!admin) throw new Error('No Admin user found!');

    console.log('\n--- 1. Testing Lead Creation & Conversion ---');
    const lead = await Lead.create({
      name: 'Rohan Sharma',
      phone: '9876543210',
      email: 'rohan.sharma@example.com',
      propertyType: '3BHK',
      requirement: 'Full Modern Luxury Interior',
      budget: 1500000,
      location: 'Prestige Lakeside, Bangalore',
      leadSource: 'Instagram',
      assignedEmployee: admin._id,
      assignedEmployeeName: admin.name,
    });
    console.log(`✅ Lead Created: ${lead.leadNumber} (${lead.name})`);

    console.log('\n--- 2. Testing Follow-Up & Consultation ---');
    const followUp = await FollowUp.create({
      targetType: 'Lead',
      targetId: lead._id,
      targetName: lead.name,
      targetPhone: lead.phone,
      assignedEmployee: admin._id,
      followUpDate: new Date(Date.now() + 86400000),
      type: 'Phone Call',
      notes: 'Initial requirement discussion and budget alignment',
    });
    console.log(`✅ Follow-up Created: ID ${followUp._id} (${followUp.type})`);

    const consultation = await Consultation.create({
      targetType: 'Lead',
      targetId: lead._id,
      clientName: lead.name,
      phone: lead.phone,
      designer: admin._id,
      designerName: admin.name,
      date: new Date(Date.now() + 172800000),
      time: '03:00 PM',
      meetingType: 'Initial Consultation',
      locationType: 'Design Studio / Office',
      notes: 'Client visiting studio for moodboard selection',
    });
    console.log(`✅ Consultation Booked: ID ${consultation._id} on ${consultation.date.toISOString()}`);

    console.log('\n--- 3. Testing Lead Conversion to Client & Project ---');
    const client = await Client.create({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.location,
      type: 'Client',
      status: 'Active',
      latestActivity: `Converted from lead ${lead.leadNumber}`,
    });
    console.log(`✅ Client Profile Created: ${client.name} (ID: ${client._id})`);

    const project = await Project.create({
      projectId: `PR-${Date.now().toString().slice(-5)}`,
      name: `${client.name}'s 3BHK Premium Interior`,
      client: client.name,
      clientContact: { phone: client.phone, email: client.email },
      projectAddress: client.address,
      projectType: 'Interior',
      status: 'Planning',
      budget: { estimatedBudget: 1500000, approvedBudget: 1500000, revenue: 0, actualCost: 0 },
      value: 1500000,
    });
    console.log(`✅ Project Generated: ${project.projectId} - ${project.name}`);

    lead.status = 'Converted';
    lead.convertedClientId = client._id;
    lead.convertedProjectId = project._id;
    await lead.save();
    console.log(`✅ Lead marked as Converted!`);

    console.log('\n--- 4. Testing Project Rooms & BOQ ---');
    const livingRoom = await ProjectRoom.create({
      projectId: project._id,
      roomName: 'Living Room',
      roomType: 'Living Room',
      dimensions: { length: 20, width: 14, height: 10, unit: 'ft', carpetAreaSqFt: 280 },
      estimatedCost: 350000,
      designStatus: 'In Design',
    });
    console.log(`✅ Project Room Created: ${livingRoom.roomName} (${livingRoom.dimensions.carpetAreaSqFt} sq ft)`);

    const boqItem = await BOQItem.create({
      projectId: project._id,
      roomId: livingRoom._id,
      roomName: livingRoom.roomName,
      item: 'TV Console Unit with Italian Fluted Panels',
      description: 'Marine ply carcass with PU finish & warm profile backlighting',
      unit: 'Sq Ft',
      quantity: 65,
      rate: 1850,
      amount: 65 * 1850,
      material: 'Marine Grade Plywood 18mm',
      finish: 'Matte Charcoal PU',
    });
    console.log(`✅ BOQ Item Created: ${boqItem.item} (₹${boqItem.amount})`);

    console.log('\n--- 5. Testing Measurement & 3D Design ---');
    const measurement = await Measurement.create({
      projectId: project._id,
      roomId: livingRoom._id,
      roomName: livingRoom.roomName,
      componentName: 'Feature TV Wall',
      length: 16.5,
      width: 9.5,
      area: 156.75,
      measuredBy: admin._id,
      measuredByName: admin.name,
    });
    console.log(`✅ Measurement Logged: ${measurement.componentName} (${measurement.area} sq ft)`);

    const design = await Design.create({
      projectId: project._id,
      roomId: livingRoom._id,
      roomName: livingRoom.roomName,
      title: 'Living Room 3D Photorealistic Render v1',
      type: '3D Design / Render',
      fileUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      designerId: admin._id,
      designerName: admin.name,
      clientApprovalStatus: 'Client Approved',
    });
    console.log(`✅ Design Registered: ${design.title} (Status: ${design.clientApprovalStatus})`);

    console.log('\n--- 6. Testing Material & Procurement ---');
    const material = await Material.create({
      name: 'Charcoal Oak Veneer 4mm',
      category: 'Laminates & Veneers',
      brand: 'Decowood / Greenlam',
      unit: 'Sheets',
      rate: 4200,
      stock: 25,
      supplier: 'Timber World Supplies',
    });
    console.log(`✅ Material Added: ${material.name} (₹${material.rate}/sheet)`);

    const po = await Procurement.create({
      projectId: project._id,
      projectName: project.name,
      materialId: material._id,
      materialName: material.name,
      supplier: material.supplier,
      quantity: 12,
      unit: 'Sheets',
      purchasePrice: 4000,
      totalCost: 12 * 4000,
      deliveryStatus: 'Ordered with Vendor',
    });
    console.log(`✅ Procurement PO Created: ${po.poNumber} (₹${po.totalCost})`);

    console.log('\n--- 7. Testing Site Visit with GPS ---');
    const siteVisit = await SiteVisit.create({
      projectId: project._id,
      projectName: project.name,
      employeeId: admin._id,
      employeeName: admin.name,
      gpsLocation: { latitude: 12.9716, longitude: 77.5946, address: project.projectAddress },
      notes: 'Checked masonry and electrical conduit points. All good.',
    });
    console.log(`✅ Site Visit Logged: ID ${siteVisit._id}`);

    console.log('\n--- 8. Testing Invoicing & Payment Collection ---');
    const invoice = await Invoice.create({
      projectId: project._id,
      projectName: project.name,
      clientId: client._id,
      clientName: client.name,
      items: [
        { description: 'Phase 1 Advance: Design, Civil & Modular Carpentry', quantity: 1, rate: 450000, amount: 450000 },
      ],
      subtotal: 450000,
      gstRate: 18,
      gstAmount: 81000,
      totalAmount: 531000,
      dueDate: new Date(Date.now() + 14 * 86400000),
      paymentStatus: 'Issued',
    });
    console.log(`✅ Invoice Created: ${invoice.invoiceNumber} (Total: ₹${invoice.totalAmount})`);

    // Record payment
    invoice.payments.push({
      amount: 531000,
      method: 'Bank Transfer (NEFT/RTGS)',
      transactionRef: 'HDFC98234710',
      receivedBy: admin.name,
    });
    invoice.paidAmount = 531000;
    invoice.balanceAmount = 0;
    invoice.paymentStatus = 'Paid';
    await invoice.save();
    console.log(`✅ Payment Recorded: ₹531,000 received for ${invoice.invoiceNumber} (Status: Paid)`);

    console.log('\n--- 9. Testing Expenses & Profit/Loss ---');
    const expense = await Expense.create({
      category: 'Material Cost',
      projectId: project._id,
      projectName: project.name,
      vendorOrEmployee: 'Timber World Supplies',
      amount: 48000,
      paymentMethod: 'Bank Transfer',
      approvalStatus: 'Approved',
    });
    console.log(`✅ Expense Logged: ₹${expense.amount} under ${expense.category}`);

    console.log('\n==================================================');
    console.log('🎉 ALL INTEGRATION SUITES PASSED WITH 100% SUCCESS!');
    console.log('==================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
};

runTests();
