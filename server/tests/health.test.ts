import { describe, expect, it, vi } from 'vitest'
import { ServiceUnavailableException } from '@nestjs/common'

vi.mock('../src/prisma.service', () => ({ PrismaService: class {} }))
const { HealthController } = await import('../src/health.controller')

describe('health endpoints', () => {
  it('reports liveness without querying the database', () => {
    const database = { $queryRaw: vi.fn() }
    const controller = new HealthController(database as never)
    expect(controller.live()).toEqual({ status: 'ok', service: 'atms-api' })
    expect(database.$queryRaw).not.toHaveBeenCalled()
  })

  it('checks database availability for readiness', async () => {
    const database = { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }
    expect(await new HealthController(database as never).ready()).toEqual({ status: 'ok', database: 'up' })
    expect(database.$queryRaw).toHaveBeenCalledOnce()
  })

  it('returns 503 without exposing database credentials on failure', async () => {
    const controller = new HealthController({ $queryRaw: vi.fn().mockRejectedValue(new Error('secret connection string')) } as never)
    try {
      await controller.ready()
      throw new Error('Expected readiness failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException)
      const response = error as ServiceUnavailableException
      expect(response.getStatus()).toBe(503)
      expect(response.getResponse()).toEqual({ status: 'unavailable', database: 'down' })
    }
  })
})
