# Pub/Sub Store NATS + GraphQL client example `client-nats`

Provider usage example with GraphQL/GraphiQL server using [graphql-schema-builder][graphql-schema-builder] and [express-graphql][express-graphql].

Exposes GraphiQL interface on [localhost:3000](http://localhost:3000).

Assumes NATS instance is exposed on `localhost:4222` without any security and `server-nats-mongo` example is connected to the bus.

More about [GraphQL](https://github.com/facebook/graphql).

[express-graphql]: https://github.com/graphql/express-graphql
[graphql-schema-builder]: https://github.com/GeorgeSapkin/graphql-schema-builder
