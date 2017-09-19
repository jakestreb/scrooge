'use strict';

const Promise = require('bluebird');
const chrono = require('chrono-node');
const rp = require('request-promise');
const UserError = require('./UserError.js');

const alphaVantageKey = 'U6GOYHSHYPDGTMO7';

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
    .then(priceMsg => {
      this.replyFunc(priceMsg);
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
    // chrono prefers '-' to '/' for dates, and needs the current year
    date = date ? date.replace(/\//g, '-') : '';
    date += date.match(/\d{1,2}\-\d{1,2}/g) ? `-${new Date().getYear()}` : '';
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
      symbol: symbol.toUpperCase(),
      date: parsedDate || chrono.parseDate('Today'),
      time: parsedTime || 'close',
      quantity: parsedQuantity || 1,
      explicitDate: Boolean(parsedDate) // Indicates whether a date was given explicitly
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
    return rp({
      url: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${request.symbol}` +
        `&outputsize=compact&apikey=${alphaVantageKey}`,
      method: 'GET'
    })
    .catch(err => {
      console.error(err);
      throw new UserError(`Problem with stock price api`);
    })
    .then(result => {
      result = JSON.parse(result);
      let pricesByDate = result["Time Series (Daily)"];
      if (pricesByDate) {
        let date = request.date;
        let quantity = request.quantity;
        let time = request.time;
        let timeStr = time === 'open' ? '1. open' : '4. close';
        for (let i = 0; i < 5; i++) {
          let iso = this._getISODate(date);
          let prices = pricesByDate[iso];
          if (prices && prices[timeStr]) {
            let price = parseFloat(prices[timeStr]);
            return `${price * quantity} on ${time} ${this._getUSADate(date)}` +
              (quantity > 1 ? ` (${price} per share)` : ``);
          } else if (request.explicitDate) {
            throw new UserError(`No data for ${request.symbol} on ${this._getUSADate(date)}`);
          } else {
            date = this._getPreviousDate(date);
          }
        }
      }
      throw new UserError(`Request for stock data failed`);
    });
  }

  _getISODate(date) {
    return date.toISOString().split('T')[0];
  }

  _getUSADate(date) {
    let [year, month, day] = this._getISODate(date).split('-');
    return `${month}-${day}-${year}`;
  }

  _getPreviousDate(date) {
    date.setDate(date.getDate() - 1);
    return date;
  }
}

module.exports = Scrooge;
