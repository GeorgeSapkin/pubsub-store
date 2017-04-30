'use strict';

const mongoose = require('mongoose');
const nats     = require('nats');

const {
    F
} = require('ramda');

const {
    Store
} = require('../../');

const {
    User
} = require('../schema/user');

// override default Mongoose promises: http://mongoosejs.com/docs/promises.html
mongoose.Promise = global.Promise;

const logger = console;

const SIGINT  = 'SIGINT';
const SIGTERM = 'SIGTERM';

const CONNECT   = 'connect';
const CONNECTED = 'connected';
const ERROR     = 'error';
const RECONNECT = 'reconnect';

function onTransportConnected(db, transport) {
    logger.log('Connected to broker');

    process.on(SIGINT,  () => transport.close());
    process.on(SIGTERM, () => transport.close());

    function buildModel(schema) {
        return db.model(schema.name, schema.fields);
    }

    const userStore = new Store({
        schema: User,

        buildModel,
        transport
    });

    userStore.open();
}

function onDbConnected(db) {
    logger.log('Connected to database');

    process.on(SIGINT,  () => db.close());
    process.on(SIGTERM, () => db.close());

    const transport = nats.connect();

    transport.on(ERROR,     logger.error);
    transport.on(RECONNECT, () => logger.log('Transport reconnected'));
    transport.on(CONNECT,   () => onTransportConnected(db, transport));
}

{
    const db = mongoose.createConnection();

    db.on(ERROR, logger.error);

    db.on(CONNECTED, () => onDbConnected(db));

    db.open('mongodb://localhost/example').catch(F);
}
