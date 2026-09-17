const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { errorHandler } = require('./src/middleware/errorHandler');
const { generalLimiter } = require('./src/middleware/rateLimiter');

const app = express();

app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── Static uploaded files (selfies, documents) ──────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// ── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Global rate limiting (backstop — specific limits applied per-route) ───────
app.use(generalLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/health', require('./src/routes/health'));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/employees', require('./src/routes/employees'));
app.use('/api/attendance', require('./src/routes/attendanceRoutes'));
app.use('/api/payroll', require('./src/routes/payrollRoutes'));
app.use('/api/locations', require('./src/routes/locationRoutes'));
app.use('/api/projects', require('./src/routes/projectRoutes'));
app.use('/api/tasks', require('./src/routes/taskRoutes'));
app.use('/api/issues', require('./src/routes/issueRoutes'));
app.use('/api/audit-logs', require('./src/routes/auditRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/clients', require('./src/routes/clientRoutes'));
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));
app.use('/api/reports', require('./src/routes/reportRoutes'));
app.use('/api/trips', require('./src/routes/tripRoutes'));
app.use('/api/quotations', require('./src/routes/quotationRoutes'));
app.use('/api/settings', require('./src/routes/settingRoutes'));
app.use('/api/crm', require('./src/routes/crmRoutes'));
app.use('/api/finance', require('./src/routes/financeRoutes'));
app.use('/api/execution', require('./src/routes/projectExecutionRoutes'));

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Centralized error handler ─────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
