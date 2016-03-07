/* eslint no-use-before-define: 0 */
import SigV4Utils from './sig'
import mqtt from 'mqtt'
import R from 'ramda'
import {Observable, Subject, ReplaySubject} from 'rx'

import '../vendor/aws-sdk'
const AWS = window.AWS

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

  function subscribeTopic(topic) {
    subscriptionSource$.onNext(topic)

    return messages$
      .filter(R.propEq('topic', topic))
  }

  return function iotDriver(events$) {
    events$.subscribe(event => publishSource$.onNext(event))

    const out$ = messages$.map(R.identity).share()
    out$.topic = subscribeTopic

    return out$
  }
}

export {makeIotDriver}
