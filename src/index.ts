import fastify from 'fastify';
import fastifystatic from 'fastify-static';
import fastifysocket from 'fastify-websocket';
import fastifycors from 'fastify-cors';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { resolve } from 'path';
import WebSocket from 'ws';

interface CounterState {
  startTimeMs: number;
  delayMinutesBetweenHeats: number;
  numHeats: number;
  started: boolean;
}

const counterState: CounterState = {
  startTimeMs: new Date(0).valueOf(),
  delayMinutesBetweenHeats: 15,
  numHeats: 3,
  started: false,
};

// Create a http server. We pass the relevant typings for our http version used.
// By passing types we get correctly typed access to the underlying http objects in routes.
// If using http2 we'd pass <http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
const server: fastify.FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse
> = fastify({});

server.register(fastifycors, {
  origin: ['http://localhost:8080', 'https://regattastart.herokuapp.com'],
  methods: 'GET,POST,DELETE',
});

server.register(fastifystatic, {
  root: resolve(__dirname, '../node_modules/@mberrg/regatta/dist/pwa'),
  prefix: '/', // optional: default '/'
});
server.register(fastifysocket);
server.get('/ws', { websocket: true }, (connection, req) => {
  connection.socket.send(JSON.stringify(counterState));
  console.log(`Clients connected: ${server.websocketServer.clients.size}`);
});

server.post<{ Body: CounterState }>('/newState', {}, async (req, res) => {
  console.log(`Got new state ${req.body}`);
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

  server.websocketServer.clients.forEach(function each(client) {
    console.log('Sending new state to client');
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(counterState));
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
