const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const clientController = require('../controllers/clientController');

router.use(protect); // All client routes require auth

router.route('/')
  .get(clientController.getClients)
  .post(clientController.createClient);

router.route('/:id')
  .put(clientController.updateClient)
  .delete(clientController.deleteClient);

module.exports = router;
