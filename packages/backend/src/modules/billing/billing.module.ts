import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PointAccountEntity } from './points/entities/point-account.entity.js'
import { PointAllocationEntity } from './points/entities/point-allocation.entity.js'
import { PointHoldEntity, PointHoldItemEntity } from './points/entities/point-hold.entity.js'
import { PointLedgerEntity } from './points/entities/point-ledger.entity.js'
import { PointLotEntity } from './points/entities/point-lot.entity.js'
import { PointsController, SystemPointsController } from './points/points.controller.js'
import { PointsService } from './points/points.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([PointAccountEntity, PointLedgerEntity, PointLotEntity, PointAllocationEntity, PointHoldEntity, PointHoldItemEntity])],
  controllers: [PointsController, SystemPointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class BillingModule {}
