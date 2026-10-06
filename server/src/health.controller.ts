import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() { return { status: 'ok', service: 'atms-api' } }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ok', database: 'up' }
    } catch {
      // Never disclose connection strings or driver error details to clients.
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' })
    }
  }
}
