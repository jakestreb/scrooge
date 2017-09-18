'use strict';

const Promise = require('bluebird');
const chrono = require('chrono-node');
const yahooFinance = require('yahoo-finance');
const UserError = require('./UserError.js');

class Scrooge {
  constructor(id, replyFunc) {
    this.id = id;
    this.replyFunc = replyFunc;
  }

  receiveMessage(message) {
    if (!message) {
      this.replyFunc(this.getHelp());
      return;
    }
    return Promise.try(() => {
      let request = this.parseMessage(message);
      return this.getPrice(request);
    })
    .then(price => {
      this.replyFunc(`${price}`);
    })
    .catch(UserError, err => {
      this.replyFunc(err.message);
    })
    .catch(err => {
      console.error(err);
      this.replyFunc('Something went wrong');
    });
  }

  parseMessage(message) {
    let [symbol, date, time, quantity] = message.toLowerCase().split(' ');
    time = time || '';
    // chrono prefers '-' to '/' for dates
    date = date ? date.replace(/\//g, '-') : null;
    let parsedDate = chrono.parseDate(date);
    let parsedTime = time.match(/^c/gi) ? 'close' : (time.match(/^o/gi) ? 'open' : null);
    let parsedQuantity = parseInt(quantity, 10);
    if (!symbol || symbol.length > 5 || symbol === 'help') {
      throw new UserError(this.getHelp());
    } else if (date && !parsedDate || parsedDate > Date.now()) {
      throw new UserError(`Bad date\n${this.getHelp()}`);
    } else if (time && !parsedTime) {
      throw new UserError(`Bad time\n${this.getHelp()}`);
    } else if (quantity && isNaN(parsedQuantity)) {
      throw new UserError(`Bad quantity\n${this.getHelp()}`);
    }
    return {
      symbol: symbol,
      date: parsedDate || chrono.parseDate('Yesterday'),
      time: parsedTime || 'close',
      quantity: parsedQuantity || 1
    };
  }

  getHelp() {
    return `Ask me about a stock price, e.g.\n` +
      ` aapl\n` +
      ` axp yesterday open\n` +
      ` wmt 10-3 close 12\n` +
      `Defaults to yesterday's close price for 1 share`;
  }

  getPrice(request) {
    let nextDay = new Date(request.date.getTime());
    nextDay.setDate(nextDay.getDate() + 1);
    return yahooFinance.historical({
      symbol: request.symbol,
      from: request.date,
      to: nextDay
    })
    .then(quotes => {
      let quote = quotes[0];
      return quote[request.time] * request.quantity;
    })
    .catch(err => {
      console.error(err);
      throw new UserError(`No stock data found`);
    });
  }
}

module.exports = Scrooge;
