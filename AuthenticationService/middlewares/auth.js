const {UnauthenticatedError} = require('../errors');

const jwt = require('jsonwebtoken');
const config = require('../config/env');

const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if(!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthenticatedError('Authentication invalid');
    }
    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, config.jwt.secret);
        if(!payload) {
            throw new UnauthenticatedError('Authentication invalid');
        }
        req.user = { userId: payload.userId, name: payload.name, email: payload.email };
        res.setHeader('X-User-Id', payload.userId);
        res.setHeader('X-User-Name', payload.name);
        res.setHeader('X-User-Email', payload.email);

        next();
    } catch (error) {
        console.log(error);
        throw new UnauthenticatedError('Authentication invalid');
    }
}

module.exports = auth;