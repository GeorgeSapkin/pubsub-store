'use strict';

const Prefixes = {
    create: 'create',
    find:   'find',
    update: 'update'
};

function getSubjects(name, { prefixes = Prefixes, suffix = '' } = {}) {
    const _name = name.toLowerCase();

    const _suffix = (suffix != null && suffix !== '')
        ? `.${suffix}`
        : '';

    return {
        create: [
            `${prefixes.create}.${_name}${_suffix}`,
            `${prefixes.create}.${_name}${_suffix}.>`
        ],
        find: [
            `${prefixes.find}.${_name}${_suffix}`,
            `${prefixes.find}.${_name}${_suffix}.>`
        ],
        update: [
            `${prefixes.update}.${_name}${_suffix}`,
            `${prefixes.update}.${_name}${_suffix}.>`
        ]
    };
}

module.exports = {
    getSubjects,

    Prefixes
};
