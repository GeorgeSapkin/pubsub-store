'use strict';

const {
  equals,
  F,
  merge
} = require('ramda');

const {
  stub
} = require('sinon');

const {
  Readable,
  Writable
} = require('stream');

const {
  Provider
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

const $or = [
  { metadata:           { $eq:     null  } },
  { 'metadata.deleted': { $eq:     null  } },
  { 'metadata.deleted': { $exists: false } }
];

const $currentDate = {
  'metadata.deleted': true,
  'metadata.updated': true
};

const execRejects = rejects(exec);

describe('batchExec', () => {
  describe('should resolve', () => {
    it('with no elements', () => {
      const result = [];
      const exec   = stub().withArgs({
        limit: 2,
        skip:  0
      }).resolves(result);

      return batchExec(exec, 2, { limit: 5 }).then(res => {
        expect(res).toMatchObject(result);
        expect(exec.calledOnce).toBeTruthy();
      });
    });

    it('with less elements', () => {
      const result = [{
        b: 3
      }, {
        c: 5
      }, {
        d: 7
      }];

      const exec = stub();

      exec.withArgs({
        limit: 2,
        skip:  0
      }).resolves(result.slice(0, 2));

      exec.withArgs({
        limit: 2,
        skip:  2
      }).resolves(result.slice(2));

      return batchExec(exec, 2, { limit: 5 }).then(res => {
        expect(res).toMatchObject(result);
        expect(exec.calledTwice).toBeTruthy();
      });
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

      const exec = stub();

      exec.withArgs({
        limit: 2,
        skip:  0
      }).resolves(result.slice(0, 2));

      exec.withArgs({
        limit: 1,
        skip:  2
      }).resolves(result.slice(2, 3));

      return batchExec(exec, 2, { limit: 3 }).then(res => {
        expect(res).toMatchObject(result.slice(0, 3));
        expect(exec.calledTwice).toBeTruthy();
      });
    });
  });
});

describe('exec', () => {
  describe('should resolve', () => {
    it('an object', () => {
      const query  = { a: 1 };
      const result = { b: 1 };

      const request = stub()
        .withArgs(JSON.stringify(query))
        .callsArgWithAsync(2, JSON.stringify({ result }));

      return exec(request, 20, query).then(res => {
        expect(res).toMatchObject(result);

        expect(request.calledOnce).toBeTruthy();
      });
    });

    it('an array', () => {
      const query  = { a: 1 };
      const result = [{ b: 1 }];

      const request = stub()
        .withArgs(JSON.stringify(query))
        .callsArgWithAsync(2, JSON.stringify({ result }));

      return exec(request, 20, query).then(res => {
        expect(res).toMatchObject(result);

        expect(request.calledOnce).toBeTruthy();
      });
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

      expect(provider._schema).toMatchObject(schema);
      expect(provider._transport).toMatchObject(goodTransport);

      expect(provider._subscribe).toBeInstanceOf(Function);
      expect(provider._unsubscribe).toBeInstanceOf(Function);

      expect(provider._subjects).toMatchObject(getSubjects(schema.name));

      expect(provider._count).toBeInstanceOf(Function);
      expect(provider._create).toBeInstanceOf(Function);
      expect(provider._find).toBeInstanceOf(Function);
      expect(provider._update).toBeInstanceOf(Function);

      expect(provider._listeners).toBeDefined();
      expect(provider._listeners.create).toBeInstanceOf(Map);
      expect(provider._listeners.update).toBeInstanceOf(Map);

      expect(provider._mergeConditions).toBeInstanceOf(Function);

      expect(provider._hasMetadata).toBe(hasMetadata);

      if (hasMetadata)
        expect(provider._defaultConditions).toMatchObject({ $or });
      else
        expect(provider._defaultConditions).toMatchObject({});
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

    it('should throw without any args',
      () => expect(() => new Provider()).toThrow()
    );

    it('should throw without transport', () => expect(() => new Provider({
      schema: goodSchema
    })).toThrow());
  });

  describe('count', () => {
    it('should resolve', () => {
      const conditions = { b: 2 };
      const result     = 7;

      const request = stub().withArgs(
        subjects.count[0],
        JSON.stringify({ conditions }),
        { max: 1 }
      ).callsArgWithAsync(
        3,
        JSON.stringify({ result })
      );

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).count(conditions).then(res => {
        expect(res).toBe(result);
        expect(request.calledOnce).toBeTruthy();
      });
    });

    const goodRejects = rejects(goodProvider.count.bind(goodProvider));

    it('should reject when conditions is not set', goodRejects(null));
  });

  describe('countAll', () => {
    it('should resolve', () => {
      const result  = 7;
      const request = stub().withArgs(
        subjects.count[0],
        JSON.stringify({ conditions: {} }),
        { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result }));

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).countAll().then(res => {
        expect(res).toBe(result);
        expect(request.calledOnce).toBeTruthy();
      });
    });

    const goodRejects = rejects(goodProvider.count.bind(goodProvider));

    it('should reject when conditions is not set', goodRejects(null));
  });

  describe('create', () => {
    it('should resolve an object', () => {
      const object     = { a: 1 };
      const projection = { b: 1 };

      const request = stub().withArgs(
        subjects.create[0],
        JSON.stringify({ object, projection }),
        { max: 1 }
      ).callsArgWithAsync(
        3,
        JSON.stringify({ result: merge(object, { _id: 1 }) })
      );

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).create(object, projection).then(res => {
        expect(res).toMatchObject(merge(object, { _id: 1 }));
        expect(request.calledOnce).toBeTruthy();
      });
    });

    const goodRejects = rejects(goodProvider.create.bind(goodProvider));

    it('should reject when object is not set', goodRejects(null, null));

    it('should reject when projection is not set', goodRejects({}, null));
  });

  describe('delete', () => {
    it('should resolve an object', () => {
      const conditions = { a: 1 };
      const projection = { b: 1 };

      const request = stub();

      request.withArgs(subjects.find[0])
        .callsArgWithAsync(3, JSON.stringify({ result: [{ _id: 1 }] }));

      request.withArgs(
        subjects.update[0],
        JSON.stringify({
          conditions: {
            $or,
            a: 1
          },
          object: { $currentDate },
          projection
        }, { max: 1 })
      ).callsArgWithAsync(3, JSON.stringify({ result: [{ c: 1 }] }));

      return new Provider({
        schema:    goodSchemaWithMetadata,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).delete(conditions, projection).then(res => {
        expect(res).toMatchObject([{ _id: 1 }]);
        expect(request.calledTwice).toBeTruthy();
      });
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

      const request = stub();

      request.withArgs(subjects.find[0])
        .callsArgWithAsync(3, JSON.stringify({ result: [result] }));

      request.withArgs(
        subjects.update[0],
        JSON.stringify({
          conditions: {
            $or,
            _id: 1
          },
          object: { $currentDate },
          projection
        }, { max: 1 })
      ).callsArgWithAsync(3, JSON.stringify({ result: { c: 1 } }));

      return new Provider({
        schema:    goodSchemaWithMetadata,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).deleteById(1, projection).then(res => {
        expect(res).toMatchObject(result);
        expect(request.calledTwice).toBeTruthy();
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

      const request = stub().withArgs(
        subjects.find[0],
        JSON.stringify({
          conditions,
          options: {
            limit: 5000,
            skip:  0
          },
          projection
        }),
        { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result }));

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).find(conditions, projection).then(res => {
        expect(res).toMatchObject(result);
        expect(request.calledOnce).toBeTruthy();
      });
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

      const request = stub().withArgs(
        subjects.find[0],
        JSON.stringify({
          conditions,
          options: {
            limit: 5000,
            skip:  0
          },
          projection
        }),
        { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result }));

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).findAll(projection).then(res => {
        expect(res).toMatchObject(result);
        expect(request.calledOnce).toBeTruthy();
      });
    });

    const goodRejects = rejects(goodProvider.findAll.bind(goodProvider));

    it('should reject when projection is not set', goodRejects(null));
  });

  describe('findById', () => {
    it('should resolve single entity', () => {
      const conditions = { _id: 1 };
      const projection = { a: 1 };
      const result     = { c: 3 };

      const request = stub().withArgs(
        subjects.find[0],
        JSON.stringify({
          conditions,
          projection,
          options: { limit: 1 }
        }),
        { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result: [result] }));

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).findById(1, projection).then(res => {
        expect(res).toMatchObject(result);
        expect(request.calledOnce).toBeTruthy();
      });
    });

    it('should resolve nothing when more than one', () => {
      const conditions = { _id: 1 };
      const projection = { a: 1 };
      const result     = [{ c: 3 }, { c: 4 }];

      const request = stub().withArgs(
        subjects.find[0],
        JSON.stringify({
          conditions,
          projection,
          options: { limit: 1 }
        }),
        { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result }));

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).findById(1, projection).then(res => {
        expect(res).toBeNull();
        expect(request.calledOnce).toBeTruthy();
      });
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

      const request = stub();

      request.withArgs(subjects.find[0])
        .callsArgWithAsync(3, JSON.stringify({ result: [resultFind] }));

      request.withArgs(
        subjects.update[0],
        JSON.stringify({
          conditions: { _id: 1 },
          object:     { a:   1 },
          projection
        }), { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result: resultUpdate }));

      return new Provider({
        schema:    goodSchema,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).updateById(1, object, projection).then(res => {
        expect(res).toMatchObject(resultFind);
        expect(request.calledTwice).toBeTruthy();
      });
    });

    it('should resolve an object and update metadata', () => {
      const object       = { a: 1 };
      const projection   = { b: 1 };
      const resultFind   = { _id: 1 };
      const resultUpdate = { c: 1 };

      const request = stub();

      request.withArgs(subjects.find[0])
        .callsArgWithAsync(3, JSON.stringify({ result: [resultFind] }));

      request.withArgs(
        subjects.update[0],
        JSON.stringify({
          conditions: { $or, _id: 1 },
          object: {
            a: 1,

            $currentDate: {
              'metadata.updated': true
            }
          },
          projection
        }), { max: 1 }
      ).callsArgWithAsync(3, JSON.stringify({ result: resultUpdate }));

      return new Provider({
        schema:    goodSchemaWithMetadata,
        transport: {
          request,

          subscribe()   {},
          unsubscribe() {}
        }
      }).updateById(1, object, projection).then(res => {
        expect(res).toMatchObject(resultFind);
        expect(request.calledTwice).toBeTruthy();
      });
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
          expect(err).toBeInstanceOf(Error);
          expect(query).toBeUndefined();
        }
        else {
          expect(err).toBeNull();
          expect(query).toMatchObject({ a: 1 });
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
              expect(
                provider._listeners[eventName].get(listener)
              ).toMatchObject([1, 2]);

              if (error)
                subListener('{');
              else
                subListener(JSON.stringify({ a: 1 }));
            });

            return 2; // sid
          }
        },

        unsubscribe(sid) {
          expect(sid === 1 || sid === 2).toBeTruthy();
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
              expect(sid).toBe(uc++);
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
              expect(sid).toBe(uc++);
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
              expect(sid).toBe(uc++);
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
              expect(sid).toBe(uc++);
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
              expect(sid).toBe(1);
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
              expect(sid).toBe(1);
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

        const subscribe = stub()
          .withArgs(subjects['create'][0])
          .returns(1)
          .withArgs(subjects['create'][1])
          .callsArgWithAsync(1, JSON.stringify(msg))
          .returns(2);

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            subscribe,

            request()     {},
            unsubscribe() {}
          }
        });

        const testStream = new Writable({
          objectMode: true,

          // NB: Don't pass arguments to `done`
          write: stub().withArgs(msg.object).callsFake(() => done())
        });

        provider.pipe(testStream);
      });

      it('should emit error on error', done => {
        const subscribe = stub()
          .withArgs(subjects['create'][0])
          .returns(1)
          .withArgs(subjects['create'][1])
          .callsArgWithAsync(1, new Error())
          .returns(2);

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            subscribe,

            request()     {},
            unsubscribe() {}
          }
        });

        const testStream = new Writable({
          objectMode: true,

          write() {}
        });

        provider.on('stream-error', err => {
          expect(err).toBeInstanceOf(Error);
          done();
        });

        provider.pipe(testStream);
      });

      it('should emit error without object', done => {
        const msg = {};

        const subscribe = stub()
          .withArgs(subjects['create'][0])
          .returns(1)
          .withArgs(subjects['create'][1])
          .callsArgWithAsync(1, JSON.stringify(msg))
          .returns(2);

        const provider = new Provider({
          schema: goodSchema,

          transport: {
            subscribe,

            request()     {},
            unsubscribe() {}
          }
        });

        const write = stub().callsArgAsync(2);

        const testStream = new Writable({
          objectMode: true,
          write
        });

        provider.on('stream-error', err => {
          expect(err).toBeInstanceOf(Error);

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

        const request = stub().withArgs(
          subjects.create[0],
          JSON.stringify({ object, projection }),
          { max: 1 }
        ).callsArgWithAsync(3, JSON.stringify({
          result: merge(object, { _id: 1 })
        // NB: Don't pass arguments to `done`
        })).callsFake(() => done());

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

        // TODO: test multiple errors

        readStream.pipe(provider);
      });
    });

    describe('_writev', () => {
      function test(gen, done) {
        let dataEmitted   = 0;
        let errorsEmitted = 0;

        function request(sub, msg, options, next) {
          expect(sub).toBe(subjects.create[0]);
          expect(options).toMatchObject({ max: 1 });

          const parsed = JSON.parse(msg);

          if (parsed.object.a != null) {
            ++dataEmitted;

            process.nextTick(() => next(JSON.stringify({
              _id:    1,
              result: parsed.obj
            })));

            if (dataEmitted === 4 && errorsEmitted === 2)
              done();
          }
          else
            process.nextTick(() => next(JSON.stringify({
              error: {
                message: 'Not OK'
              }
            })));
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

            setImmediate(() => {
              for (const res of gen())
                this.push(res);
            });
          }
        });

        provider.on('stream-error', () => {
          ++errorsEmitted;

          if (dataEmitted === 4 && errorsEmitted === 2)
            done();
        });

        readStream.pipe(provider);
      }

      it('should work with some errors', done => {
        test(function* objGen() {
          yield { a:   0 };
          yield { a:   1 };
          yield { err: 0 };
          yield { a:   2 };
          yield { err: 1 };
          yield { a:   3 };
        }, done);
      });

      it('should work with first errors', done => {
        test(function* objGen() {
          yield { err: 10 };
          yield { a:   10 };
          yield { a:   11 };
          yield { err: 11 };
          yield { a:   12 };
          yield { a:   13 };
        }, done);
      });

      it('should work with last errors', done => {
        test(function* objGen() {
          yield { a:   20 };
          yield { err: 20 };
          yield { a:   21 };
          yield { a:   22 };
          yield { a:   23 };
          yield { err: 21 };
        }, done);
      });
    });
  });
});
