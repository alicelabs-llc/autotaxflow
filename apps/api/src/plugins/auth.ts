import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../lib/env';

export interface JwtPayload {
  sub: string; // user.id
  email: string;
  iat?: number;
  exp?: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Genera un JWT firmado para el payload dado.
     */
    signToken(payload: { sub: string; email: string }): string;
    /**
     * Hook preHandler que valida Authorization: Bearer <jwt> e
     * inyecta request.user. Falla con 401 si el token falta o es inválido.
     */
    authenticateJwt: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>;
  }
}

/**
 * Registra @fastify/jwt con el secreto y añade un decorator `signToken`.
 * El hook preHandler `authenticateJwt` valida Authorization: Bearer <token>
 * e inyecta `request.user` con `{ sub, email }`.
 */
export async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  fastify.decorate('signToken', (payload: { sub: string; email: string }) =>
    fastify.jwt.sign(payload)
  );

  fastify.decorate('authenticateJwt', async function (
    this: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized: invalid or missing token' });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
