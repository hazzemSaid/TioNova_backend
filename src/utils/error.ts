export interface ICustomError extends Error {
  statuscode: number;
  data?: any;
}

/**
 * Custom Error Handler class that creates errors following the standardized format:
 * { success: false, error: string, statusCode: number }
 * 
 * When thrown, the error middleware will format it properly.
 */
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
