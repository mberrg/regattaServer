import fastify from 'fastify';
import fastifystatic from 'fastify-static';
import fastifysocket from 'fastify-websocket';
import fastifycors from 'fastify-cors';
import fastifycompress from 'fastify-compress';
import fastifycache from 'fastify-caching';
import fastifyhelmet from 'fastify-helmet';
import fastifyetag from 'fastify-etag';
import redis from 'redis';

import { Server, IncomingMessage, ServerResponse } from 'http';
import { resolve } from 'path';
import WebSocket from 'ws';

interface CounterState {
  serverNow: number;
  startTimeMs: number;
  delayMinutesBetweenHeats: number;
  numHeats: number;
  started: boolean;
}

let counterState: CounterState = {
  serverNow: Date.now(),
  startTimeMs: new Date(0).valueOf(),
  delayMinutesBetweenHeats: 5,
  numHeats: 3,
  started: false,
};

let client: undefined | redis.RedisClient;

if (process.env.REDISCLOUD_URL) {
  console.log(process.env.REDISCLOUD_URL);

  try {
    client = redis.createClient(process.env.REDISCLOUD_URL, {
      // eslint-disable-next-line @typescript-eslint/camelcase
      no_ready_check: true,
    });
    client.get('counterState', (err, reply) => {
      if (reply) counterState = JSON.parse(reply) as CounterState;
    });
  } catch (err) {
    console.error(err);
  }
} else {
  console.log('Did not find a REDIS token');
}
const SECRET = process.env.ADMIN_PASSWORD as string;

// Create a http server. We pass the relevant typings for our http version used.
// By passing types we get correctly typed access to the underlying http objects in routes.
// If using http2 we'd pass <http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
const server: fastify.FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse
> = fastify({});

// Default security settings
server.register(fastifyhelmet);

// Default etag settings
server.register(fastifyetag);

// Endable gzip on all res larger than 1024 bytes
server.register(fastifycompress, {
  global: true,
  threshold: 1024,
});

// Default no cache
/*
server.register(fastifycache, {
  privacy: fastifycache.privacy.NOCACHE,
  expiresIn: 300,
});
*/
// Enable cors
server.register(fastifycors, {
  origin: ['http://localhost:8080', 'https://regattastart.herokuapp.com'],
  methods: 'GET,POST,DELETE',
});

// Serve static files (PWA APP)
server.register(fastifystatic, {
  root: resolve(__dirname, '../node_modules/@mberrg/regatta/dist/pwa'),
  prefix: '/', // optional: default '/'
  maxAge: 300,
  lastModified: false,
});

// Web sockets
server.register(fastifysocket);
server.get('/ws', { websocket: true }, (connection, req) => {
  connection.socket.send(
    JSON.stringify({ ...counterState, serverNow: Date.now() }),
  );
  console.log(`# Clients connected: ${server.websocketServer.clients.size}`);
});

// Configure path
server.post<{ Body: CounterState }>('/newState', {}, async (req, res) => {
  console.log(`Got new state ${req.body}`);

  if (req.body.password !== SECRET) {
    res.code(401).send({ error: 'access denied' });
    return;
  }
  if (
    !req.body ||
    !req.body.startTimeMs ||
    !req.body.delayMinutesBetweenHeats ||
    !req.body.numHeats
  ) {
    res.code(400).send({ status: false });
    return;
  }

  counterState.startTimeMs = parseInt(req.body.startTimeMs);
  counterState.delayMinutesBetweenHeats = parseInt(
    req.body.delayMinutesBetweenHeats,
  );
  counterState.numHeats = parseInt(req.body.numHeats);
  counterState.started = true;

  if (client)
    try {
      client.set('counterState', JSON.stringify(counterState));
    } catch (err) {
      console.error(err);
    }

  server.websocketServer.clients.forEach(function each(client) {
    console.log('Sending new state to client');
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ ...counterState, serverNow: Date.now() }));
    }
  });
  console.log('Sending all ok');
  res.code(200).send({ status: true });
});

// Reset settings / counter
server.post('/reset', {}, async (req, res) => {
  console.log(`Got reset`);

  counterState.startTimeMs = 0;
  counterState.delayMinutesBetweenHeats = 15;
  counterState.numHeats = 3;
  counterState.started = false;

  server.websocketServer.clients.forEach(function each(client) {
    console.log('Sending new state to client');
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ ...counterState, serverNow: Date.now() }));
    }
  });
  console.log('Sending all ok');
  res.code(200).send({ status: true });
});

// Run the server!
const PORT = parseInt(process.env.PORT ?? '80');
server.listen(PORT, '0.0.0.0', function(err, address) {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});
