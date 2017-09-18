'use strict';

const Scrooge = require('./Scrooge.js');
const bodyParser = require("body-parser");
const rp = require("request-promise");
const utf8 = require("utf8");
const express = require("express");
const app = express();

const telegramToken = '343067946:AAFRZEJrGa4LSwm3pGYrZchgh4UhQAXHnY4';
const port = process.env.PORT;
const replyFuncs = {
  'telegram': (message, id) => respondToTelegram(message, id),
  'cli': message => { console.log(message); }
};
const scrooges = [];

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send('Running app');
});

// Message from telegram
app.post("/telegram", (req, res) => {
  let data = req.body;
  let id = data.message.chat.id;
  let message = data.message.text;
  forwardToScrooge('telegram', id, message);
  res.send('ok');
});

function respondToTelegram(message, id) {
  message = utf8.encode(message);
  if (id && message) {
    rp({
      url: `https://api.telegram.org/bot${telegramToken}/sendMessage?chat_id=${id}&text=${message}`,
      method: 'POST'
    });
  } else {
    console.error('Attempted to send', message, id);
  }
}

function forwardToScrooge(source, id, message) {
  if (!scrooges[id]) {
    // New scrooge client
    scrooges[id] = new Scrooge(id, replyFuncs[source]);
    // TODO: Save scrooge clients.
    // if (source !== 'cli') {
    //   saveScrooge(source, id);
    // }
  }
  scrooges[id].receiveMessage(message);
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// Initialize command line scrooge.
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => { forwardToScrooge('cli', 'cli', text.trim()); });
