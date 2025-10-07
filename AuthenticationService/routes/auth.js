const express = require('express');
const router = express.Router();
const { register, login, verify } = require('../controllers/auth');
const auth = require('../middlewares/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/verify', auth, verify);

module.exports = router;
