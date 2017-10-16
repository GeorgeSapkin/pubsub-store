'use strict';

const faker = require('faker');
const nats  = require('nats');

const {
  Provider
} = require('../../');

const {
  User
} = require('../schema/user');

const logger = console;

const SIGINT  = 'SIGINT';
const SIGTERM = 'SIGTERM';

const CONNECT   = 'connect';
const ERROR     = 'error';
const RECONNECT = 'reconnect';

async function onTransportConnected(transport) {
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

  // Create and update events come from the bus, so not necessarily current
  // provider.
  userProvider.on('create', (err, query) => logger.log(
    'Create event', err ? '(error)' : '', query)
  );
  userProvider.on('update', (err, query) => logger.log(
    'Update event', err ? '(error)' : '', query)
  );

  const projection = {
    _id:      1,
    name:     1,
    metadata: 1
  };

  const name = faker.name.findName();

  const createdUser = await userProvider.create({ name }, projection);
  logger.log('Created user', createdUser);

  const usersAfterCreate = await userProvider.findAll(projection);
  logger.log('All users after create', usersAfterCreate);

  const newName = faker.name.findName();

  const updatedUser = await userProvider.updateById(
    createdUser._id, { $set: { name: newName } }, projection);
  logger.log('Updated user', updatedUser);

  const count = await userProvider.countAll();
  logger.log('Number of users', count);

  const deletedUser = await userProvider.deleteById(
    createdUser._id, projection);
  logger.log('Deleted user', deletedUser);

  const usersAfterDelete = await userProvider.findAll(projection);
  logger.log('All users after delete', usersAfterDelete);

  transport.close();
}

{
  const transport = nats.connect();

  transport.on(ERROR,     logger.error);
  transport.on(RECONNECT, () => logger.log('Transport reconnected'));
  transport.on(CONNECT,   () => onTransportConnected(transport));
}
