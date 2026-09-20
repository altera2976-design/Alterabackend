const mongoose = require("mongoose");
const Client = require("./src/models/Client");
const Project = require("./src/models/Project");
require("dotenv").config();

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB");

    await Client.deleteMany();
    await Project.deleteMany();

    // Create Clients & Leads
    const clients = await Client.create([
      {
        name: "Rahul Sharma",
        company: "Sharma Residence",
        phone: "9876543210",
        email: "rahul@example.com",
        type: "Client",
        status: "Active",
        latestActivity: "Project started",
      },
      {
        name: "Amit Verma",
        company: "Verma Tech",
        phone: "9876543212",
        email: "amit@example.com",
        type: "Lead",
        status: "New",
        latestActivity: "Requested Quote",
      },
      {
        name: "Priya Mehta",
        company: "Mehta Villas",
        phone: "9876543211",
        email: "priya@example.com",
        type: "Client",
        status: "Active",
        latestActivity: "Payment received",
      },
    ]);

    // Create Projects assigned to those Clients!
    await Project.create([
      {
        projectId: "PR-00001",
        name: "Modular Kitchen",
        client: "Rahul Sharma",
        value: 245000,
        status: "In Progress",
        progress: 45,
        tasks: 12,
        startDate: "10 May 2024",
        deadline: "15 Jun 2024",
        assignedTeam: "Ravi Kumar",
        description: "Complete modular kitchen setup.",
      },
      {
        projectId: "PR-00002",
        name: "Living Room Interior",
        client: "Priya Mehta",
        value: 450000,
        status: "Planning",
        progress: 10,
        tasks: 5,
        startDate: "01 Jun 2024",
        deadline: "30 Jul 2024",
        assignedTeam: "Anita Patel",
        description: "Luxury living room.",
      },
    ]);

    console.log("Seeded successfully!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};
seed();
