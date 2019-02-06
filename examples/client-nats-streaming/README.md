# Pub/Sub Store NATS streaming client example `client-nats-streaming`

Provider usage example showing using streaming to create and receive created
entities over a message bus without message acknowledgement.

Assumes NATS instance is exposed on `localhost:4222` without any security.

If `server-nats-mongo` example is connected to the bus, entities will be stored
in the database.
