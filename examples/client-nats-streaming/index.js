'use strict';

const faker = require('faker');
const nats  = require('nats');

const {
  Readable,
  Writable
} = require('stream');

const {
  Provider
} = require('../../');

const {
  User
} = require('../schema/user');

const logger = console;

function onTransportConnected(transport) {
  logger.log('Connected to broker');

  process.on('SIGINT',  () => transport.close());
  process.on('SIGTERM', () => transport.close());

  const userProviderA = new Provider({
    schema: User,

    transport,

    options: {
      timeout: 5000
    }
  });

  const userProviderB = new Provider({
    schema: User,

    transport,

    options: {
      timeout: 5000
    }
  });

  // Generates 5 users
  const userGenerator = (function* () {
    yield { name: faker.name.findName() };
    yield { name: faker.name.findName() };
    yield { name: faker.name.findName() };
    yield { name: faker.name.findName() };
    yield { name: faker.name.findName() };
  })();

  const inputStream = new Readable({
    objectMode: true,

    read() {
      const result = userGenerator.next();

      // Close the stream when there are no more users to pipe
      if (result.done)
        return this.emit('close');

      logger.log('Piping user:', result.value);

      this.push(result.value);
    }
  });

  const outputStream = new Writable({
    objectMode: true,

    write(chunk, _, callback) {
      logger.log('Piped user:', chunk);

      callback(null);
    }
  });

  // Provider B pipes created entities from the bus into output stream
  userProviderB.pipe(outputStream);

  // Close transport once the input stream is closed
  inputStream.on('close', () => setTimeout(() => transport.close(), 100));

  // Entities are piped into provider A, that generate create events and
  // publishes them on to the bus
  inputStream.pipe(userProviderA);
}

{
  const transport = nats.connect();

  transport.on('error',     logger.error);
  transport.on('reconnect', () => logger.log('Transport reconnected'));
  transport.on('connect',   () => onTransportConnected(transport));
}
