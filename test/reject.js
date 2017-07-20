'use strict';

const {
  constructN,
  curryN,
  pipe
} = require('ramda');

function _rejects(f, ...args) {
  return done => {
    // NB: returning a promise will overspecify resolution in mocha
    f(...args).then(pipe(constructN(0, Error), done), () => done());
  };
}

function rejects(f) {
  return curryN(f.length + 1, _rejects)(f);
}

module.exports = {
  rejects
};
