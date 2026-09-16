require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: "*", // allow all origins for now
      methods: ["GET", "POST"]
    }
  });

  // Make io accessible globally
  app.set("io", io);

  io.on("connection", (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);
    
    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log("");
      console.log(`⚠️ Port ${PORT} is already occupied by the backend.`);
      console.log(`✅ Reusing the existing running server instance...`);
      console.log("");
      process.exit(0); // Exit cleanly instead of crashing, so nodemon/npm doesn't throw errors
    } else {
      console.error("❌ Server Error:", err);
      process.exit(1);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log("");
    console.log("🚀 EMS Backend Server with WebSockets");
    console.log(`   Mode:    ${process.env.NODE_ENV}`);
    console.log(`   Port:    ${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/api/health`);
    console.log("");
  });

  // Graceful shutdown logic to ensure port is freed on restart
  const gracefulShutdown = () => {
    console.log("🔄 Initiating clean shutdown...");
    server.close(() => {
      console.log("✅ Server closed. Port released.");
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  // nodemon restart signal
  process.on('SIGUSR2', gracefulShutdown);
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err.message);
  process.exit(1);
});

startServer();
