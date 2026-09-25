import type { FastifyInstance } from 'fastify';
import { prisma } from '@autotaxflow/db';
import { LoginBody, RegisterBody } from '@autotaxflow/shared';
import { zodSchema } from '../../lib/zod-schema';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { AuditAction } from '../../lib/audit';

/**
 * POST /api/auth/register   — registro público
 * POST /api/auth/login      — login público, devuelve { token, user }
 * GET  /api/auth/me         — requiere JWT, devuelve perfil
 */
export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', {
    schema: { body: zodSchema(RegisterBody) },
    handler: async (request, reply) => {
      const { email, password, name } = request.body as ReturnType<typeof RegisterBody.parse>;

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        return reply.status(409).send({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, name, passwordHash },
        select: { id: true, email: true, name: true },
      });

      const token = fastify.signToken({ sub: user.id, email: user.email });
      return reply.status(201).send({ token, user });
    },
  });

  fastify.post('/login', {
    schema: { body: zodSchema(LoginBody) },
    handler: async (request, reply) => {
      const { email, password } = request.body as ReturnType<typeof LoginBody.parse>;
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, passwordHash: true },
      });
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const token = fastify.signToken({ sub: user.id, email: user.email });
      return reply.status(200).send({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    },
  });

  fastify.get('/me', {
    preHandler: [fastify.authenticateJwt],
    handler: async (request, reply) => {
      const { sub } = request.user;
      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: {
          id: true,
          email: true,
          name: true,
          memberships: {
            select: {
              role: true,
              organization: { select: { id: true, name: true, country: true } },
            },
          },
        },
      });
      if (!user) return reply.status(404).send({ error: 'User not found' });
      return reply.send({ user });
    },
  });
}

export { AuditAction };
