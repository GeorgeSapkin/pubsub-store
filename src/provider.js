'use strict';

const {
    ok: assert
} = require('assert');

const {
    EventEmitter
} = require('events');

const {
    __,
    always,
    bind,
    complement,
    curry,
    gt,
    identity,
    ifElse,
    is,
    isNil,
    merge,
    partial,
    pipe,
    prop,
    tap,
    tryCatch,
    when
} = require('ramda');

const {
    assertSchema
} = require('./assert');

const {
    reject
} = require('./reject');

const {
    getSubjects: _getSubjects
} = require('./subjects');

const CREATE = 'create';
const UPDATE = 'update';

const DELETED = 'metadata.deleted';
const UPDATED = 'metadata.updated';

function isCreateOrUpdate(eventName) {
    return eventName === CREATE || eventName === UPDATE;
}

const isNotNil = complement(isNil);

const exec = curry((request, timeout, query) => new Promise(
    (resolve, reject) => request(
        JSON.stringify(query),
        { max: 1 },
        pipe(
            // reject query on timeout
            // NB: timeout is set in Promise and not request function context
            tap(partial(clearTimeout, [ setTimeout(
                partial(reject, [
                    new Error(`query timeout after ${timeout}ms`)
                ]),
                timeout
            ) ])),
            JSON.parse,
            resolve
        )
    )
));

const processEvent= emit => pipe(
    tryCatch(JSON.parse, identity),
    ifElse(is(Error),
        emit,
        partial(emit, [null])
    )
);

class Provider extends EventEmitter {
    constructor({
        schema,
        transport,

        getSubjects = _getSubjects,

        options: {
            timeout = 1000
        } = {}
    }) {
        super();

        assertSchema(schema);
        assert(transport != null, 'transport must be set');

        this._schema    = schema;
        this._transport = transport;

        this._subscribe   = bind(transport.subscribe, transport);
        this._unsubscribe = bind(transport.unsubscribe, transport);

        this._subjects = getSubjects(schema.name);
        {
            const request = bind(transport.request, transport);

            this._create = exec(
                partial(request, [this._subjects.create[0]]), timeout);

            this._find = exec(
                partial(request, [this._subjects.find[0]]), timeout);

            this._update = exec(
                partial(request, [this._subjects.update[0]]), timeout);
        }

        this._listeners = {
            create: new Map,
            update: new Map
        };

        const fields = schema.fields instanceof Function
            ? schema.fields({ Mixed: {}, ObjectId: {} })
            : schema.fields;

        this._hasMetadata = isNotNil(fields.metadata)
            && isNotNil(fields.metadata.deleted);

        if (this._hasMetadata)
            this._defaultConditions = {
                $or: [
                    { metadata:  { $eq:     null  } },
                    { [DELETED]: { $eq:     null  } },
                    { [DELETED]: { $exists: false } }
                ]
            };
        else
            this._defaultConditions = {};

        this._mergeConditions = merge(this._defaultConditions);
    }

    create(object, projection) {
        if (isNil(object))
            return reject `object must be set`;
        if (isNil(projection))
            return reject `projection must be set`;

        return this._create({
            object,
            projection
        });
    }

    delete(conditions, projection) {
        if (!this._hasMetadata)
            return reject `${this._schema.name} cannot be marked as deleted`;
        if (isNil(conditions))
            return reject `conditions must be set`;
        if (isNil(projection))
            return reject `projection must be set`;

        return this._update({
            conditions: this._mergeConditions(conditions),
            object: {
                $currentDate: {
                    [DELETED]: true,
                    [UPDATED]: true
                }
            },
            projection
        }).then(() => this._find({
            conditions,
            projection
        }));
    }

    deleteById(id, projection) {
        if (isNil(id))
            return reject `id must be set`;

        return this.delete({ _id: id }, projection);
    }

    find(conditions, projection) {
        if (isNil(conditions))
            return reject `conditions must be set`;
        if (isNil(projection))
            return reject `projection must be set`;

        return this._find({
            conditions: this._mergeConditions(conditions),
            projection
        });
    }

    findAll(projection) {
        if (isNil(projection))
            return reject `projection must be set`;

        return this._find({
            conditions: this._defaultConditions,
            projection
        });
    }

    findById(id, projection) {
        if (isNil(id))
            return reject `id must be set`;
        if (isNil(projection))
            return reject `projection must be set`;

        return this._find({
            conditions: this._mergeConditions({ _id: id }),

            projection,

            options: {
                limit: 1
            }
        }).then(when(pipe(prop('length'), gt(__, 1)), always(null)));
    }

    updateById(id, object, projection) {
        if (isNil(id))
            return reject `id must be set`;
        if (isNil(object))
            return reject `object must be set`;
        if (isNil(projection))
            return reject `projection must be set`;

        const _object = !this._hasMetadata
            ? object
            : merge(object, {
                $currentDate: {
                    [UPDATED]: true
                }
            });

        return this._update({
            conditions: this._mergeConditions({ _id: id }),
            object:     _object,
            projection
        }).then(() => this._find({
            conditions: { _id: id },
            projection
        }));
    }

    _addListener(eventName, listener, sids) {
        this._listeners[eventName].set(listener, sids);
    }

    _removeAllListeners(eventName) {
        const sids = [];

        if (eventName == null) {
            sids.push(
                ...this._removeAllListeners(CREATE),
                ...this._removeAllListeners(UPDATE)
            );
        }
        else {
            for (let x of this._listeners[eventName].values())
                sids.push(...x);
            this._listeners[eventName] = new Map;
        }

        return sids;
    }

    _removeListener(eventName, listener) {
        const sids = this._listeners[eventName].get(listener);
        this._listeners[eventName].delete(listener);
        return sids;
    }

    on(eventName, listener) {
        if (isCreateOrUpdate(eventName)) {
            const sids = this._subjects[eventName].map(sub => this._subscribe(
                sub, processEvent(this.emit.bind(this, eventName))
            ));

            this._addListener(eventName, listener, sids);
        }

        super.on(eventName, listener);
    }

    once(eventName, listener) {
        if (isCreateOrUpdate(eventName)) {
            const sids = this._subjects[eventName].map(sub => this._subscribe(
                sub, processEvent(this.emit.bind(this, eventName))
            ));

            this._addListener(eventName, listener, sids);
        }

        return super.once(eventName, listener);
    }

    prependListener(eventName, listener) {
        // Cannot reorder transport subscriptions, passing through to on
        return this.on(eventName, listener);
    }

    prependOnceListener(eventName, listener) {
        // Cannot reorder transport subscriptions, passing through to once
        return this.once(eventName, listener);
    }

    removeAllListeners(eventName) {
        if (isCreateOrUpdate(eventName) || eventName == null)
            this._removeAllListeners(eventName).map(this._unsubscribe);

        return super.removeAllListeners(eventName);
    }

    removeListener(eventName, listener) {
        if (isCreateOrUpdate(eventName))
            this._removeListener(eventName, listener).map(this._unsubscribe);

        return super.removeListener(eventName, listener);
    }
}

module.exports = {
    Provider,

    exec
};
