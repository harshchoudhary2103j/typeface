const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const UserSchema = new mongoose.Schema({
    name: {
        firstname: {
            type: String,
            required: [true, 'Please provide first name'],
            minlength: 3,
            maxlength: 50,
        },
        middlename: {
            type: String,
            maxlength: 50,
        },
        lastname: {
            type: String,
            required: [true, 'Please provide last name'],
            minlength: 3,
            maxlength: 50,
        },
    },
    email: {
        type: String,
        required: [true, 'Please provide email'],
        match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        'Please provide a valid email',
        ],
        unique: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide password'],
        minlength: 6,
    },
});

UserSchema.pre('save', async function(next) {
    const user = this;
    if(!user.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(user.password, salt);
    user.password = hash;
    next();
});

UserSchema.methods.createJWT = function () {
    return jwt.sign(
        { userId: this._id, name: this.name.firstname + ' ' + this.name.lastname, email: this.email },
        config.jwt.secret,
        {
            expiresIn: config.jwt.lifetime,
        }
    );
};

UserSchema.methods.comparePassword = async function (canditatePassword) {
    const isMatch = await bcrypt.compare(canditatePassword, this.password);
    return isMatch;
};

module.exports = mongoose.model('User', UserSchema);
