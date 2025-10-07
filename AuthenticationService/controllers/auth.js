const User = require('../models/User');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, UnauthenticatedError } = require('../errors');

const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (typeof name !== 'string' || name.split(' ').length < 2) {
    throw new BadRequestError('Please provide a full name with at least a first and last name');
  }

  const nameParts = name.split(' ');
  const firstname = nameParts[0];
  const lastname = nameParts[nameParts.length - 1];
  const middlename = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined;

  const userObject = {
    name: {
      firstname,
      lastname,
    },
    email,
    password,
  };

  if (middlename) {
    userObject.name.middlename = middlename;
  }

  const user = await User.create(userObject);
  const token = user.createJWT();
  res.status(StatusCodes.CREATED).json({ user: { name: user.name }, token });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new BadRequestError('Please provide email and password');
  }
  const user = await User.findOne({ email });
  if (!user) {
    throw new UnauthenticatedError('Invalid Credentials');
  }
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new UnauthenticatedError('Invalid Credentials');
  }

  const token = user.createJWT();
  res.status(StatusCodes.OK).json({ user: { name: user.name }, token });
};

const verify = (req, res) => {
    console.log("Verifying user");
    res.status(StatusCodes.OK).json(true);
}

module.exports = {
  register,
  login,
  verify
};
