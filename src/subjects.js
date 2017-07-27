'use strict';

const Prefixes = {
  count:  'count',
  create: 'create',
  find:   'find',
  update: 'update'
};

function getSubjects(name, { prefixes = Prefixes, suffix = '' } = {}) {
  const _name = name.toLowerCase();

  const _suffix = (suffix != null && suffix !== '')
    ? `.${suffix}`
    : '';

  return Object.freeze({
    count: Object.freeze([
      `${prefixes.count}.${_name}${_suffix}`,
      `${prefixes.count}.${_name}${_suffix}.>`
    ]),
    create: Object.freeze([
      `${prefixes.create}.${_name}${_suffix}`,
      `${prefixes.create}.${_name}${_suffix}.>`
    ]),
    find: Object.freeze([
      `${prefixes.find}.${_name}${_suffix}`,
      `${prefixes.find}.${_name}${_suffix}.>`
    ]),
    update: Object.freeze([
      `${prefixes.update}.${_name}${_suffix}`,
      `${prefixes.update}.${_name}${_suffix}.>`
    ])
  });
}

module.exports = {
  getSubjects,

  Prefixes
};
