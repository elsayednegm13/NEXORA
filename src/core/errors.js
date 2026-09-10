'use strict';

export class ApiError extends Error {
  constructor(code, message, status = 400, details = []) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
