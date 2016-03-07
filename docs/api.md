
# `cyclejs-aws-iot-driver` object API

- [`makeConnector`](#makeConnector)
- [`makeIotDriver`](#makeIotDriver)
- [`subscribeTopic`](#subscribeTopic)
- [`iotDriver`](#iotDriver)

eslint no-use-before-define: 0

- - -

### <a id="makeConnector"></a> `makeConnector()`

## CycleJS driver for AWS IoT MQTT

This is a driver for cyclejs that connects to AWS IoT MQTT and allows
subscribing and publishing to topics.

At present this only supports an anonymous AWS cognito connection.

Instructions to get started:

1. Get the endpoint address from IOT:
  aws iot describe-endpoint

2. Create an identity pool:
  aws cognito-identity --allow-unauthenticated-identities \
  --developer-provider-name login.mycompany.myapp

3. Plug the endpoint and identity pool guid into the driver:

```
const drivers = {
  Iot: makeIotDriver({
    region: 'us-east-1',
    endpoint: 'abc.iot.us-east-1.amazonaws.com',
    identityPoolId: 'abc-123-efef-456'
  })
}
```

### Usage:

#### Publishing

The input observable takes publish messages in the form ```{ topic:
'the/topic', message: 'the message' }```. The message must be a string.

#### Subscribing

The output observable exposes a topic function that subscribes to a topic and
returns an observable of the topoic:

```
sources.Iot.topic('the/topic')
  .subscribe(m =>
    console.log('got message"', m.message, '"on topic', m.topic))

return {
  Iot: Observable.of({topic: 'the/topic', message: 'a message to publish'})
}
```

In the above case the expected output would be ```got message "a message to
publish" on topic the/topic```

Note that messages from all subscribed topics are available on the ouput
observable:

```
sources.Iot.topic('topic1').subscribe()
sources.Iot.topic('topic2').subscribe()

// Log messages from topic1 and topic2 to the console
sources.Iot.subscribe(m => console.log(m.message))
```

- - -

### <a id="makeIotDriver"></a> `makeIotDriver(options, object.region, object.identityPoolId, object.endpoint)`

#### Arguments:

- `options :: object`
- `object.region :: string` The AWS region
- `object.identityPoolId :: string` The cognito identity pool id
- `object.endpoint :: string` The AWS IoT endpoint

#### Return:

*(function)* 

- - -

### <a id="subscribeTopic"></a> `subscribeTopic()`

Subscribe to a topic

- - -

### <a id="iotDriver"></a> `iotDriver(events$)`

#### Arguments:

- `events$ :: Observable` A stream of publish events, should be in the   format of ```{topic: 'topic_name', message: 'message string'}```

#### Return:

*(Observable)* Observable of messages from all subscribed topics

- - -

