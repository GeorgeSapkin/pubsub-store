'use strict';

const {
  bind,
  F,
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

      expect(store._subscribe).toBeInstanceOf(Function);
      expect(store._unsubscribe).toBeInstanceOf(Function);

      expect(store._onCount).toBeInstanceOf(Function);
      expect(store._onCreate).toBeInstanceOf(Function);
      expect(store._onFind).toBeInstanceOf(Function);
      expect(store._onUpdate).toBeInstanceOf(Function);

      expect(store._subjects).toMatchObject(getSubjects(goodSchema.name));

      expect(store._sids).toBeInstanceOf(Array);
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

    it('should throw without any args',
      () => expect(() => new Store()).toThrow()
    );

    it('should throw without buildModel',
      () => expect(() => new Store({})).toThrow());

    it('should throw with bad buildModel',
      () => expect(() => new Store({ buildModel: 1 })).toThrow());

    it('should throw without schema',
      () => expect(() => new Store({ buildModel })).toThrow());

    it('should throw with bad schema',
      () => expect(() => new Store({
        buildModel,
        schema: {}
      })).toThrow());

    it('should throw without transport',
      () => expect(() => new Store({
        buildModel,
        schema: goodSchema
      })).toThrow());

    it('should throw with bad transport',
      () => expect(() => new Store({
        buildModel,
        schema:    goodSchema,
        transport: {}
      })).toThrow());
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
        expect(cb).toBeInstanceOf(Function);

        const res = gen.next();
        if (!res.done)
          expect(sub).toBe(res.value);

        return ++c;
      }

      const store = getGoodStore(subscribe);

      store.open();

      expect(store._sids).toMatchObject([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should throw when already opened', () => {
      const store = getGoodStore();

      store.open();

      expect(() => store.open()).toThrow();
    });
  });

  describe('close', () => {
    it('should work', () => {
      const store = getGoodStore();

      store.open();
      store.close();

      expect(store._sids).toMatchObject([]);
    });

    it('should throw when already closed', () => {
      const store = getGoodStore();

      store.open();
      store.close();

      expect(() => store.close()).toThrow();
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
        // NB: Don't pass arguments to `done`
        ).callsFake(() => done());

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
        // NB: Don't pass arguments to `done`
        ).callsFake(() => done());

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
