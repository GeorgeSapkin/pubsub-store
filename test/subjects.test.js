'use strict';

const {
  getSubjects
} = require('../');

describe('getSubjects', () => {
  it('should work with default args', () => {
    const subjects = getSubjects('schema');

    expect(subjects).toMatchObject({
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

    expect(subjects).toMatchObject({
      count:  ['a.schema', 'a.schema.>'],
      create: ['b.schema', 'b.schema.>'],
      find:   ['c.schema', 'c.schema.>'],
      update: ['d.schema', 'd.schema.>']
    });
  });

  it('should work with custom suffix', () => {
    const subjects = getSubjects('schema', { suffix: 'customer' });

    expect(subjects).toMatchObject({
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

    expect(subjects).toMatchObject({
      count:  ['c.schema.device-type', 'c.schema.device-type.>'],
      create: ['d.schema.device-type', 'd.schema.device-type.>'],
      find:   ['e.schema.device-type', 'e.schema.device-type.>'],
      update: ['f.schema.device-type', 'f.schema.device-type.>']
    });
  });
});
