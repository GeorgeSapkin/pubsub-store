'use strict';

const cors           = require('cors');
const express        = require('express');
const expressGraphql = require('express-graphql');
const nats           = require('nats');
const enableDestroy  = require('server-destroy');


const {
    Provider
} = require('../../');

const {
    User
} = require('../schema/user');

const {
    getSchema
} = require('./getschema');

const logger = console;

const SIGINT  = 'SIGINT';
const SIGTERM = 'SIGTERM';

const CONNECT   = 'connect';
const ERROR     = 'error';
const RECONNECT = 'reconnect';

const API_PORT = 3000;

function onTransportConnected(app, transport) {
    logger.log('Connected to broker');

    process.on(SIGINT,  () => transport.close());
    process.on(SIGTERM, () => transport.close());

    const userProvider = new Provider({
        schema: User,

        transport,

        options: {
            timeout: 5000
        }
    });

    /*
      Create and update events come from the bus, so not necessarily current
      provider.
    */
    userProvider.on('create', (err, query) => logger.log(
        'Create event', err ? '(error)' : '', query)
    );
    userProvider.on('update', (err, query) => logger.log(
        'Update event', err ? '(error)' : '', query)
    );

    app.use(
        '/',
        expressGraphql({
            schema:   getSchema({}, User, userProvider),
            graphiql: true
        })
    );

    const server = app.listen(API_PORT, () => {
        logger.log(`Listening on http://localhost:${API_PORT}`);

        enableDestroy(server);

        process.once(SIGINT,  () => server.destroy());
        process.once(SIGTERM, () => server.destroy());
    });
}

{
    const app = express();

    app.use(cors());

    const transport = nats.connect();

    transport.on(ERROR,     logger.error);
    transport.on(RECONNECT, () => logger.log('Transport reconnected'));
    transport.on(CONNECT,   () => onTransportConnected(app, transport));
}
