'use strict';

const User = {
    name: 'User',
    fields: {
        name: {
            type: String
        },

        age: {
            type:    Number,
            require: false
        },

        metadata: {
            created: {
                type:     Date,
                default:  Date.now,
                required: true,
                select:   false
            },

            updated: {
                type:     Date,
                default:  Date.now,
                required: true,
                select:   false
            },

            deleted: {
                type:     Date,
                required: false,
                select:   false
            }
        }
    }
};

module.exports = {
    User
};
