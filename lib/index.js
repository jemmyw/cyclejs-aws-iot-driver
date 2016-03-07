'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeIotDriver = undefined;

var _sig = require('./sig');

var _sig2 = _interopRequireDefault(_sig);

var _mqtt = require('mqtt');

var _mqtt2 = _interopRequireDefault(_mqtt);

var _ramda = require('ramda');

var _ramda2 = _interopRequireDefault(_ramda);

var _rx = require('rx');

require('../vendor/aws-sdk');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var AWS = window.AWS; /* eslint no-use-before-define: 0 */


function makeConnector(credentials, options) {
  return _rx.Observable.create(function (obs) {
    var onConnect = function onConnect(client) {
      return function () {
        return obs.onNext(client);
      };
    };

    credentials.get(function (err) {
      if (err) {
        return obs.onError(err);
      }

      var requestUrl = _sig2.default.getSignedUrl('wss', options.endpoint, '/mqtt', 'iotdevicegateway', options.region, credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken);

      var client = _mqtt2.default.connect(requestUrl);
      client.once('connect', onConnect(client));
    });
  });
}

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

  var credentials$ = _rx.Observable.of(options).map(function (opts) {
    return new AWS.CognitoIdentityCredentials({
      IdentityPoolId: opts.region + ':' + opts.identityPoolId
    });
  });
  var client$ = credentials$.map(function (credentials) {
    return makeConnector(credentials, options);
  }).mergeAll();

  var subscriptionSource$ = new _rx.ReplaySubject();
  var subscription$ = subscriptionSource$.distinct();
  var publishSource$ = new _rx.Subject();
  var publish$ = publishSource$.share();

  var messages$ = _rx.Observable.create(function (obs) {
    var messageListener = function messageListener(topic, message) {
      obs.onNext({ topic: topic, message: message.toString() });
    };

    var disposables = [];

    var clientSub = function clientSub(client) {
      disposables.push(subscription$.subscribe(function (topic) {
        return client.subscribe(topic);
      }));

      disposables.push(publish$.subscribe(function (message) {
        return client.publish(message.topic, message.message, message.options);
      }));

      disposables.push({
        dispose: function dispose() {
          client.removeAllListeners();
          client.end({ force: true });
        } });

      client.once('reconnect', function () {
        resubscribe();
      });

      client.on('message', messageListener);
    };

    function dispose() {
      disposables.forEach(function (disposable) {
        return disposable.dispose();
      });
    }

    function resubscribe() {
      dispose();
      disposables.push(client$.subscribe(clientSub));
    }

    resubscribe();

    return dispose;
  });

  function subscribeTopic(topic) {
    subscriptionSource$.onNext(topic);

    return messages$.filter(_ramda2.default.propEq('topic', topic));
  }

  return function iotDriver(events$) {
    events$.subscribe(function (event) {
      return publishSource$.onNext(event);
    });

    var out$ = messages$.map(_ramda2.default.identity).share();
    out$.topic = subscribeTopic;

    return out$;
  };
}

exports.makeIotDriver = makeIotDriver;