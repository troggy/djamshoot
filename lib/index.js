'use strict';

var express = require('express');
var auth = require('http-auth');
var exec = require('./shell').execute;
var request = require('request');


const SLACK_HOOK_URL = '<SLACK_HOOK_URL>';
const APP_DIR = '../pushr-app';
const IONIC_PROFILE = 'version3';
const APP_NAME = "Pushr";
const DOWNLOAD_HOST = "http://localhost:3000/";

var basic = auth.basic({
        realm: "Protected"
    }, function (username, password, callback) {
        callback(username === "admin" && password === "admin");
    }
);

// Application setup.
var app = express();
app.use(auth.connect(basic));
app.use('/builds', express.static('builds'));

let postToSlack = function(msg) {
  var data = {
    "channel": "#general",
    "username": "Раб-сборщик приложений",
    "text": msg,
    "icon_url": "https://cdn2.iconfinder.com/data/icons/flat-style-svg-icons-part-1/512/worker_hat_workers_hard_construction-512.png"
  };
  request.post({ url: 'https://hooks.slack.com/services/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', form: { payload: JSON.stringify(data)} }, (res) => {
    console.log(res);
  }, (err) => console.log(err));
}

let tryDownload = function (buildId) {
  return new Promise(function(resolve, reject) {
    let inner = function(attempt) {
      exec(`cd ${APP_DIR} && ionic package download ${buildId}`).then(() => {
        console.log('okay. downloaded');
        resolve();
      }).catch((err) => {
        if (attempt < 4) {
          setTimeout(function() { inner(++attempt); }, 30000);
        } else {
          postToSlack('Я безрукий. Я попробовал несколько раз, но сборка не удалась.')
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
          exec(`mv ${APP_DIR}/${sourceFileName} builds/${versionedFileName}`).then(() => {
            var link = `${DOWNLOAD_HOST}builds/${versionedFileName}`;
            postToSlack(`Свежая сборка для ${type === 'ios' ? 'айфона' : 'андроида' } готова, хозяин. Вот ссылка: <${link}|${versionedFileName}>`);
          }).catch((err) => {
            postToSlack('Я криворук. Сборка удалась, но я не смог предоставить вам файл');
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
