'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeIotDriver = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _sig = require('./sig');

var _sig2 = _interopRequireDefault(_sig);

var _mqtt = require('mqtt');

var _mqtt2 = _interopRequireDefault(_mqtt);

var _ramda = require('ramda');

var _ramda2 = _interopRequireDefault(_ramda);

var _rx = require('rx');

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _cryptoJs = require('crypto-js');

var _cryptoJs2 = _interopRequireDefault(_cryptoJs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

if (!window.AWS) {
  window.moment = _moment2.default;
  window.CryptoJS = _cryptoJs2.default;
  require('../vendor/aws-sdk');
}
var AWS = window.AWS;

function makeIotDriver(options) {
  if (!options.region) {
    throw new Error('Specify a region');
  }
  if (!options.identityPoolId) {
    throw new Error('Specify an identityPoolId, the cognito guid');
  }
  if (!options.endpoint) {
    throw new Error('Specify an IOT endpoint');
  }

  AWS.config.region = options.region;
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: options.region + ':' + options.IdentityPoolId
  });
  var credentials = AWS.config.credentials;

  var url$ = _rx.Observable.fromFunc(credentials.get, credentials, function (err) {
    if (err) {
      return new Error(err);
    }

    var requestUrl = _sig2.default.getSignedUrl('wss', options.endpoint, '/mqtt', 'iotdevicegateway', options.region, credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken);

    return requestUrl;
  }).share();

  var client$ = url$.map(function (url) {
    return _mqtt2.default.connect(url);
  }).shareReplay(1);
  var messages$ = _rx.Observable.create(function (obs) {
    var client = void 0;

    var listener = function listener(topic, message) {
      obs.onNext({ topic: topic, message: message });
    };

    var dispose = function dispose() {
      return client && client.removeListener('message', listener);
    };

    client$.subscribe(function (newClient) {
      dispose();
      client = newClient;
      client.on('message', listener);
    });

    return dispose;
  }).share();

  function subscribe(topic) {
    client$.subscribe(function (client) {
      return client.subscribe(topic);
    });

    return messages$.filter(_ramda2.default.propEq('topic', topic));
  }

  function publish(client, message) {
    client.publish(message.topic, message.message, message.options);
  }

  return function iotDriver(publish$) {
    publish$.withLatestFrom(client$).subscribe(function (_ref) {
      var _ref2 = _slicedToArray(_ref, 2);

      var event = _ref2[0];
      var client = _ref2[1];
      return publish(client, event);
    });

    var out$ = messages$.map(_ramda2.default.identity);
    out$.subscribe = subscribe;

    return out$;
  };
}

exports.makeIotDriver = makeIotDriver;