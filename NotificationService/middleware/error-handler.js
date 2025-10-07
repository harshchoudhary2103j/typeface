const { CustomAPIError } = require('../errors')
const { StatusCodes } = require('http-status-codes')
const errorHandlerMiddleware = (err, req, res, next) => {

  let customError = {
    // set deafult
    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg: err.message || 'Something went wrong. Please try again.'
  }
  
  // if (err instanceof CustomAPIError) {
  //   console.log('in');
  //   return res.status(err.statusCode).json({ msg: err.message })
  // }

  if(err.name === 'ValidationError') {
    customError.msg = Object.values(err.errors).map((item) => item.message).join(',')
  }

  if(err.code && err.code === 11000) {
    customError.msg = `Duplicate value entered for ${Object.keys(err.keyValue)} field, please choose another value`;
    customError.statusCode = 400;
  }

  if(err.name === 'CastError') {
    customError.msg = `No item found with id ${err.value}`;
    customError.statusCode = 404;
  }
 
  // return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ err }) //  instead of hardcoding the value it will depend on the error occured
  return res.status(customError.statusCode).json({ msg: customError.msg })
}

module.exports = errorHandlerMiddleware