const Lead = require('../models/Lead');
const Client = require('../models/Client');
const FollowUp = require('../models/FollowUp');
const Consultation = require('../models/Consultation');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');

// ==========================================
// 1. LEADS
// ==========================================

exports.getLeads = async (req, res, next) => {
  try {
    const { status, source, search } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (source && source !== 'All') filter.leadSource = source;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { leadNumber: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    next(error);
  }
};

exports.createLead = async (req, res, next) => {
  try {
    const count = await Lead.countDocuments();
    const leadNumber = `LD-${String(count + 1).padStart(5, '0')}`;
    const leadData = {
      ...req.body,
      leadNumber,
      stageHistory: [{ stage: req.body.status || 'New Lead', note: 'Lead initially registered' }],
    };

    const lead = await Lead.create(leadData);

    // Audit Log
    await AuditLog.create({
      action: 'LEAD_CREATED',
      actor: req.user?.name || 'Admin',
      details: `Created new lead ${lead.leadNumber} (${lead.name})`,
      targetId: lead._id,
      targetModel: 'Lead',
    }).catch(() => {});

    // Notification
    await Notification.create({
      title: 'New Lead Received',
      message: `Lead ${lead.leadNumber} (${lead.name}) for ${lead.propertyType} ${lead.requirement}`,
      type: 'LEAD',
      priority: 'MEDIUM',
    }).catch(() => {});

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'LEAD_CREATED', lead });
      io.emit('dashboard_updated', { type: 'LEAD_CREATED' });
    }

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};

exports.updateLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (req.body.status && req.body.status !== lead.status) {
      lead.stageHistory.push({
        stage: req.body.status,
        note: req.body.stageNote || `Stage progressed to ${req.body.status}`,
      });
    }

    Object.assign(lead, req.body);
    await lead.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'LEAD_UPDATED', lead });
      io.emit('dashboard_updated', { type: 'LEAD_UPDATED' });
    }

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};

exports.deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'LEAD_DELETED', id: req.params.id });
      io.emit('dashboard_updated', { type: 'LEAD_DELETED' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

exports.convertLeadToClient = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    // 1. Create or find Client
    let client = await Client.findOne({ phone: lead.phone });
    if (!client) {
      client = await Client.create({
        name: lead.name,
        company: lead.company || '',
        phone: lead.phone,
        email: lead.email,
        address: lead.location,
        type: 'Client',
        status: 'Active',
        latestActivity: `Converted from lead ${lead.leadNumber}`,
        notes: lead.notes,
      });
    }

    // 2. Optionally create a preliminary project if requested
    let project = null;
    if (req.body.createProject) {
      const pCount = await Project.countDocuments();
      project = await Project.create({
        projectId: `PR-${String(pCount + 1).padStart(5, '0')}`,
        name: `${lead.name}'s ${lead.propertyType} ${lead.requirement}`,
        client: client.name,
        clientContact: { phone: client.phone, email: client.email },
        projectAddress: lead.location,
        projectType: 'Interior',
        status: 'Planning',
        budget: { estimatedBudget: lead.budget || 500000 },
        value: lead.budget || 500000,
      });
    }

    // 3. Mark Lead as Converted
    lead.status = 'Converted';
    lead.convertedClientId = client._id;
    if (project) lead.convertedProjectId = project._id;
    lead.stageHistory.push({
      stage: 'Converted',
      note: `Successfully converted to client: ${client.name}`,
    });
    await lead.save();

    // 4. Audit Log
    await AuditLog.create({
      action: 'LEAD_CONVERTED',
      actor: req.user?.name || 'Admin',
      details: `Lead ${lead.leadNumber} converted to Client ${client.name}`,
      targetId: client._id,
      targetModel: 'Client',
    }).catch(() => {});

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'LEAD_CONVERTED', client });
      io.emit('dashboard_updated', { type: 'LEAD_CONVERTED' });
    }

    res.status(200).json({
      success: true,
      message: 'Lead converted to client successfully!',
      client,
      project,
      lead,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. FOLLOW-UPS
// ==========================================

exports.getFollowUps = async (req, res, next) => {
  try {
    const { status, targetType } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (targetType && targetType !== 'All') filter.targetType = targetType;

    const followUps = await FollowUp.find(filter).sort({ followUpDate: 1 });
    res.status(200).json({ success: true, count: followUps.length, data: followUps });
  } catch (error) {
    next(error);
  }
};

exports.createFollowUp = async (req, res, next) => {
  try {
    const followUp = await FollowUp.create(req.body);

    // Update target nextFollowUpDate if it is a lead
    if (followUp.targetType === 'Lead' && followUp.targetId) {
      await Lead.findByIdAndUpdate(followUp.targetId, {
        nextFollowUpDate: followUp.followUpDate,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'FOLLOWUP_CREATED', followUp });
      io.emit('dashboard_updated', { type: 'FOLLOWUP_CREATED' });
    }

    res.status(201).json({ success: true, data: followUp });
  } catch (error) {
    next(error);
  }
};

exports.updateFollowUpStatus = async (req, res, next) => {
  try {
    const { status, completedNotes } = req.body;
    const followUp = await FollowUp.findById(req.params.id);
    if (!followUp) return res.status(404).json({ success: false, message: 'Follow-up not found' });

    followUp.status = status;
    if (status === 'Completed') {
      followUp.completedAt = new Date();
      if (completedNotes) followUp.completedNotes = completedNotes;
    }
    await followUp.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'FOLLOWUP_UPDATED', followUp });
      io.emit('dashboard_updated', { type: 'FOLLOWUP_UPDATED' });
    }

    res.status(200).json({ success: true, data: followUp });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. CONSULTATIONS / APPOINTMENTS
// ==========================================

exports.getConsultations = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;

    const consultations = await Consultation.find(filter).sort({ date: 1 });
    res.status(200).json({ success: true, count: consultations.length, data: consultations });
  } catch (error) {
    next(error);
  }
};

exports.createConsultation = async (req, res, next) => {
  try {
    const consultation = await Consultation.create(req.body);

    // If target is lead, advance lead stage to Consultation
    if (consultation.targetType === 'Lead' && consultation.targetId) {
      await Lead.findByIdAndUpdate(consultation.targetId, {
        status: 'Consultation',
        $push: {
          stageHistory: {
            stage: 'Consultation',
            note: `Consultation booked for ${new Date(consultation.date).toLocaleDateString()} (${consultation.meetingType})`,
          },
        },
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'CONSULTATION_CREATED', consultation });
      io.emit('dashboard_updated', { type: 'CONSULTATION_CREATED' });
    }

    res.status(201).json({ success: true, data: consultation });
  } catch (error) {
    next(error);
  }
};

exports.updateConsultationStatus = async (req, res, next) => {
  try {
    const { status, outcome } = req.body;
    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      { status, ...(outcome ? { outcome } : {}) },
      { new: true }
    );
    if (!consultation) return res.status(404).json({ success: false, message: 'Consultation not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('crm_updated', { type: 'CONSULTATION_UPDATED', consultation });
      io.emit('dashboard_updated', { type: 'CONSULTATION_UPDATED' });
    }

    res.status(200).json({ success: true, data: consultation });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. SALES PIPELINE & FUNNEL ANALYTICS
// ==========================================

exports.getSalesPipeline = async (req, res, next) => {
  try {
    const stages = [
      'New Lead',
      'Contacted',
      'Qualified',
      'Consultation',
      'Site Visit',
      'Design',
      'Quotation',
      'Negotiation',
      'Approved',
      'Converted',
    ];

    const allLeads = await Lead.find();
    const totalLeads = allLeads.length;

    const stageCounts = {};
    const stageValues = {};
    stages.forEach((s) => {
      stageCounts[s] = 0;
      stageValues[s] = 0;
    });

    allLeads.forEach((lead) => {
      const s = lead.status === 'Project' ? 'Converted' : lead.status;
      if (stageCounts[s] !== undefined) {
        stageCounts[s]++;
        stageValues[s] += lead.budget || 0;
      }
    });

    // Compute cumulative funnel / conversion rates
    const pipelineData = stages.map((stage, idx) => {
      const count = stageCounts[stage] || 0;
      const value = stageValues[stage] || 0;
      const prevCount = idx === 0 ? totalLeads : stageCounts[stages[idx - 1]] || 1;
      const conversionRate = totalLeads > 0 ? Number(((count / totalLeads) * 100).toFixed(1)) : 0;
      const stepRate = prevCount > 0 ? Number(((count / prevCount) * 100).toFixed(1)) : 100;

      return {
        stage,
        count,
        value,
        conversionRate,
        stepRate,
      };
    });

    const overallConversionRate =
      totalLeads > 0
        ? Number((((stageCounts['Converted'] || 0) / totalLeads) * 100).toFixed(1))
        : 0;

    res.status(200).json({
      success: true,
      totalLeads,
      overallConversionRate,
      pipeline: pipelineData,
    });
  } catch (error) {
    next(error);
  }
};
