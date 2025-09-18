export interface ICustomError extends Error {
  statuscode: number;
  data?: any;
}

class ErrorHandler extends Error {
  statuscode: number;
  data: any;

  constructor(message: string, statuscode: number, data?: any) {
    super(message);
    this.statuscode = statuscode || 500;
    this.data = data || null;
    Error.captureStackTrace(this, this.constructor);
  }

  static createError(message: string, statuscode: number, data?: any) {
    return new ErrorHandler(message, statuscode, data);
  }
}

export default ErrorHandler;
