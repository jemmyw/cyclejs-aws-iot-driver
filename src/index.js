import SigV4Utils from './sig'
import mqtt from 'mqtt'
import R from 'ramda'
import {Observable} from 'rx'

import '../vendor/aws-sdk'
const AWS = window.AWS

function makeIotDriver(options) {
  if (!options.region) { throw new Error('Specify a region') }
  if (!options.identityPoolId) {
    throw new Error('Specify an identityPoolId, the cognito guid')
  }
  if (!options.endpoint) { throw new Error('Specify an IOT endpoint') }

  AWS.config.region = options.region
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: `${options.region}:${options.IdentityPoolId}`,
  })
  const credentials = AWS.config.credentials

  const url$ = Observable.fromFunc(credentials.get, credentials, err => {
    if (err) { return new Error(err) }

    const requestUrl = SigV4Utils.getSignedUrl('wss', options.endpoint, '/mqtt',
      'iotdevicegateway', options.region,
      credentials.accessKeyId, credentials.secretAccessKey,
      credentials.sessionToken)

    return requestUrl
  }).share()

  const client$ = url$.map(url => mqtt.connect(url)).shareReplay(1)
  const messages$ = Observable.create(obs => {
    let client

    const listener = (topic, message) => {
      obs.onNext({topic: topic, message: message})
    }

    const dispose = () => client && client.removeListener('message', listener)

    client$.subscribe(newClient => {
      dispose()
      client = newClient
      client.on('message', listener)
    })

    return dispose
  }).share()

  function subscribe(topic) {
    client$.subscribe(client => client.subscribe(topic))

    return messages$
      .filter(R.propEq('topic', topic))
  }

  function publish(client, message) {
    client.publish(message.topic, message.message, message.options)
  }

  return function iotDriver(publish$) {
    publish$.withLatestFrom(client$).subscribe(([event, client]) =>
      publish(client, event))

    const out$ = messages$.map(R.identity)
    out$.subscribe = subscribe

    return out$
  }
}

export {makeIotDriver}
