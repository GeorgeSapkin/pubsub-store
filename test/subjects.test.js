'use strict';

const {
  deepStrictEqual
} = require('assert');

const {
  getSubjects
} = require('../');

describe('getSubjects', () => {
  it('should work with default args', () => {
    const subjects = getSubjects('schema');

    deepStrictEqual(subjects, {
      count:  ['count.schema',  'count.schema.>'],
      create: ['create.schema', 'create.schema.>'],
      find:   ['find.schema',   'find.schema.>'],
      update: ['update.schema', 'update.schema.>']
    });
  });

  it('should work with custom prefixes', () => {
    const subjects = getSubjects('schema', {
      prefixes: {
        count : 'a',
        create: 'b',
        find:   'c',
        update: 'd'
      }
    });

    deepStrictEqual(subjects, {
      count:  ['a.schema', 'a.schema.>'],
      create: ['b.schema', 'b.schema.>'],
      find:   ['c.schema', 'c.schema.>'],
      update: ['d.schema', 'd.schema.>']
    });
  });

  it('should work with custom suffix', () => {
    const subjects = getSubjects('schema', { suffix: 'customer' });

    deepStrictEqual(subjects, {
      count:  ['count.schema.customer',  'count.schema.customer.>'],
      create: ['create.schema.customer', 'create.schema.customer.>'],
      find:   ['find.schema.customer',   'find.schema.customer.>'],
      update: ['update.schema.customer', 'update.schema.customer.>']
    });
  });

  it('should work with custom prefixes and a suffix', () => {
    const subjects = getSubjects('schema', {
      prefixes: {
        count:  'c',
        create: 'd',
        find:   'e',
        update: 'f'
      },
      suffix: 'device-type'
    });

    deepStrictEqual(subjects, {
      count:  ['c.schema.device-type', 'c.schema.device-type.>'],
      create: ['d.schema.device-type', 'd.schema.device-type.>'],
      find:   ['e.schema.device-type', 'e.schema.device-type.>'],
      update: ['f.schema.device-type', 'f.schema.device-type.>']
    });
  });
});
