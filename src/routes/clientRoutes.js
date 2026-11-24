const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const clientController = require('../controllers/clientController');

router.use(protect); // All client routes require auth

router.route('/')
  .get(checkPermission('crm_customers', 'view'), clientController.getClients)
  .post(checkPermission('crm_customers', 'create'), clientController.createClient);

router.route('/:id')
  .put(checkPermission('crm_customers', 'edit'), clientController.updateClient)
  .delete(checkPermission('crm_customers', 'delete'), clientController.deleteClient);

module.exports = router;
