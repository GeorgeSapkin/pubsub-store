# Pub/Sub Store `pubsub-store`

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Downloads][downloads-image]][downloads-url]

Pub/sub store and provider that use Mongoose-like schema to separate clients
from data stores using a consistent protocol. At the same time maintaining the
benefits of underlying pub/sub bus by allowing other listeners to subscribe to
CRUD events.

Multiple stores, possibly with different underlying databases, can service
requests as long as they expose the same protocol.

Providers can be used to create/update entities while others providers subscribe
to notifications.

Providers support duplex streaming of entities.

Integrates nicely with [graphql-schema-builder][graphql-schema-builder]. See
[Examples](#examples) for GraphQL client example.

_NB:_ Currently assuming providers and underlying DB backends use the same query
language.

<!-- starttoc -->
# Table of contents
- [Requirements](#requirements)
- [Installation](#installation)
- [API](#api)
  - [Provider](#provider)
  - [Store](#store)
  - [getSubjects](#getsubjects)
- [Schema](#schema)
- [Protocol](#protocol)
- [Examples](#examples)
- [TODO](#todo)
- [License](#license)

<!-- endtoc -->

## Requirements

Library requires > Node 8.x with native async/await support.

## Installation

```bash
yarn add pubsub-store
```

or

```bash
npm install --save pubsub-store
```

## API

### Provider

Exposes the underlying store in a convenient format.

Implements
[Duplex](https://nodejs.org/api/stream.html#stream_class_stream_duplex) stream
to create and receive created entities. See [Streaming](#streaming) for more
details.

#### Methods

`constructor({ schema, transport, getSubjects, options: { batchSize, highWaterMark, noAckStream, timeout }}`

* `schema`

  A schema object. See [Schema](#schema) for details.

* `transport`

  A connected transport instance. Must have `request`, `subscribe` and
  `unsubscribe` methods with following signatures:

  ```js
  const transport = {
    request(subject, msg, options, cb) {
      // ...
    },

    subscribe(subject, cb) {
      // ...

      return subscriptionId;
    },

    unsubscribe(subscriptionId) {
      // ...
    }
  }
  ```

* `getSubjects`

  Optional function that returns protocol subjects. Default implementation in
  [subjects.js](src/subjects.js).

* `options` _optional_

  * `batchSize`

    Maximum result batch size. If there are more query results than `batchSize`,
    results will be loaded in batches of that size.

  * `highWaterMark`

    When set, the stream will push messages in chunks of that size.

  * `noAckStream`

    When `true`, allows piping to provider without acknowledgement, i.e. fire
    and forget.

  * `timeout`

    Query timeout in milliseconds (default: 1000).

`count(conditions)`

Returns a number of entities matching `conditions`.

* `conditions`

  Conditions to count entities based on.

`countAll()`

Returns a number of all entities in store (excluding those marked as deleted).

`create(object, projection)`

Creates an entity based on `object` and returns projected fields of the new
entity.

* `object`

  Object with the fields to set.

* `projection`

  Projection of the fields from created entity to be returned.

`delete(conditions, projection)`

Deletes entities based on `conditions` and returns projected fields of deleted
entities.

* `conditions`

  Conditions to delete entities based on.

* `projection`

  Projection of the fields from deleted entities to be returned.

`deleteById(id, projection)`

Deletes an entity based on `id` and returns projected fields of deleted entity.

* `id`

  ID to delete an entity based on.

* `projection`

  Projection of the fields from deleted entity to be returned.

`find(conditions, projection, options)`

Find entities based on `conditions` and returns projected fields of found
entities.

* `conditions`

  Conditions to find entities based on.

* `projection`

  Projection of the fields from found entities to be returned.

* `options` _optional_

  Query options (e.g. limit).

`findAll(projection, options)`

Find all entities and returns projected fields of found entities.

* `projection`

  Projection of the fields from found entities to be returned.

* `options` _optional_

  Query options (e.g. limit).

`findById(id, projections)`

Find entities based on `id` and returns projected fields of found entity.

* `id`

  ID to find an entity based on.

* `projection`

  Projection of the fields from found entity to be returned.

`updateById(id, object, projection)`

Updates an entity based on `id` using `object` and returns projected fields of
the updated entity.

* `id`

  ID to update an entity based on.

* `object`

  Object that is used to update the matching entity.

* `projection`

  Projection of the fields from updated entity to be returned.

#### Events

`create`

Emitted when an entity create event is received from the underlying message bus.

`update`

Emitted when an entity update event is received from the underlying message bus.

`create` and `update` event listeners have the following signature:

`stream-error`

Emitted from either `Readable` or `Writable` side of the `Duplex` stream instead
of an `error`. In case of `Writable` this prevents any upstreams from unpiping.

```js
function listener(err, query) { /* ... */ }
```

#### Streaming

Since `Provider` implements
[Duplex](https://nodejs.org/api/stream.html#stream_class_stream_duplex) stream
class, entities can be piped to and from a provider instance.

```js
const provider = new SomeProvider({ /* */ });

// Entities received from the message bus will be piped to someWritableStream
provider.pipe(someWritableStream);

// Entities from someReadableStream will be piped to the message bus
someReadableStream.pipe(provider);
```

See [client-nats-streaming](examples/client-nats-streaming) example for more
details.

### Store

Exposes count, create, find and update methods over the pub/sub bus to be
consumed by providers.

#### Methods

`constructor({ buildModel, schema, transport, getSubjects })`

* `buildModel`

  A function that builds a model based on a schema. A model must have `count`,
  `create`, `find` and `update` methods that accept protocol arguments.

  `create` must handle `object` being both a single object or an array.

  See [server-nats-mongo](examples/server-nats-mongo) example for more details.

  ```js
  function buildModel(schema) {
    return {
      count(conditions)                     { /* */ },
      create(object, projection)            { /* */ },
      find(conditions, projection, options) { /* */ },
      update(conditions, object, options)   { /* */ }
    };
  }
  ```

* `schema`

  A schema object. See [Schema](#schema) for details.

* `transport`

  A connected transport instance. Must have `subscribe` and `unsubscribe`
  methods with following signatures:

  ```js
  const transport = {
    subscribe(subject, cb) {
      // ...

      return subscriptionId;
    },

    unsubscribe(subscriptionId) {
      // ...
    }
  }
  ```

* `getSubjects`

  Optional function that returns protocol subjects. Default implementation in
  [subjects.js](src/subjects.js).

`open()`

Subscribes to all subjects, effectively starting the store.

`close()`

Unsubscribes from all subjects, effectively stopping the store.

#### Events

Events are emitted on corresponding request errors.

* `create-error`

* `find-error`

* `update-error`

### `getSubjects`

`getSubjects(name, { prefixes, suffix })`

Function that can be passed to both [Provider](#provider) and [Store](#store)
constructors and returns protocol subjects based on schema name.

* `name`

  Schema name.

* `prefixes`

  Object with subject prefixes. Defaults to:

  ```js
  const Prefixes = {
    count:  'count',
    create: 'create',
    find:   'find',
    update: 'update'
  };
  ```

* `suffix` _optional_

  Subject suffix (default: `''`, empty string)

## Protocol

Protocol is implemented by Provider and Store and is presented here for
reference.

_NB:_ Currently assuming providers and underlying DB backends use the same query
language.

_NB:_ Projections cannot have both included and excluded fields.

### Result

```js
{
  result: resultObject // or an array, or a value
}
```

### Error

```js
{
  error: {
    message: "Error details"
  }
}
```

### Count Method

Count request is published to `count.schema-name` subject by default. Returns
the number of entities matching conditions.

```js
{
  conditions: {
    field1: 'value 2',
    // etc.
  }
}
```

### Create Method

Create request is published to `create.schema-name` subject by default. Returns
a newly-created entity or a list of entities with projection applied.

```js
{
  object: {
    field1: 'value 1',
    field2: 2
    // etc.
  },
  projection: {
    field1: 1
    field2: 1
    // etc.
  }
}
```

### Find Method

Find request is published to `find.schema-name` subject by default. Returns a
list of entities matching conditions with projection applied or an empty list.

```js
{
  conditions: {
    field1: 'value 2',
    // etc.
  },
  projection: {
    field1: 1
    field2: 1
    // etc.
  },
  options: {
    limit: 1
    // etc.
  }
}
```

### Update Method

Update request is published to `update.schema-name` subject by default. Returns
an updated entity with projection applied or an empty list.

```js
{
  conditions: {
    field1: 'value 2',
    // etc.
  },
  object: {
    $set: {
        field2: 3
    }
    // etc.
  },
  projection: {
    field1: 1
    field2: 1
    // etc.
  },
  options: {
    multi: true
    // etc.
  }
}
```

## Schema

`fields` can be either an object or a function accepting `{ Mixed, ObjectId }`.
See Mongoose [Guide](http://mongoosejs.com/docs/guide.html) for more details
about Schema definition.

Schema format is shared with [graphql-schema-builder][graphql-schema-builder].

```js
const schemas = {
  Asset: {
    name:        'Asset',
    description: 'An asset.',

    fields: ({ Mixed, ObjectId }) => ({
      customer: {
        description: 'Customer that this asset belongs to.',

        type:     ObjectId,
        ref:      'Customer',
        required: true
      },

      parent: {
        type:     ObjectId,
        ref:      'Asset',
        required: false
      },

      name: {
        type:     String,
        required: true
      }
    }),

    dynamicFields: ({ ObjectId }) => ({
      sensors: {
        type: [ObjectId],
        ref:  'Sensor'
      }
    })
  },

  Customer: {
    name:        'Customer',
    description: 'A customer.',

    fields: {
      name: {
        description: 'The name of the customer.',

        type:     String,
        required: true
      },

      // Will result in subtype
      metadata: {
        created: {
          type:     Date,
          required: true
        }
      }
    },

    dynamicFields: ({ Mixed, ObjectId }) => ({
      assets: {
        type: [ObjectId],
        ref:  'Asset'
      }
    })
  },

  Sensor: {
    name:        'Sensor',
    description: 'A sensor that must be connected to an asset.',

    fields: ({ Mixed, ObjectId }) => ({
      externalId: {
        type:     String,
        required: false
      },

      asset: {
        description: 'An asset that this sensor is connected to.',

        type:     ObjectId,
        ref:      'Asset',
        required: true
      },

      name: {
        type:     String,
        required: false
      }
    })
  }
};
```

## Examples

See [examples](examples) for [NATS](https://github.com/nats-io/node-nats),
[Mongo/Mongoose](https://github.com/Automattic/mongoose),
[GraphQL](https://github.com/facebook/graphql) and streaming examples.

## TODO

* Abstract pub/sub bus interface into transport adapters
* In-code documentation
* Implement bulk update
* Implement deleting as opposed to marking as deleted
* Implement aggregate

## License

MIT

[npm-image]: https://img.shields.io/npm/v/pubsub-store.svg?style=flat-square
[npm-url]: https://npmjs.org/package/pubsub-store
[travis-image]: https://img.shields.io/travis/com/GeorgeSapkin/pubsub-store.svg?style=flat-square
[travis-url]: https://travis-ci.com/GeorgeSapkin/pubsub-store
[coveralls-image]: https://img.shields.io/coveralls/GeorgeSapkin/pubsub-store.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/GeorgeSapkin/pubsub-store
[downloads-image]: https://img.shields.io/npm/dm/pubsub-store.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/pubsub-store
[graphql-schema-builder]: https://github.com/GeorgeSapkin/graphql-schema-builder
