'use strict';

var express = require('express');
var auth = require('http-auth');
var exec = require('./shell').execute;
var request = require('request');

const SLACK_HOOK_URL = process.env.SLACK_HOOK_URL;
const APP_DIR = process.env.APP_DIR || '../app';
const IONIC_PROFILE = process.env.IONIC_PROFILE;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || "#general";
const BOT_NAME = process.env.BOT_NAME || "Джамшут";
const APP_NAME = process.env.APP_NAME || "App";
const DOWNLOAD_HOST = process.env.DOWNLOAD_HOST || "http://localhost:3000/";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin"; //boo


var BUILDS_DIR = __dirname + "/../builds";
var basic = auth.basic({
        realm: "Protected"
    }, function (username, password, callback) {
        callback(username === "admin" && password === ADMIN_PASSWORD);
    }
);

// Application setup.
var app = express();
app.use(auth.connect(basic));
app.use('/builds', express.static(BUILDS_DIR));

let postToSlack = function(msg) {
  var data = {
    "channel": SLACK_CHANNEL,
    "username": BOT_NAME,
    "text": msg,
    "icon_url": "https://cdn2.iconfinder.com/data/icons/flat-style-svg-icons-part-1/512/worker_hat_workers_hard_construction-512.png"
  };
  request.post({ url: SLACK_HOOK_URL, form: { payload: JSON.stringify(data)} }, (res) => {
    console.log(res);
  }, (err) => console.log(err));
}

let tryDownload = function (buildId) {
  return new Promise(function(resolve, reject) {
    let inner = function(attempt) {
      exec(`cd ${APP_DIR} && ionic package download ${buildId}`).then(() => {
        resolve();
      }).catch((err) => {
        if (attempt < 4) {
          setTimeout(function() { inner(++attempt); }, 30000);
        } else {
          postToSlack('Хозяин, я попробовал несколько раз, но сборка не удалась.')
          reject();
        }
      });
    };
    inner(0);
  });
};

app.get('/', function (req, res) {
  let type = req.query.type;
  if (!type || (type !== 'ios' && type !== 'android')) {
    res.status(400).send('Missing or invalid build type');
    return;
  }

  exec(`cd ${APP_DIR} && git pull && ionic package build ${type} -p ${IONIC_PROFILE}`).then((outp) => {
    let buildId = outp.match(/Build ID: (\d+)/)[1];

    setTimeout(function() {
      tryDownload(buildId).then((outp) => {
        console.log('Copying');
        var type = 'ios';
          var appExt = type === 'ios' ? 'ipa' : 'apk';
          var appVersion = JSON.parse(require('fs').readFileSync(`${APP_DIR}/package.json`, 'utf8')).version;
          var sourceFileName = `${APP_NAME}.${appExt}`;
          var versionedFileName = `${APP_NAME}-${appVersion}-build${buildId}.${appExt}`;
          exec(`mv ${APP_DIR}/${sourceFileName} ${BUILDS_DIR}/${versionedFileName}`).then(() => {
            var link = `${DOWNLOAD_HOST}builds/${versionedFileName}`;
            postToSlack(`Свежая сборка для ${type === 'ios' ? 'айфона' : 'андроида' } готова, хозяин: <${link}|${versionedFileName}>`);
          }).catch((err) => {
            postToSlack('Хозяин, я накриворучил. Сборка удалась, но я не смог предоставить вам файл.');
          });
        }).catch(err => console.error('ERRR: ' + err));

    }, 50000);
  });

  res.status(200).end();
});

var port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});
