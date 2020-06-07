import fastify from 'fastify';
import fastifystatic from 'fastify-static';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { resolve } from 'path';

// Create a http server. We pass the relevant typings for our http version used.
// By passing types we get correctly typed access to the underlying http objects in routes.
// If using http2 we'd pass <http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
const server: fastify.FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse
> = fastify({});

server.register(fastifystatic, {
  root: resolve(__dirname, '../node_modules/regatta/dist/pwa'),
  prefix: '/', // optional: default '/'
});

// Run the server!
server.listen(80, function(err, address) {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});
