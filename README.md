# Pub/Sub Store `pubsub-store`

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Downloads][downloads-image]][downloads-url]

Pub/sub store and provider that use Mongoose-like schema to separate clients from data stores using a consistent protocol. At the same time maintaining the benefits of underlying pub/sub bus by allowing other listeners to subscribe to CRUD events.

Multiple stores, possibly with different underlying databases, can service requests as long as they expose the same protocol.

Providers can be used to create/update records while others providers subscribe to notifications.

Integrates nicely with [graphql-schema-builder][graphql-schema-builder].

_NB:_ Currently assuming providers and underlying DB backends use the same query language.

<!-- starttoc -->
# Table of contents
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

## Installation
---

```bash
npm install --save pubsub-store
```

## API
---

### Provider

Exposes the underlying store in a convenient format.

#### Methods

`constructor({ schema, transport, getSubjects, options: { timeout }}`

* `schema`

    A schema object. See [Schema](#schema) for details.

* `transport`

    A connected transport instance. Must have `subscribe` and `unsubscribe` methods with following signatures:

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

* `getSubjects`

    Optional function that returns protocol subjects. Default implementation in [subjects.js](src/subjects.js).

* `options`

    * `timeout`

        Query timeout in milliseconds (default: 1000).

`create`

Creates an entity based on `object` and returns projected fields of the new entity.

* `object`

    Object with the fields to set.

* `projection`

    Projection of the fields from created entity to be returned.

`delete`

Deletes entities based on `conditions` and returns projected fields of deleted entities.

* `conditions`

    Conditions to delete entities based on.

* `projection`

    Projection of the fields from deleted entities to be returned.

`deleteById`

Deletes an entity based on `id` and returns projected fields of deleted entity.

* `id`

    ID to delete an entity based on.

* `projection`

    Projection of the fields from deleted entity to be returned.

`find`

Find entities based on `conditions` and returns projected fields of found entities.

* `conditions`

    Conditions to find entities based on.

* `projection`

    Projection of the fields from found entities to be returned.

`findAll`

Find all entities and returns projected fields of found entities.

* `projection`

    Projection of the fields from found entities to be returned.

`findById`

Find entities based on `id` and returns projected fields of found entity.

* `id`

    ID to find an entity based on.

* `projection`

    Projection of the fields from found entity to be returned.

`updateById`

Updates an entity based on `id` using `object` and returns projected fields of the updated entity.

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

```js

function listener(err, query) { /* ... */ }
```

### Store

Exposes create, find, update methods over the pub/sub bus to be consumed by providers.

#### Methods

`constructor({ buildModel, schema, transport, getSubjects })`

* `buildModel`

    A function that builds a model based on a schema. A model must have `create`, `find` and `update` methods that accept protocol arguments.

    ```js
    function buildModel(schema) {
        return {
            create(object)                        { /* */ },
            find(conditions, projection, options) { /* */ },
            update(conditions, object, options)   { /* */ }
        };
    }
    ```

* `schema`

    A schema object. See [Schema](#schema) for details.

* `transport`

    A connected transport instance. Must have `subscribe` and `unsubscribe` methods with following signatures:

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

    Optional function that returns protocol subjects. Default implementation in [subjects.js](src/subjects.js).

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

Function that can be passed to both [Provider](#provider) and [Store](#store) constructors and returns protocol subjects based on schema name.

* name

    Schema name.

* prefixes

    Object with subject prefixes. Defaults to:

    ```js
    const Prefixes = {
        create: 'create',
        find:   'find',
        update: 'update'
    };
    ```

* suffix

    Subject suffix (default: `''`, empty string)

## Protocol
---

Protocol is implemented by Provider and Store and is presented here for reference.

_NB:_ Currently assuming providers and underlying DB backends use the same query language.

_NB:_ Projections cannot have both included and excluded fields.

### Create

Create request is published to `create.schema-name` subject by default. Returns newly-created entity with projection applied.

```js
{
    object:     {
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

### Find

Find request is published to `find.schema-name` subject by default. Returns a list of entities matching conditions with projection applied or an empty list.

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

### Update

Update request is published to `update.schema-name` subject by default. Returns updated entity with projection applied or an empty list.

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

`fields` can be either an object or a function accepting `{ Mixed, ObjectId }`. See Mongoose [Guide](http://mongoosejs.com/docs/guide.html) for more details about Schema definition.

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
}
```

## Examples
---

See [examples](examples) for [NATS](https://github.com/nats-io/node-nats) with [Mongo/Mongoose](https://github.com/Automattic/mongoose) store, provider and schema examples with some CRUD operations.

## TODO
---

* Abstract pub/sub bus interface into transport adapters
* Abstract DB interface and query language into DB adapters
* In-code documentation
* Implement bulk create/update
* Implement deleting as opposed to marking as deleted

## License
---

MIT

[npm-image]: https://img.shields.io/npm/v/pubsub-store.svg?style=flat-square
[npm-url]: https://npmjs.org/package/pubsub-store
[travis-image]: https://img.shields.io/travis/GeorgeSapkin/pubsub-store.svg?style=flat-square
[travis-url]: https://travis-ci.org/GeorgeSapkin/pubsub-store
[coveralls-image]: https://img.shields.io/coveralls/GeorgeSapkin/pubsub-store.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/GeorgeSapkin/pubsub-store
[downloads-image]: https://img.shields.io/npm/dm/pubsub-store.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/pubsub-store
[graphql-schema-builder]: https://github.com/GeorgeSapkin/graphql-schema-builder
