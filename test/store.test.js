'use strict';

const {
  F
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

  function testOn(storeMethod, modelMethod, errorEvent, msg, args, resolved) {
    describe('should reject', () => {
      const store = new Store({
        buildModel,

        schema:    goodSchema,
        transport: goodTransport
      });

      const _rejects = rejects(store[storeMethod].bind(store));

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
      it('with good args', done => {
        const model = {
          count:  F,
          create: F,
          find:   F,
          update: F
        };

        model[modelMethod] = stub()
          .withArgs(...args)
          .resolves(resolved.result);

        const publish = stub()
          .withArgs(
            'replyTo',
            JSON.stringify(resolved)
          // NB: Don't pass arguments to `done`
          ).callsFake(()  => done());

        const store = new Store({
          buildModel: () => model,

          schema: goodSchema,

          transport: {
            publish,

            subscribe()   {},
            unsubscribe() {}
          }
        });

        store[storeMethod](JSON.stringify(msg), 'replyTo');
      });

      it('and return error when model rejects', done => {
        const err    = new Error('msg');
        const reject = Promise.reject.bind(Promise, err);

        const badBuildModel = () => ({
          count:  reject,
          create: reject,
          find:   reject,
          update: reject
        });

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

        store[storeMethod](JSON.stringify(msg), 'replyTo');
      });
    });
  }

  describe('_onCount', () => {
    const object = { a: 1, b: 2 };

    const msg  = { object };
    const args = [ object ];

    const resolved = {
      result: 7
    };

    testOn(
      '_onCount',
      'count',
      StoreEvents.CountError,
      msg,
      args,
      resolved
    );
  });

  describe('_onCreate', () => {
    const object     = { a: 1, b: 2 };
    const projection = { a: 1 };

    const msg  = { object, projection };
    const args = [ object, projection ];

    const resolved = {
      result: { a: 1 }
    };

    testOn(
      '_onCreate',
      'create',
      StoreEvents.CreateError,
      msg,
      args,
      resolved
    );
  });

  describe('_onFind', () => {
    const object = { conditions: { a: 1 } };

    const msg  = { object };
    const args = [ object ];

    const resolved = {
      result: { a: 1 }
    };

    testOn(
      '_onFind',
      'find',
      StoreEvents.FindError,
      msg,
      args,
      resolved
    );
  });

  describe('_onUpdate', () => {
    const conditions = { id: 1 };
    const object     = { a: 1 };

    const msg  = { conditions, object };
    const args = [ conditions, object ];

    const resolved = {
      result: { id: 1 }
    };

    testOn(
      '_onUpdate',
      'update',
      StoreEvents.UpdateError,
      msg,
      args,
      resolved
    );
  });
});
