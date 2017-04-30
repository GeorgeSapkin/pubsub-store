'use strict';

const {
    deepStrictEqual
} = require('assert');

const {
    getSubjects
} = require('../src/subjects');

describe('getSubjects', () => {
    it('should work with default args', () => {
        const subjects = getSubjects('schema');

        deepStrictEqual(subjects, {
            create: ['create.schema', 'create.schema.>'],
            find:   ['find.schema'],
            update: ['update.schema', 'update.schema.>']
        });
    });

    it('should work with custom prefixes', () => {
        const subjects = getSubjects('schema', {
            prefixes: {
                create: 'a',
                find:   'b',
                update: 'c'
            }
        });

        deepStrictEqual(subjects, {
            create: ['a.schema', 'a.schema.>'],
            find:   ['b.schema'],
            update: ['c.schema', 'c.schema.>']
        });
    });

    it('should work with custom suffix', () => {
        const subjects = getSubjects('schema', { suffix: 'customer' });

        deepStrictEqual(subjects, {
            create: ['create.schema.customer', 'create.schema.customer.>'],
            find:   ['find.schema.customer'],
            update: ['update.schema.customer', 'update.schema.customer.>']
        });
    });

    it('should work with custom prefixes and a suffix', () => {
        const subjects = getSubjects('schema', {
            prefixes: {
                create: 'd',
                find:   'e',
                update: 'f'
            },
            suffix: 'device-type'
        });

        deepStrictEqual(subjects, {
            create: ['d.schema.device-type', 'd.schema.device-type.>'],
            find:   ['e.schema.device-type'],
            update: ['f.schema.device-type', 'f.schema.device-type.>']
        });
    });
});
