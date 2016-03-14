'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeIotDriver = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; /* eslint no-use-before-define: 0 */


var _sig = require('./sig');

var _sig2 = _interopRequireDefault(_sig);

var _mqtt = require('mqtt');

var _mqtt2 = _interopRequireDefault(_mqtt);

var _ramda = require('ramda');

var _ramda2 = _interopRequireDefault(_ramda);

var _rx = require('rx');

require('../vendor/aws-sdk');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var AWS = window.AWS;

/**
* ## CycleJS driver for AWS IoT MQTT
*
* This is a driver for cyclejs that connects to AWS IoT MQTT and allows
* subscribing and publishing to topics.
*
* At present this only supports an anonymous AWS cognito connection.
*
* Instructions to get started:
*
* 1. Get the endpoint address from IOT:
*   aws iot describe-endpoint
*
* 2. Create an identity pool:
*   aws cognito-identity --allow-unauthenticated-identities \
*   --developer-provider-name login.mycompany.myapp
*
* 3. Plug the endpoint and identity pool guid into the driver:
*
* ```
* const drivers = {
*   Iot: makeIotDriver({
*     region: 'us-east-1',
*     endpoint: 'abc.iot.us-east-1.amazonaws.com',
*     identityPoolId: 'abc-123-efef-456'
*   })
* }
* ```
*
* ### Usage:
*
* #### Publishing
*
* The input observable takes publish messages in the form ```{ topic:
* 'the/topic', message: 'the message' }```. The message must be a string.
*
* #### Subscribing
*
* The output observable exposes a topic function that subscribes to a topic and
* returns an observable of the topic:
*
* ```
* sources.Iot.topic('the/topic')
*   .subscribe(m =>
*     console.log('got message"', m.message, '"on topic', m.topic))
*
* return {
*   Iot: Observable.of({topic: 'the/topic', message: 'a message to publish'})
* }
* ```
*
* In the above case the expected output would be ```got message "a message to
* publish" on topic the/topic```
*
* Note that messages from all subscribed topics are available on the ouput
* observable:
*
* ```
* sources.Iot.topic('topic1').subscribe()
* sources.Iot.topic('topic2').subscribe()
*
* // Log messages from topic1 and topic2 to the console
* sources.Iot.subscribe(m => console.log(m.message))
* ```
*/

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

      var client = _mqtt2.default.connect(requestUrl, {
        keepalive: 30,
        reconnectPeriod: 0 });
      // don't reconnect here, allow whole new connection
      // so that request url is regenerated
      client.once('connect', onConnect(client));
    });
  });
}

/**
 * @param {object} options - region, IdentityPoolId and endpoint are required,
 *   any other properties are passed to the AWS.CognitoIdentityCredentials
 *   object.
 * @param {string} object.region The AWS region
 * @param {string} object.IdentityPoolId The cognito identity pool id
 * @param {string} object.endpoint The AWS IoT endpoint
 * @return {function}
 */
function makeIotDriver(options) {
  if (!options.region) {
    throw new Error('Specify a region');
  }
  if (!options.IdentityPoolId) {
    throw new Error('Specify an IdentityPoolId, the cognito guid');
  }
  if (!options.endpoint) {
    throw new Error('Specify an IOT endpoint');
  }

  AWS.config.region = options.region;

  var credentials$ = _rx.Observable.of(options).map(_ramda2.default.apply(_ramda2.default.compose, _ramda2.default.map(_ramda2.default.dissoc, ['region', 'IdentityPoolId', 'endpoint']))).map(function (opts) {
    return new AWS.CognitoIdentityCredentials(_extends({}, opts, {
      IdentityPoolId: options.region + ':' + options.IdentityPoolId
    }));
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

      client.once('close', function () {
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

  /**
  * Subscribe to a topic
  */
  function subscribeTopic(topic) {
    subscriptionSource$.onNext(topic);

    return messages$.filter(_ramda2.default.propEq('topic', topic));
  }

  /**
  * @param {Observable} events$ A stream of publish events, should be in the
  *   format of ```{topic: 'topic_name', message: 'message string'}```
  * @returns {Observable} Observable of messages from all subscribed topics
  */
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