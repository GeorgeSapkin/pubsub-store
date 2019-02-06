'use strict';

const {
  ok: assert,
  deepStrictEqual,
  notDeepStrictEqual
} = require('assert');

const {
  EventEmitter
} = require('events');

const {
  always,
  complement,
  curry,
  identity,
  ifElse,
  invoker,
  is,
  isNil,
  liftN,
  merge,
  objOf,
  partial,
  pick,
  pipe,
  prop,
  propOr,
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

const catchP   = invoker(1, 'catch');
const isNot    = complement(is);
const isNotNil = complement(isNil);
const liftN2   = liftN(2);
const liftN3   = liftN(3);
const thenP    = invoker(1, 'then');
const thenP2   = invoker(2, 'then');

const StoreEvents = {
  CountError:  'count-error',
  CreateError: 'create-error',
  FindError:   'find-error',
  UpdateError: 'update-error'
};

const updateOptionsBase = {
  multi: true
};

/* Response format:
 * {
 *    result: {} or [] or value
 *      or
 *    error: {
 *        message: "details"
 *    }
 * }
 *
 */

const buildError  = pipe(pick(['message']), objOf('error'));
const buildResult = objOf('result');

const exec = curry((emit, publish, process, msg, replyTo) => {
  if (isNot(String, msg))
    return reject `msg must be a string`;

  // emits an error either on parse or on process
  return pipe(
    tryCatch(JSON.parse, identity),
    ifElse(is(Error),
      pipe(
        Promise.reject.bind(Promise),
        tap(catchP(emit)),
        catchP(buildError),
        thenP(partial(publish, [replyTo]))
      ),
      pipe(
        process,
        // Publish a response only when `replyTo` is set
        when(pipe(always(replyTo), isNotNil),
          pipe(
            thenP2(buildResult, buildError),
            thenP(JSON.stringify),
            thenP(partial(publish, [replyTo]))
          )
        )
      )
    )
  )(msg);
});

class Store extends EventEmitter {
  constructor({
    buildModel,
    schema,
    transport,

    getSubjects = _getSubjects
  }) {
    super();

    assert(buildModel instanceof Function, 'buildModel must be a function');
    assertSchema(schema);
    assert(isNotNil(transport), 'transport must be set');

    this._subscribe   = transport.subscribe.bind(transport);
    this._unsubscribe = transport.unsubscribe.bind(transport);

    this._subjects = getSubjects(schema.name);

    const model = buildModel(schema);

    this._sids = [];

    const publish = transport.publish.bind(transport);
    const emit    = this.emit.bind(this);

    this._onCount = exec(
      partial(emit, [StoreEvents.CountError]),
      publish,
      pipe(propOr({}, 'conditions'), model.count.bind(model))
    );

    this._onCreate = exec(
      partial(emit, [StoreEvents.CreateError]),
      publish,
      liftN2(model.create.bind(model))(
        // `create` must tell the difference between a single object and an
        // array and then project correctly
        prop('object'),
        prop('projection')
      )
    );

    this._onFind = exec(
      partial(emit, [StoreEvents.FindError]),
      publish,
      liftN3(model.find.bind(model))(
        propOr({}, 'conditions'),
        prop('projection'),
        prop('options')
      )
    );

    this._onUpdate = exec(
      partial(emit, [StoreEvents.UpdateError]),
      publish,
      liftN3(model.update.bind(model))(
        prop('conditions'),
        prop('object'),
        pipe(
          prop('projection'),
          objOf('select'),
          merge(updateOptionsBase)
        )
      )
    );
  }

  open() {
    deepStrictEqual(this._sids, [], 'Store already opened');

    this._sids.push(
      ...this._subjects.count.map(
        sub => this._subscribe(sub, this._onCount)),
      ...this._subjects.create.map(
        sub => this._subscribe(sub, this._onCreate)),
      ...this._subjects.find.map(
        sub => this._subscribe(sub, this._onFind)),
      ...this._subjects.update.map(
        sub => this._subscribe(sub, this._onUpdate))
    );
  }

  close() {
    notDeepStrictEqual(this._sids, [], 'Store not opened');

    this._sids.map(this._unsubscribe);

    this._sids = [];
  }
}

module.exports = {
  Store,
  StoreEvents
};
