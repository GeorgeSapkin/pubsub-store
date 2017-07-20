'use strict';

const {
  ok: assert,
  deepStrictEqual,
  equal,
  notEqual,
  strictEqual,
  throws
} = require('assert');

const {
  complement,
  curry,
  equals,
  F,
  is,
  isNil,
  merge,
  pipe
} = require('ramda');

const {
  Readable,
  Writable
} = require('stream');

const {
  Provider,
  ProviderError
} = require('../');

const {
  batchExec,
  exec
} = require('../src/provider');

const {
  rejects
} = require('./reject');

const {
  getSubjects: _getSubjects
} = require('../src/subjects');

const goodSchema = {
  name: 'Schema',

  fields: {}
};

const goodSchemaWithFunFields = {
  name: 'Schema',

  fields: () => ({})
};

const subjects = _getSubjects(goodSchema.name);

const goodSchemaWithMetadata = {
  name: 'Schema',

  fields: {
    metadata: {
      deleted: {}
    }
  }
};

const goodTransport = {
  request()     {},
  subscribe()   {},
  unsubscribe() {}
};

const badProvider = new Provider({
  schema:    goodSchema,
  transport: goodTransport
});

const goodProvider = new Provider({
  schema:    goodSchemaWithMetadata,
  transport: goodTransport
});

const execRejects = rejects(exec);
const isNot       = complement(is);

describe('batchExec', () => {
  describe('should resolve', () => {
    it('with no elements', () => {
      const result = [];

      function exec(options) {
        deepStrictEqual(options, {
          limit: 2,
          skip:  0
        });

        return Promise.resolve(result);
      }

      return batchExec(exec, 2, { limit: 5 })
        .then(res => deepStrictEqual(res, result));
    });

    it('with less elements', () => {
      const result = [{
        b: 3
      }, {
        c: 5
      }, {
        d: 7
      }];

      let i = 0;

      function exec(options) {
        switch (i++) {
          case 0:
            deepStrictEqual(options, {
              limit: 2,
              skip:  0
            });

            return Promise.resolve(result.slice(0, 2));
          case 1:
            deepStrictEqual(options, {
              limit: 2,
              skip:  2
            });

            return Promise.resolve(result.slice(2));
        }
      }

      return batchExec(exec, 2, { limit: 5 })
        .then(res => deepStrictEqual(res, result));
    });

    it('with more elements', () => {
      const result = [{
        b: 3
      }, {
        c: 5
      }, {
        d: 7
      }, {
        e: 11
      }];

      let i = 0;

      function exec(options) {
        switch (i++) {
          case 0:
            deepStrictEqual(options, {
              limit: 2,
              skip:  0
            });

            return Promise.resolve(result.slice(0, 2));
          case 1:
            deepStrictEqual(options, {
              limit: 1,
              skip:  2
            });

            return Promise.resolve(result.slice(2, 3));
        }
      }

      return batchExec(exec, 2, { limit: 3 })
        .then(res => deepStrictEqual(res, result.slice(0, 3)));
    });
  });
});

describe('exec', () => {
  describe('should resolve', () => {
    it('an object', () => {
      const query  = { a: 1 };
      const result = { b: 1 };

      function request(msg, _, next) {
        strictEqual(msg, JSON.stringify(query));
        return next(JSON.stringify({ result }));
      }

      return exec(request, 20, query)
        .then(res => deepStrictEqual(res, result));
    });

    it('an array', () => {
      const query  = { a: 1 };
      const result = [{ b: 1 }];

      function request(msg, _, next) {
        strictEqual(msg, JSON.stringify(query));
        return next(JSON.stringify({ result }));
      }

      return exec(request, 20, query)
        .then(res => deepStrictEqual(res, result));
    });
  });

  describe('should reject', () => {
    function errorRequest(_0, _1, next) {
      return next(JSON.stringify({ error: { message: 'msg' } }));
    }

    function badJsonRequest(_0, _1, next) {
      return next('{');
    }

    it('on timeout', execRejects(F, 10, {}));

    it('on error', execRejects(errorRequest, 10, {}));

    it('with unparsable JSON', execRejects(badJsonRequest, 10, {}));
  });
});

describe('Provider', () => {
  describe('constructor', () => {
    function testCtor(schema, hasMetadata, getSubjects = _getSubjects) {
      const provider = new Provider({
        schema,
        getSubjects,

        transport: goodTransport
      });

      deepStrictEqual(provider._schema,    schema);
      deepStrictEqual(provider._transport, goodTransport);

      assert(is(Function, provider._subscribe));
      assert(is(Function, provider._unsubscribe));

      deepStrictEqual(provider._subjects, getSubjects(schema.name));

      assert(is(Function, provider._count));
      assert(is(Function, provider._create));
      assert(is(Function, provider._find));
      assert(is(Function, provider._update));

      notEqual(provider._listeners, null);
      assert(is(Map, provider._listeners.create));
      assert(is(Map, provider._listeners.update));

      assert(is(Function, provider._mergeConditions));

      strictEqual(provider._hasMetadata, hasMetadata);

      if (hasMetadata)
        deepStrictEqual(provider._defaultConditions, {
          $or: [
            { metadata:           { $eq:     null  } },
            { 'metadata.deleted': { $eq:     null  } },
            { 'metadata.deleted': { $exists: false } }
          ]
        });
      else
        deepStrictEqual(provider._defaultConditions, { });
    }

    it('should work with good args with function fields without metadata',
      () => testCtor(goodSchemaWithFunFields, false));

    it('should work with good args with metadata',
      () => testCtor(goodSchemaWithMetadata, true));

    it('should work with good args with custom getSubjects',
      () => testCtor(goodSchemaWithFunFields, false, name => ({
        count:  ['a', 'b'],
        create: ['c', 'd'],
        find:   ['e', `f.${name}`, 'g'],
        update: ['h.>']
      })));

    it('should throw without any args', () => throws(() => new Provider()));

    it('should throw without transport', () => throws(() => new Provider({
      schema: goodSchema
    })));
  });

  describe('count', () => {
    it('should resolve', () => {
      const conditions = { b: 2 };
      const result     = 7;

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.count[0]);
        strictEqual(msg, JSON.stringify({ conditions }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({ result }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).count(conditions)
        .then(res => deepStrictEqual(res, result));
    });

    const goodRejects = rejects(goodProvider.count.bind(goodProvider));

    it('should reject when conditions is not set', goodRejects(null));
  });

  describe('countAll', () => {
    it('should resolve', () => {
      const result = 7;

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.count[0]);
        strictEqual(msg, JSON.stringify({ conditions: {} }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({ result }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).countAll()
        .then(res => deepStrictEqual(res, result));
    });

    const goodRejects = rejects(goodProvider.count.bind(goodProvider));

    it('should reject when conditions is not set', goodRejects(null));
  });

  describe('create', () => {
    it('should resolve an object', () => {
      const object     = { a: 1 };
      const projection = { b: 1 };

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.create[0]);
        strictEqual(msg, JSON.stringify({ object, projection }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({
          result: merge(object, { _id: 1 })
        }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      })
        .create(object, projection)
        .then(res => deepStrictEqual(res, merge(object, { _id: 1 })));
    });

    const goodRejects = rejects(goodProvider.create.bind(goodProvider));

    it('should reject when object is not set', goodRejects(null, null));

    it('should reject when projection is not set', goodRejects({}, null));
  });

  describe('delete', () => {
    it('should resolve an object', () => {
      const conditions = { a: 1 };
      const projection = { b: 1 };

      function request(sub, msg, options, next) {
        if (sub === subjects.find[0])
          return next(JSON.stringify({ result: [{ _id: 1 }] }));
        else if (sub === subjects.update[0]) {
          strictEqual(msg, JSON.stringify({
            conditions: {
              $or: [
                { metadata:           { $eq:     null  } },
                { 'metadata.deleted': { $eq:     null  } },
                { 'metadata.deleted': { $exists: false } }
              ],
              a: 1
            },
            object: {
              $currentDate: {
                'metadata.deleted': true,
                'metadata.updated': true
              }
            },
            projection
          }));
          deepStrictEqual(options, { max: 1 });

          return next(JSON.stringify({ result: [{ c: 1 }]}));
        }
        else
          return assert(false);
      }

      return new Provider({
        schema:    goodSchemaWithMetadata,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      })
        .delete(conditions, projection)
        .then(curry(deepStrictEqual)([{ _id: 1 }]));
    });

    const badRejects  = rejects(badProvider.delete.bind(badProvider));
    const goodRejects = rejects(goodProvider.delete.bind(goodProvider));

    it('should reject when schema has no metadata',
      badRejects(null, null));

    it('should reject when object is not set',
      goodRejects(null, null));

    it('should reject when projection is not set',
      goodRejects({}, null));
  });

  describe('deleteById', () => {
    it('should resolve an object', () => {
      const projection = { b: 1 };
      const result     = { _id: 1 };

      function request(sub, msg, options, next) {
        if (sub === subjects.find[0])
          return next(JSON.stringify({ result: [result] }));
        else if (sub === subjects.update[0]) {
          strictEqual(msg, JSON.stringify({
            conditions: {
              $or: [
                { metadata:           { $eq:     null  } },
                { 'metadata.deleted': { $eq:     null  } },
                { 'metadata.deleted': { $exists: false } }
              ],
              _id: 1
            },
            object: {
              $currentDate: {
                'metadata.deleted': true,
                'metadata.updated': true
              }
            },
            projection
          }));
          deepStrictEqual(options, { max: 1 });

          return next(JSON.stringify({ c: 1 }));
        }
        else
          return assert(false);
      }

      return new Provider({
        schema:    goodSchemaWithMetadata,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      })
        .deleteById(1, projection)
        .then(res => {
          assert(isNot(Array, res));
          deepStrictEqual(res, result);
        });
    });

    const badRejects  = rejects(badProvider.deleteById.bind(badProvider));
    const goodRejects = rejects(goodProvider.deleteById.bind(goodProvider));

    it('should reject when schema has no metadata', badRejects(null, null));

    it('should reject when id is not set', goodRejects(null, null));

    it('should reject when projection is not set', goodRejects(1, null));
  });

  describe('find', () => {
    it('should resolve array', () => {
      const conditions = { b: 2 };
      const projection = { a: 1 };
      const result     = [{ c: 3 }];

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.find[0]);
        strictEqual(msg, JSON.stringify({
          conditions,
          options: {
            limit: 5000,
            skip:  0
          },
          projection
        }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({ result }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).find(conditions, projection)
        .then(res => deepStrictEqual(res, result));
    });

    const goodRejects = rejects(goodProvider.find.bind(goodProvider));

    it('should reject when id is not set', goodRejects(null, null));

    it('should reject when projection is not set', goodRejects({}, null));
  });

  describe('findAll', () => {
    it('should resolve array', () => {
      const conditions = {};
      const projection = { a: 1 };
      const result     = [{ c: 3 }];

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.find[0]);
        strictEqual(msg, JSON.stringify({
          conditions,
          options: {
            limit: 5000,
            skip:  0
          },
          projection
        }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({ result }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).findAll(projection)
        .then(res => deepStrictEqual(res, result));
    });

    const goodRejects = rejects(goodProvider.findAll.bind(goodProvider));

    it('should reject when projection is not set', goodRejects(null));
  });

  describe('findById', () => {
    it('should resolve single entity', () => {
      const conditions = { _id: 1 };
      const projection = { a: 1 };
      const result     = { c: 3 };

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.find[0]);
        strictEqual(msg, JSON.stringify({
          conditions,
          projection,
          options: { limit: 1 }
        }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({ result: [result] }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).findById(1, projection)
        .then(res => {
          assert(isNot(Array, res));
          deepStrictEqual(res, result);
        });
    });

    it('should resolve nothing when more than one', () => {
      const conditions = { _id: 1 };
      const projection = { a: 1 };
      const result     = [{ c: 3 }, { c: 4 }];

      function request(sub, msg, options, next) {
        strictEqual(sub, subjects.find[0]);
        strictEqual(msg, JSON.stringify({
          conditions,
          projection,
          options: { limit: 1 }
        }));
        deepStrictEqual(options, { max: 1 });

        return next(JSON.stringify({ result }));
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).findById(1, projection)
        .then(pipe(isNil, assert));
    });

    const goodRejects = rejects(goodProvider.findById.bind(goodProvider));

    it('should reject when id is not set', goodRejects(null, null));

    it('should reject when projection is not set', goodRejects(1, null));
  });

  describe('updateById', () => {
    it('should resolve an object', () => {
      const object       = { a: 1 };
      const projection   = { b: 1 };
      const resultFind   = { _id: 1 };
      const resultUpdate = { c: 1 };

      function request(sub, msg, options, next) {
        if (sub === subjects.find[0])
          return next(JSON.stringify({ result: [resultFind] }));
        else if (sub === subjects.update[0]) {
          strictEqual(msg, JSON.stringify({
            conditions: { _id: 1 },
            object:     { a:   1 },
            projection
          }));
          deepStrictEqual(options, { max: 1 });

          return next(JSON.stringify({ result: resultUpdate }));
        }
        else
          return assert(false);
      }

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      })
        .updateById(1, object, projection)
        .then(res => {
          assert(isNot(Array, res));
          deepStrictEqual(res, resultFind);
        });
    });

    it('should resolve an object and update metadata', () => {
      const object       = { a: 1 };
      const projection   = { b: 1 };
      const resultFind   = { _id: 1 };
      const resultUpdate = { c: 1 };

      function request(sub, msg, options, next) {
        if (sub === subjects.find[0])
          return next(JSON.stringify({ result: [resultFind] }));
        else if (sub === subjects.update[0]) {
          strictEqual(msg, JSON.stringify({
            conditions: {
              $or: [
                { metadata:           { $eq:     null  } },
                { 'metadata.deleted': { $eq:     null  } },
                { 'metadata.deleted': { $exists: false } }
              ],
              _id: 1
            },
            object: {
              a: 1,

              $currentDate: {
                'metadata.updated': true
              }
            },
            projection
          }));
          deepStrictEqual(options, { max: 1 });

          return next(JSON.stringify({ result: resultUpdate }));
        }
        else
          return assert(false);
      }

      return new Provider({
        schema:    goodSchemaWithMetadata,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      })
        .updateById(1, object, projection)
        .then(res => deepStrictEqual(res, resultFind));
    });

    const goodRejects = rejects(goodProvider.updateById.bind(goodProvider));

    it('should reject when id is not set', goodRejects(null, null, null));

    it('should reject when object is not set', goodRejects(1, null, null));

    it('should reject when projection is not set',
      goodRejects(1, {}, null));
  });

  describe('EventEmitter', () => {
    function testOnEvent({ onceFn, onFn }, eventName, once, error, done) {
      function listener(err, query) {
        if (error) {
          assert(is(Error), err);
          equal(query, null);
        }
        else {
          equal(err, null);
          deepStrictEqual(query, { a: 1 });
        }

        if (once)
          equals(provider._listeners[eventName].get(listener), null);

        done();
      }

      const transport = {
        request() {},

        subscribe(sub, subListener) {
          if (sub === subjects[eventName][0])
            return 1; // sid
          else if (sub === subjects[eventName][1]) {
            setImmediate(() => {
              deepStrictEqual(
                provider._listeners[eventName].get(listener),
                [1, 2]
              );

              if (error)
                subListener('{');
              else
                subListener(JSON.stringify({ a: 1 }));
            });

            return 2; // sid
          }
        },

        unsubscribe(sid) {
          assert(sid === 1 || sid === 2);
        }
      };

      const provider = new Provider({
        schema: goodSchema,

        transport
      });

      provider[once ? onceFn : onFn](eventName, listener);

      if (eventName !== 'create' && eventName !== 'update') {
        equals(provider._listeners.create.get(listener), null);
        equals(provider._listeners.update.get(listener), null);

        done();
      }
    }

    function testOn(fns) {
      it('should add listener', done => {
        testOnEvent(fns, 'misc', false, false, done);
      });

      it('should add create listener and handle query', done => {
        testOnEvent(fns, 'create', false, false, done);
      });

      it('should add update listener and handle query', done => {
        testOnEvent(fns, 'update', false, false, done);
      });

      it('should add create listener and handle error', done => {
        testOnEvent(fns, 'create', false, true, done);
      });

      it('should add update listener and handle error', done => {
        testOnEvent(fns, 'update', false, true, done);
      });
    }

    function testOnce(fns) {
      it('should add listener', done => {
        testOnEvent(fns, 'misc', true, false, done);
      });

      it('should add create listener and handle query', done => {
        testOnEvent(fns, 'create', true, false, done);
      });

      it('should add update listener and handle query', done => {
        testOnEvent(fns, 'update', true, false, done);
      });

      it('should add create listener and handle error', done => {
        testOnEvent(fns, 'create', true, true, done);
      });

      it('should add update listener and handle error', done => {
        testOnEvent(fns, 'update', true, true, done);
      });
    }

    const onFns = {
      onceFn: 'once',
      onFn:   'on'
    };

    const prependFns = {
      onceFn: 'prependOnceListener',
      onFn:   'prependListener'
    };

    describe('on', () => testOn(onFns));

    describe('once', () => testOnce(onFns));

    describe('prependListener', () => testOn(prependFns));

    describe('prependOnceListener', () => testOnce(prependFns));

    describe('removeAllListeners', () => {
      it('should remove all listeners', () => {
        let sc = 1;
        let uc = 1;

        const provider = new Provider({
          schema:    goodSchema,
          transport: {
            request() {
            },
            subscribe() {
              return sc++;
            },
            unsubscribe(sid) {
              strictEqual(sid, uc++);
            }
          }
        });

        provider.on('misc',   F);
        provider.on('create', F);
        provider.on('update', F);
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), 2);

        provider.removeAllListeners();
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), null);
      });

      it('should remove misc listener', () => {
        let sc = 1;
        let uc = 1;

        const provider = new Provider({
          schema:    goodSchema,
          transport: {
            request() {
            },
            subscribe() {
              return sc++;
            },
            unsubscribe(sid) {
              strictEqual(sid, uc++);
            }
          }
        });

        provider.on('misc',   F);
        provider.on('create', F);
        provider.on('update', F);
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), 2);

        provider.removeAllListeners('misc');
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), 2);
      });

      it('should remove create listener', () => {
        let sc = 1;
        let uc = 1;

        const provider = new Provider({
          schema:    goodSchema,
          transport: {
            request() {
            },
            subscribe() {
              return sc++;
            },
            unsubscribe(sid) {
              strictEqual(sid, uc++);
            }
          }
        });

        provider.on('misc',   F);
        provider.on('create', F);
        provider.on('update', F);
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), 2);

        provider.removeAllListeners('create');
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), 2);
      });

      it('should remove update listener', () => {
        let sc = 1;
        let uc = 3;

        const provider = new Provider({
          schema:    goodSchema,
          transport: {
            request() {
            },
            subscribe() {
              return sc++;
            },
            unsubscribe(sid) {
              strictEqual(sid, uc++);
            }
          }
        });

        provider.on('misc',   F);
        provider.on('create', F);
        provider.on('update', F);
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), 2);

        provider.removeAllListeners('update');
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), null);
      });
    });

    describe('removeListener', () => {
      it('should remove listener', () => {
        const provider = new Provider({
          schema:    goodSchema,
          transport: goodTransport
        });

        provider.on('misc', F);
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), null);

        provider.removeListener('misc', F);
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), null);
      });

      it('should remove create listener', () => {
        const provider = new Provider({
          schema:    goodSchema,
          transport: {
            request() {
            },
            subscribe() {
              return 1;
            },
            unsubscribe(sid) {
              strictEqual(sid, 1);
            }
          }
        });

        provider.on('create', F);
        equals(provider._listeners.create.get(F), 1);
        equals(provider._listeners.update.get(F), null);

        provider.removeListener('create', F);
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), null);
      });

      it('should remove update listener', () => {
        const provider = new Provider({
          schema:    goodSchema,
          transport: {
            request() {
            },
            subscribe() {
              return 1;
            },
            unsubscribe(sid) {
              strictEqual(sid, 1);
            }
          }
        });

        provider.on('update', F);
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), 1);

        provider.removeListener('update', F);
        equals(provider._listeners.create.get(F), null);
        equals(provider._listeners.update.get(F), null);
      });
    });
  });

  describe('Readable', () => {
    describe('_read', () => {
      it('should work', done => {
        const msg = {
          object: { a: 1 }
        };

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            request() {},

            subscribe(sub, subListener) {
              if (sub === subjects['create'][0])
                return 1; // sid
              else if (sub === subjects['create'][1]) {
                setImmediate(() => subListener(JSON.stringify(msg)));

                return 2; // sid
              }
            },

            unsubscribe() {}
          }
        });

        const testStream = new Writable({
          objectMode: true,

          write(chunk /*, encoding, callback */) {
            deepStrictEqual(chunk, msg.object);

            done();
          }
        });

        provider.pipe(testStream);
      });

      it('should emit error on error', done => {
        const provider = new Provider({
          schema: goodSchema,

          transport: {
            request() {},

            subscribe(sub /*, subListener */) {
              if (sub === subjects['create'][0])
                return 1; // sid
              else if (sub === subjects['create'][1]) {
                setImmediate(() => provider.emit('create', new Error()));

                return 2; // sid
              }
            },

            unsubscribe() {}
          }
        });

        const testStream = new Writable({
          objectMode: true,

          write() {}
        });

        provider.on('error', err => {
          assert(err instanceof Error);

          done();
        });

        provider.pipe(testStream);
      });

      it('should emit error without object', done => {
        const msg = {};

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            request() {},

            subscribe(sub, subListener) {
              if (sub === subjects['create'][0])
                return 1; // sid
              else if (sub === subjects['create'][1]) {
                setImmediate(() => subListener(JSON.stringify(msg)));

                return 2; // sid
              }
            },

            unsubscribe() {}
          }
        });

        const testStream = new Writable({
          objectMode: true,

          write(_0, _1, callback) {
            callback(null);
          }
        });

        provider.on('error', err => {
          assert(err instanceof ProviderError);

          done();
        });

        provider.pipe(testStream);
      });
    });
  });

  describe('Writable', () => {
    describe('_write', () => {
      it('should work', done => {
        const object     = { a:  1 };
        const projection = { id: 1 };

        function request(sub, msg, options, next) {
          strictEqual(sub, subjects.create[0]);
          strictEqual(msg, JSON.stringify({ object, projection }));
          deepStrictEqual(options, { max: 1 });

          next(JSON.stringify({
            result: merge(object, { _id: 1 })
          }));

          return done();
        }

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            request,

            subscribe() {},
            unsubscribe() {}
          }
        });

        let pushed = false;

        const readStream = new Readable({
          objectMode: true,

          read() {
            if (pushed)
              return this.emit('close');

            pushed = true;

            setImmediate(() => this.push(object));
          }
        });

        readStream.pipe(provider);
      });
    });

    describe('_writev', () => {
      it('should work', done => {
        const objects = [];

        for (let i = 0; i < 20; ++i)
          objects.push({ a: i });

        let x = 0;

        function request(sub, msg, options, next) {
          strictEqual(sub, subjects.create[0]);
          deepStrictEqual(options, { max: 1 });

          strictEqual(msg, JSON.stringify({
            object: objects[x],

            projection: { id: 1 }
          }));

          next(JSON.stringify({
            result: merge(objects[x], { _id: 1 })
          }));

          if (++x === objects.length)
            return done();
        }

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            request,

            subscribe() {},
            unsubscribe() {}
          }
        });

        let pushed = false;

        const readStream = new Readable({
          objectMode: true,

          read() {
            if (pushed)
              return this.emit('close');

            pushed = true;

            setImmediate(() => objects.map(this.push.bind(this)));
          }
        });

        readStream.pipe(provider);
      });
    });
  });
});
