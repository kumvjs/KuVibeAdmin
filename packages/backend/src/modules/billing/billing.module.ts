import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RechargeCatalogController, SystemCatalogController } from './catalog/catalog.controller.js'
import { CatalogService } from './catalog/catalog.service.js'
import { QuotaService } from './catalog/quota.service.js'
import { PointAccountEntity } from './points/entities/point-account.entity.js'
import { PointAllocationEntity } from './points/entities/point-allocation.entity.js'
import { PointHoldEntity, PointHoldItemEntity } from './points/entities/point-hold.entity.js'
import { PointLedgerEntity } from './points/entities/point-ledger.entity.js'
import { PointLotEntity } from './points/entities/point-lot.entity.js'
import { PointsController, SystemPointsController } from './points/points.controller.js'
import { PointsService } from './points/points.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([PointAccountEntity, PointLedgerEntity, PointLotEntity, PointAllocationEntity, PointHoldEntity, PointHoldItemEntity])],
  controllers: [PointsController, SystemPointsController, RechargeCatalogController, SystemCatalogController],
  providers: [PointsService, CatalogService, QuotaService],
  exports: [PointsService, CatalogService, QuotaService],
})
export class BillingModule {}
