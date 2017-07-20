'use strict';

const {
  ok: assert
} = require('assert');

const {
  is
} = require('ramda');

function assertSchema(schema) {
  assert(schema != null, 'schema must be set');
  assert(is(String, schema.name), 'Schema name must be as string');
  assert(schema.fields != null, 'Schema fields must be set');
}

module.exports = {
  assertSchema
};
