'use strict';

const {
  ok: assert,
  deepStrictEqual,
  strictEqual,
  throws
} = require('assert');

const {
  bind,
  F,
  is,
  partial
} = require('ramda');

const {
  spy,
  stub
} = require('sinon');

const {
  getSubjects: _getSubjects,
  Store,
  StoreEvents
} = require('../');

const {
  rejects
} = require('./reject');

const goodSchema = {
  name: 'Schema',

  fields: {}
};

const subjects = _getSubjects(goodSchema.name);

const goodTransport = {
  publish() {},
  subscribe() {},
  unsubscribe() {}
};

function buildModel() {
  return {
    count:  F,
    create: F,
    find:   F,
    update: F
  };
}

describe('Store', () => {
  describe('constructor', () => {
    function testCtor(getSubjects = _getSubjects) {
      const store = new Store({
        buildModel,
        getSubjects,

        schema:    goodSchema,
        transport: goodTransport
      });

      assert(is(Function, store._subscribe));
      assert(is(Function, store._unsubscribe));

      assert(is(Function, store._onCount));
      assert(is(Function, store._onCreate));
      assert(is(Function, store._onFind));
      assert(is(Function, store._onUpdate));

      deepStrictEqual(store._subjects, getSubjects(goodSchema.name));

      assert(is(Array, store._sids));
    }

    it('should work with good args', () => {
      testCtor();
    });

    it('should work with custom getSubjects', () => {
      testCtor(name => ({
        count:  ['a', 'b'],
        create: ['c', 'd'],
        find:   ['e', `f.${name}`, 'g'],
        update: ['h.>']
      }));
    });

    it('should throw without any args', () => throws(() => new Store()));

    it('should throw without buildModel',
      () => throws(() => new Store({})));

    it('should throw with bad buildModel',
      () => throws(() => new Store({ buildModel: 1 })));

    it('should throw without schema',
      () => throws(() => new Store({ buildModel })));

    it('should throw with bad schema',
      () => throws(() => new Store({
        buildModel,
        schema: {}
      })));

    it('should throw without transport',
      () => throws(() => new Store({
        buildModel,
        schema: goodSchema
      })));

    it('should throw with bad transport',
      () => throws(() => new Store({
        buildModel,
        schema:    goodSchema,
        transport: {}
      })));
  });

  function getGoodStore(subscribe = spy()) {
    return new Store({
      buildModel,

      schema:    goodSchema,
      transport: {
        subscribe,

        publish()     {},
        unsubscribe() {}
      }
    });
  }

  describe('open', () => {
    it('should work', () => {
      const gen = (function* () {
        yield subjects.count[0];
        yield subjects.count[1];
        yield subjects.create[0];
        yield subjects.create[1];
        yield subjects.find[0];
        yield subjects.find[1];
        yield subjects.update[0];
        yield subjects.update[1];
      })();

      let c = 0;
      function subscribe(sub, cb) {
        assert(is(Function, cb));

        const res = gen.next();
        if (!res.done)
          strictEqual(sub, res.value);

        return ++c;
      }

      const store = getGoodStore(subscribe);

      store.open();

      deepStrictEqual(store._sids, [1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should throw when already opened', () => {
      const store = getGoodStore();

      store.open();

      throws(() => store.open());
    });
  });

  describe('close', () => {
    it('should work', () => {
      const store = getGoodStore();

      store.open();
      store.close();

      deepStrictEqual(store._sids, []);
    });

    it('should throw when already closed', () => {
      const store = getGoodStore();

      store.open();
      store.close();

      throws(() => store.close());
    });
  });

  function testOn(method, errorEvent, msg, resolved = {
    result: { a: 1 }
  }) {
    describe('should reject', () => {
      const store = new Store({
        buildModel,

        schema:    goodSchema,
        transport: goodTransport
      });

      const _rejects = rejects(bind(store[method], store));

      it('without msg', _rejects(null, null));

      it('without replyTo', _rejects('{}', null));

      it('with unparsable msg and trigger event', done => {
        let eventHappened = false;
        store.once(errorEvent, () => { eventHappened = true; });

        _rejects('{', 'a')(() => done(eventHappened
          ? null
          : new Error()
        ));
      });
    });

    describe('should resolve', () => {
      const goodBuildModel = () => ({
        count:  partial(bind(Promise.resolve, Promise), [7]),
        create: bind(Promise.resolve, Promise),
        find:   bind(Promise.resolve, Promise),
        update: bind(Promise.resolve, Promise)
      });

      const err = new Error('msg');

      const badBuildModel = () => ({
        count:  partial(bind(Promise.reject, Promise), [err]),
        create: partial(bind(Promise.reject, Promise), [err]),
        find:   partial(bind(Promise.reject, Promise), [err]),
        update: partial(bind(Promise.reject, Promise), [err])
      });

      it('with good args', done => {
        const publish = stub().withArgs(
          'replyTo',
          JSON.stringify(resolved)
        ).callsFake(done);

        const store = new Store({
          buildModel: goodBuildModel,
          schema:     goodSchema,

          transport: {
            publish,

            subscribe()   {},
            unsubscribe() {}
          }
        });

        store[method](JSON.stringify(msg), 'replyTo');
      });

      it('and return error when model rejects', done => {
        const publish = stub().withArgs(
          'replyTo',
          JSON.stringify({ error: {
            message: err.message
          }})
        ).callsFake(done);

        const store = new Store({
          buildModel: badBuildModel,
          schema:     goodSchema,

          transport: {
            publish,

            subscribe()   {},
            unsubscribe() {}
          }
        });

        store[method](JSON.stringify(msg), 'replyTo');
      });
    });
  }

  describe('_onCount', () => testOn(
    '_onCount',
    StoreEvents.CountError,
    {
      object: { a: 1, b: 2 }
    },
    { result: 7 }
  ));

  describe('_onCreate', () => testOn(
    '_onCreate',
    StoreEvents.CreateError,
    {
      object: { a: 1, b: 2 },
      projection: { a: 1 }
    }
  ));

  describe('_onFind', () => testOn(
    '_onFind',
    StoreEvents.FindError,
    {
      conditions: { a: 1 }
    }
  ));

  describe('_onUpdate', () => testOn(
    '_onFind',
    StoreEvents.FindError,
    {
      conditions: { id: 1 },
      object:     { a: 1 }
    },
    { result: { id: 1 } }
  ));
});
