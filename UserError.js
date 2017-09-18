'use strict';

function UserError(message) {
  this.message = message;
  this.name = "UserError";
}
UserError.prototype = Object.create(Error.prototype);
UserError.prototype.constructor = UserError;

module.exports = UserError;
