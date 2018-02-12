'use strict';

const graphql = require('graphql');

const {
  buildFields,
  buildTypes,
  getProjection
} = require('graphql-schema-builder')(graphql);

const {
  assoc,
  converge,
  dissoc,
  identity,
  map,
  pipe,
  prop
} = require('ramda');

const {
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} = graphql;

const renameId = pipe(
  converge(assoc('id'), [prop('_id'), identity]),
  dissoc('_id')
);

function getSchema(resolvers, User, userProvider) {
  const types = buildTypes({ User }, resolvers);

  const schemaStore = new Map();

  function buildSubType({ name, fields }) {
    const _name = `${name}Input`;
    const newType = new GraphQLInputObjectType({ name: _name, fields });
    schemaStore.set(_name, newType);
    return newType;
  }

  function getExistingType(name) {
    return schemaStore.get(`${name}Input`);
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'RootQueryType',
      fields: {
        user: {
          type: types.User,
          args: {
            id: {
              name: 'id',
              type: new GraphQLNonNull(GraphQLID)
            }
          },

          resolve(_0, { id }, _1, info) {
            const projection = getProjection(info);
            return userProvider.findById(id, projection)
              .then(renameId);
          }
        },
        users: {
          type: new GraphQLList(types.User),

          resolve(_0, {}, _1, info) {
            const projection = getProjection(info);
            return userProvider.findAll(projection)
              .then(map(renameId));
          }
        }
      }
    }),

    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        createUser: {
          type: types.User,
          args: buildFields(User.fields, {
            buildSubType,
            getExistingType
          }),

          resolve(_0, { name, age }, _1, info) {
            const projection = getProjection(info);
            return userProvider.create({ name, age }, projection)
              .then(renameId);
          }
        },

        deleteUser: {
          type: types.User,
          args: {
            id: {
              name: 'id',
              type: new GraphQLNonNull(GraphQLString)
            }
          },

          resolve(_0, { id }, _1, info) {
            const projection = getProjection(info);
            return userProvider.deleteById(id, projection)
              .then(renameId);
          }
        },

        updateUser: {
          type: types.User,
          args: Object.assign(buildFields(User.fields, {
            buildSubType,
            getExistingType
          }), {
            id: {
              name: 'id',
              type: new GraphQLNonNull(GraphQLString)
            }
          }),

          resolve(_0, { id, name, age }, _1, info) {
            const projection = getProjection(info);
            return userProvider.updateById(id, {
              $set: { name, age }
            }, projection).then(renameId);
          }
        }
      }
    })
  });
}

module.exports = {
  getSchema
};
