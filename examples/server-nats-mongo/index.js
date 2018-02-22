'use strict';

const mongoose = require('mongoose');
const nats     = require('nats');

const {
  equals,
  F,
  is,
  keys,
  nthArg,
  pickAll,
  pickBy,
  pipe
} = require('ramda');

const {
  Store
} = require('../../');

const {
  User
} = require('../schema/user');

const logger = console;

const DB = 'mongodb://localhost/example';

function buildModel(db, schema) {
  const model = db.model(schema.name, schema.fields);

  return {
    count(conditions) {
      return model.count(conditions);
    },

    create(obj, projection) {
      const project = pipe(
        pickBy(pipe(nthArg(0), equals(1))),
        keys,
        pickAll
      )(projection);

      if (is(Array, obj))
        // Insert many and apply projection to original data
        return model.collection.insertMany(obj).then(() => project(obj));
      else
        // Insert and apply projection to result
        return model.create(obj).then(project);
    },

    find(conditions, projection, options) {
      return model.find(conditions, projection, options);
    },

    update(conditions, object, projection) {
      return model.update(conditions, object, {
        select: projection
      });
    }
  };
}

function onTransportConnected(db, transport) {
  logger.info('Connected to broker');

  process.on('SIGINT',  () => transport.close());
  process.on('SIGTERM', () => transport.close());

  const userStore = new Store({
    schema:     User,
    buildModel: buildModel.bind(null, db),

    transport
  });

  userStore.open();
}

function onDbConnected(db) {
  logger.info('Connected to database:', DB);

  async function dbClose() {
    await db.dropDatabase();
    logger.info('Dropped database');

    // HACK: Cannot db.close() because DB is already destroyed
    process.exit();
  }

  process.once('SIGINT',  dbClose);
  process.once('SIGTERM', dbClose);

  const transport = nats.connect();

  transport.on('error',     logger.error);
  transport.on('reconnect', () => logger.info('Transport reconnected'));
  transport.on('connect',   () => onTransportConnected(db, transport));
}

{
  const db = mongoose.createConnection();

  db.on('error', logger.error);

  db.on('connected', () => onDbConnected(db));

  db.openUri(DB).catch(F);
}
