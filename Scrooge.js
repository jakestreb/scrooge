'use strict';

const Promise = require('bluebird');
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
    // Get helpful dates
    let now = new Date();
    let tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    tomorrow.setDate(tomorrow.getDate() + 1);
    let strs = {};
    let parts = message.toLowerCase().split(' ');
    // Get the symbol
    let symbol = parts[0];
    if (!symbol || symbol.length > 5 || symbol === 'help') {
      throw new UserError(this.getHelp());
    }
    // Get everything else
    parts.slice(1).forEach(str => {
      let type = this._identifyItem(str);
      if (type) { strs[type] = str; }
    });
    let parsedDate = this._parseDate(strs.date || '');
    let parsedTime = this._getOpenOrClose(strs.time || '');
    let parsedQuantity = parseInt(strs.quantity || '', 10);
    if (strs.date && !parsedDate) {
      throw new UserError(`I need a US date or a day of the week\n\n${this.getHelp()}`);
    } else if (parsedDate >= tomorrow) {
      throw new UserError(`Date should be today or in the past\n\n${this.getHelp()}`);
    } else if (strs.time && !parsedTime) {
      throw new UserError(`Time should be open or close\n\n${this.getHelp()}`);
    }
    // Change now into yesterday for the default date
    now.setDate(now.getDate() - 1);
    return {
      symbol: symbol.toUpperCase(),
      date: parsedDate || now,
      time: parsedTime || 'close',
      quantity: parsedQuantity || 1,
      explicitDate: Boolean(parsedDate) // Indicates whether a date was given explicitly
    };
  }

  getHelp() {
    return `Ask me about a stock price (for quantity, on date, at open/close), e.g.\n` +
      `aapl\n` +
      `wmt 12 open\n` +
      `axp close yesterday\n` +
      `qqq 8-12 89`;
  }

  getPrice(request) {
    return rp({
      url: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${request.symbol}` +
        `&outputsize=full&apikey=${alphaVantageKey}`,
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
        // Try the last 5 days (if the date was not explicitly given)
        for (let i = 0; i < 5; i++) {
          let iso = this._getISODate(date);
          let prices = pricesByDate[iso];
          if (prices && prices[timeStr]) {
            let price = parseFloat(prices[timeStr]);
            return `${(price * quantity).toFixed(2)} on ${time} ${date.toLocaleDateString()}` +
              (quantity > 1 ? ` (${price.toFixed(2)} per share)` : ``);
          } else if (request.explicitDate) {
            throw new UserError(`No data for ${request.symbol} on ${date.toLocaleDateString()}`);
          } else {
            date = this._getPreviousDate(date);
          }
        }
      }
      throw new UserError(this.getHelp());
    });
  }

  // Returns 'quantity', 'time', 'date', or null.
  _identifyItem(item) {
    if (!item) {
      return null;
    } else if (item.match(/^\d+$/g)) {
      return 'quantity';
    } else if (item.match(/^[co]/gi)) {
      return 'time';
    } else {
      return 'date';
    }
  }

  _parseDate(dateStr) {
    dateStr = dateStr.toLowerCase();
    let now = new Date();
    let weekday = [/^sun/g, /^mon/g, /^tue/g, /^wed/g, /^thu/g, /^fri/g];
    if (dateStr.match(/^\D+$/g)) {
      // Used a word for the date
      let desiredDay = weekday.findIndex(regex => dateStr.match(regex));
      let offset = desiredDay > 0 ? (now.getDay() - desiredDay + 7) % 7 :
        (dateStr === 'today' ? 0 : (dateStr === 'yesterday' ? 1 : -1));
      if (offset >= 0) {
        now.setDate(now.getDate() - offset);
        return now;
      }
    } else {
      // Used the USA date format
      let result = /^(\d{1,2})[\-\/](\d{1,2})(?:[\-\/](\d{2,4}))?$/g.exec(dateStr);
      if (result) {
        let currentYear = now.getFullYear();
        let year = result[3] ? parseInt(result[3], 10) : currentYear;
        if (year < 100) {
          // Convert to 4 digit year
          let first = currentYear - 50;
          year = first + this.mod(year - first, 100);
        }
        return new Date(year, parseInt(result[1], 10) - 1, parseInt(result[2], 10));
      }
    }
    return null;
  }

  _getISODate(date) {
    let [month, day, year] = date.toLocaleDateString().split('/');
    return `${year}-${this._padZeros(month, 2)}-${this._padZeros(day, 2)}`;
  }

  _padZeros(str, totalLen) {
    return '0'.repeat(totalLen - str.length) + str;
  }

  _getPreviousDate(date) {
    date.setDate(date.getDate() - 1);
    return date;
  }

  _getOpenOrClose(time) {
    return time.match(/^c/gi) ? 'close' : (time.match(/^o/gi) ? 'open' : null);
  }

  _mod(n, amt) {
    return ((n % amt) + amt) % amt;
  }
}

module.exports = Scrooge;
