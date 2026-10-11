import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { IMAGE_PROCESSING_QUEUE } from '../media/media.constants';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [BullModule.registerQueue({ name: IMAGE_PROCESSING_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
