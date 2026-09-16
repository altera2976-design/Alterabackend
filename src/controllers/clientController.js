const Client = require("../models/Client");

exports.getClients = async (req, res, next) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res
      .status(200)
      .json({ success: true, count: clients.length, data: clients });
  } catch (error) {
    next(error);
  }
};

exports.createClient = async (req, res, next) => {
  try {
    const client = await Client.create(req.body);
    const io = req.app.get("io");
    if (io) {
      io.emit("crm_updated", { type: "CLIENT_CREATED", client });
      io.emit("dashboard_updated", { type: "CLIENT_CREATED" });
    }
    res.status(201).json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
};

exports.updateClient = async (req, res, next) => {
  try {
    let client = await Client.findById(req.params.id);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }

    const updates = { ...req.body };

    // Auto-upgrade Lead to Client if status becomes Active or Qualified
    if (
      client.type === "Lead" &&
      (updates.status === "Active" || updates.status === "Qualified")
    ) {
      updates.type = "Client";
      updates.latestActivity = "Converted to Client";
    }

    client = await Client.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("crm_updated", { type: "CLIENT_UPDATED", client });
      io.emit("dashboard_updated", { type: "CLIENT_UPDATED" });
    }

    res.status(200).json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
};

exports.deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }
    const io = req.app.get("io");
    if (io) {
      io.emit("crm_updated", { type: "CLIENT_DELETED", id: req.params.id });
      io.emit("dashboard_updated", { type: "CLIENT_DELETED" });
    }
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
