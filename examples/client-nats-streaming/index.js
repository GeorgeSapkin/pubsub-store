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

const MAX_USERS   = 100000;
const TIMER_LABEL = `Pushed and received ${MAX_USERS} users in`;

function onTransportConnected(transport) {
  logger.log('Connected to broker');

  process.on('SIGINT',  () => transport.close());
  process.on('SIGTERM', () => transport.close());

  const userProviderA = new Provider({
    schema: User,

    transport,

    options: {
      // Set higher highWaterMark to speed up streaming
      highWaterMark: 1000,
      // Do not acknowledge create messages to speed up streaming
      noAckStream: true,
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

  // Generates MAX_USERS users
  const userGenerator = (function* () {
    for (let x = 0; x < MAX_USERS; ++x)
      yield { name: faker.name.findName() };
  })();

  let receivedUsers = 0;

  logger.time(TIMER_LABEL);

  const inputStream = new Readable({
    objectMode: true,
    highWaterMark: 1000,

    read() {
      const result = userGenerator.next();
      if (result.done)
        return;

      this.push(result.value);
    }
  });

  const outputStream = new Writable({
    objectMode: true,
    highWaterMark: 1000,

    write(_0, _1, callback) {
      receivedUsers++;

      // Close the stream when there are no more users to pipe
      if (receivedUsers === MAX_USERS) {
        logger.timeEnd(TIMER_LABEL);
        inputStream.emit('close');
      }

      callback();
    }
  });

  // Provider B pipes created entities from the bus into output stream
  userProviderB.pipe(outputStream);

  // Close transport once the input stream is closed
  inputStream.on('close', () => setTimeout(() => {
    transport.close();
  }, 10));

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
