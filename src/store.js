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
  bind,
  complement,
  curry,
  equals,
  identity,
  ifElse,
  invoker,
  is,
  isNil,
  keys,
  liftN,
  merge,
  nthArg,
  objOf,
  partial,
  pick,
  pickAll,
  pickBy,
  pipe,
  prop,
  propOr,
  tap,
  tryCatch
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

const catchP   = invoker(2, 'then')(null);
const isNot    = complement(is);
const isNotNil = complement(isNil);
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
  if (isNot(String, replyTo))
    return reject `replyTo must be a string`;

  return pipe(
    tryCatch(JSON.parse, identity),
    ifElse(is(Error),
      pipe(
        bind(Promise.reject, Promise),
        tap(catchP(emit)),
        catchP(buildError),
        thenP(partial(publish, [replyTo]))
      ),
      pipe(
        process,
        thenP2(buildResult, buildError),
        thenP(JSON.stringify),
        thenP(partial(publish, [replyTo]))
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

    assert(buildModel instanceof Function,
      'buildModel must be a function');
    assertSchema(schema);
    assert(isNotNil(transport), 'transport must be set');

    this._subscribe   = bind(transport.subscribe, transport);
    this._unsubscribe = bind(transport.unsubscribe, transport);

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
      // create model from object and then apply projection manually
      liftN(2, thenP)(
        // assuming create model doesn't project so applying projection
        // manually
        pipe(
          prop('projection'),
          ifElse(isNotNil,
            // is not nill
            pipe(
              pickBy(pipe(nthArg(0), equals(1))),
              keys,
              pickAll
            ),
            // else
            identity
          )
        ),
        pipe(
          prop('object'),
          model.create.bind(model)
        )
      )
    );

    this._onFind = exec(
      partial(emit, [StoreEvents.FindError]),
      publish,
      liftN(3, model.find.bind(model))(
        propOr({}, 'conditions'),
        prop('projection'),
        prop('options')
      )
    );

    this._onUpdate = exec(
      partial(emit, [StoreEvents.UpdateError]),
      publish,
      liftN(3, model.update.bind(model))(
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
