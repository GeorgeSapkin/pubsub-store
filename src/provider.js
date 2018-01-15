'use strict';

const {
  ok: assert
} = require('assert');

const {
  always,
  bind,
  complement,
  constructN,
  curry,
  equals,
  head,
  identity,
  ifElse,
  is,
  isNil,
  merge,
  min,
  partial,
  path,
  pipe,
  prop,
  tap,
  tryCatch
} = require('ramda');

const {
  Duplex
} = require('stream');

const {
  assertSchema
} = require('./assert');

const {
  reject
} = require('./reject');

const {
  getSubjects: _getSubjects
} = require('./subjects');

const DELETED = 'metadata.deleted';
const UPDATED = 'metadata.updated';

const ProviderEvents = {
  Create:      'create',
  StreamError: 'stream-error',
  Update:      'update'
};

function isCreateOrUpdate(eventName) {
  return eventName === ProviderEvents.Create ||
         eventName === ProviderEvents.Update;
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

      // if error is not set -> resolve
      // else                -> reject
      ifElse(pipe(prop('error'), isNil),
        // Add 'more' to 'result' if it exists and resolve
        pipe(prop('result'), resolve),
        pipe(path(['error', 'message']), constructN(1, Error), reject)
      )
    )
  )
));

async function batchExec(exec, batchSize, options) {
  const limit  = options.limit || batchSize;
  const result = [];

  for (let skip = 0, left = limit; left > 0; ++skip) {
    const batch = await exec(merge(options, {
      limit: min(left, batchSize),
      skip:  batchSize * skip
    }));

    result.push(...batch);

    left -= batchSize;
    if (batch.length < batchSize)
      break;
  }

  return result;
}

const processEvent = emit => pipe(
  tryCatch(JSON.parse, identity),
  ifElse(is(Error),
    emit,
    partial(emit, [null])
  )
);

const returnOneOnly = ifElse(pipe(prop('length'), equals(1)),
  head,
  always(null)
);

class Provider extends Duplex {
  constructor({
    schema,
    transport,

    getSubjects = _getSubjects,

    options: {
      batchSize = 5000,
      timeout   = 1000
    } = {}
  }) {
    super({
      objectMode: true
    });

    assertSchema(schema);
    assert(transport != null, 'transport must be set');

    this._readableStreamInitialized = false;

    this._schema    = schema;
    this._transport = transport;

    this._batchSize = batchSize;

    this._subscribe   = bind(transport.subscribe, transport);
    this._unsubscribe = bind(transport.unsubscribe, transport);

    this._subjects = getSubjects(schema.name);
    {
      const request = bind(transport.request, transport);

      this._count = exec(
        partial(request, [this._subjects.count[0]]), timeout);

      this._create = exec(
        partial(request, [this._subjects.create[0]]), timeout);

      this._find = exec(
        partial(request, [this._subjects.find[0]]), timeout);

      this._update = exec(
        partial(request, [this._subjects.update[0]]), timeout);
    }

    this._listeners = {
      create: new Map(),
      update: new Map()
    };

    const fields = schema.fields instanceof Function
      ? schema.fields({ Mixed: {}, ObjectId: {} })
      : schema.fields;

    this._hasMetadata = isNotNil(fields.metadata) &&
            isNotNil(fields.metadata.deleted);

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

  count(conditions) {
    if (isNil(conditions))
      return reject `conditions must be set`;

    return this._count({
      conditions: this._mergeConditions(conditions)
    });
  }

  countAll() {
    return this._count({
      conditions: this._defaultConditions
    });
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
    }).then(() => batchExec(_options => this._find({
      conditions: merge(conditions, {
        [DELETED]: {
          $exists: true,
          $ne:     null
        }
      }),

      options: _options,

      projection
    }), this._batchSize, {}));
  }

  deleteById(id, projection) {
    if (isNil(id))
      return reject `id must be set`;

    return this.delete({ _id: id }, projection).then(returnOneOnly);
  }

  find(conditions, projection, options = {}) {
    if (isNil(conditions))
      return reject `conditions must be set`;
    if (isNil(projection))
      return reject `projection must be set`;

    return batchExec(_options => this._find({
      conditions: this._mergeConditions(conditions),
      options:    _options,

      projection
    }), this._batchSize, options);
  }

  findAll(projection, options = {}) {
    return this.find({}, projection, options);
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
    }).then(returnOneOnly);
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

      projection,

      options: {
        limit: 1
      }
    })).then(returnOneOnly);
  }

  _addListener(eventName, listener, sids) {
    this._listeners[eventName].set(listener, sids);
  }

  _removeAllListeners(eventName) {
    const sids = [];

    if (eventName == null) {
      sids.push(
        ...this._removeAllListeners(ProviderEvents.Create),
        ...this._removeAllListeners(ProviderEvents.Update)
      );
    }
    else {
      for (const x of this._listeners[eventName].values())
        sids.push(...x);
      this._listeners[eventName] = new Map();
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

  _read() {
    if (this._readableStreamInitialized)
      return;

    this.on(ProviderEvents.Create, this._onCreate.bind(this));

    this._readableStreamInitialized = true;
  }

  _onCreate(err, msg) {
    if (isNotNil(err))
      return this.emit(ProviderEvents.StreamError, err);

    const { object } = msg;

    if (isNil(object))
      return this.emit(ProviderEvents.StreamError, new Error(
        'msg.object is not set'
      ));

    this.push(object);
  }

  _write(chunk, _, callback) {
    this.create(chunk, { id: 1 }).then(() => callback(), err => {
      // NB: Emitting `error` event or passing error to callback unpipes from
      //     Readable. Emitting custom event instead.
      process.nextTick(() => this.emit(ProviderEvents.StreamError, err));
      return callback();
    });
  }

  _writev(chunks, callback) {
    // NB: Emitting `error` event or passing error to callback unpipes from
    //     Readable. Emitting custom event instead.
    const emitStreamError = err => process.nextTick(
      () => this.emit(ProviderEvents.StreamError, err)
    );

    // Build sequential promise chain to preserve creation order
    chunks.reduce(
      (prev, { chunk }) => prev
        .then(() => this.create(chunk, { id: 1 }))
        // Handle `create` rejections inside same `reduce` iteration
        .catch(emitStreamError),
      Promise.resolve()
    // No need to for final catch since individual errors are handled inside
    // `reduce` iterations
    ).then(() => callback());
  }
}

module.exports = {
  Provider,
  ProviderEvents,

  batchExec,
  exec
};
