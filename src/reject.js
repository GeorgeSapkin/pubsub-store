'use strict';

const {
    bind,
    construct,
    pipe
} = require('ramda');

const reject = pipe(
    construct(Error),
    bind(Promise.reject, Promise)
);

module.exports = {
    reject
};
