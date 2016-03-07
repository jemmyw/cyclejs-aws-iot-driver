/* eslint no-use-before-define: 0 */
import SigV4Utils from './sig'
import mqtt from 'mqtt'
import R from 'ramda'
import {Observable, Subject, ReplaySubject} from 'rx'

import '../vendor/aws-sdk'
const AWS = window.AWS

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
* returns an observable of the topoic:
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
  return Observable.create(obs => {
    const onConnect = client => () => obs.onNext(client)

    credentials.get(err => {
      if (err) {
        return obs.onError(err)
      }

      const requestUrl = SigV4Utils.getSignedUrl(
        'wss',
        options.endpoint,
        '/mqtt',
        'iotdevicegateway',
        options.region,
        credentials.accessKeyId,
        credentials.secretAccessKey,
        credentials.sessionToken)

      const client = mqtt.connect(requestUrl)
      client.once('connect', onConnect(client))
    })
  })
}

/**
 * @param {object} options
 * @param {string} object.region The AWS region
 * @param {string} object.identityPoolId The cognito identity pool id
 * @param {string} object.endpoint The AWS IoT endpoint
 * @return {function}
 */
function makeIotDriver(options) {
  if (!options.region) { throw new Error('Specify a region') }
  if (!options.identityPoolId) {
    throw new Error('Specify an identityPoolId, the cognito guid')
  }
  if (!options.endpoint) { throw new Error('Specify an IOT endpoint') }

  AWS.config.region = options.region

  const credentials$ = Observable.of(options).map(opts =>
    new AWS.CognitoIdentityCredentials({
      IdentityPoolId: `${opts.region}:${opts.identityPoolId}`,
    }))
  const client$ = credentials$
    .map(credentials =>
    makeConnector(credentials, options))
    .mergeAll()

  const subscriptionSource$ = new ReplaySubject()
  const subscription$ = subscriptionSource$.distinct()
  const publishSource$ = new Subject()
  const publish$ = publishSource$.share()

  const messages$ = Observable.create(obs => {
    const messageListener = (topic, message) => {
      obs.onNext({topic: topic, message: message.toString()})
    }

    const disposables = []

    const clientSub = client => {
      disposables.push(
        subscription$.subscribe(topic =>
          client.subscribe(topic)))

      disposables.push(
        publish$.subscribe(message =>
          client.publish(message.topic, message.message, message.options)))

      disposables.push({
        dispose: () => {
          client.removeAllListeners()
          client.end({force: true})
        }})

      client.once('reconnect', () => {
        resubscribe()
      })

      client.on('message', messageListener)
    }

    function dispose() {
      disposables.forEach(disposable => disposable.dispose())
    }

    function resubscribe() {
      dispose()
      disposables.push(client$.subscribe(clientSub))
    }

    resubscribe()

    return dispose
  })

  /**
  * Subscribe to a topic
  */
  function subscribeTopic(topic) {
    subscriptionSource$.onNext(topic)

    return messages$
      .filter(R.propEq('topic', topic))
  }

  /**
  * @param {Observable} events$ A stream of publish events, should be in the
  *   format of ```{topic: 'topic_name', message: 'message string'}```
  * @returns {Observable} Observable of messages from all subscribed topics
  */
  return function iotDriver(events$) {
    events$.subscribe(event => publishSource$.onNext(event))

    const out$ = messages$.map(R.identity).share()
    out$.topic = subscribeTopic

    return out$
  }
}

export {makeIotDriver}
