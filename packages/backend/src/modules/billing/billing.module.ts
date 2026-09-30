import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RechargeCatalogController, SystemCatalogController } from './catalog/catalog.controller.js'
import { CatalogService } from './catalog/catalog.service.js'
import { QuotaService } from './catalog/quota.service.js'
import { BillingWorker } from './orders/billing.worker.js'
import { OrdersController, SystemOrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { BillingOutboxService } from './orders/outbox.service.js'
import { AlipayProvider } from './payments/alipay.provider.js'
import { AppleProvider } from './payments/apple.provider.js'
import { GoogleProvider } from './payments/google.provider.js'
import { PaymentConfigService } from './payments/payment-config.service.js'
import { PaymentSecretsService } from './payments/payment-secrets.service.js'
import { PaymentNotificationsController, PaymentsController } from './payments/payments.controller.js'
import { PaymentsService } from './payments/payments.service.js'
import { SettlementService } from './payments/settlement.service.js'
import { WechatProvider } from './payments/wechat.provider.js'
import { PointAccountEntity } from './points/entities/point-account.entity.js'
import { PointAllocationEntity } from './points/entities/point-allocation.entity.js'
import { PointHoldEntity, PointHoldItemEntity } from './points/entities/point-hold.entity.js'
import { PointLedgerEntity } from './points/entities/point-ledger.entity.js'
import { PointLotEntity } from './points/entities/point-lot.entity.js'
import { PointsController, SystemPointsController } from './points/points.controller.js'
import { PointsService } from './points/points.service.js'
import { ReconciliationService } from './refunds/reconciliation.service.js'
import { BillingRisksController, RefundsController } from './refunds/refunds.controller.js'
import { RefundsService } from './refunds/refunds.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([PointAccountEntity, PointLedgerEntity, PointLotEntity, PointAllocationEntity, PointHoldEntity, PointHoldItemEntity])],
  controllers: [PointsController, SystemPointsController, RechargeCatalogController, SystemCatalogController, OrdersController, SystemOrdersController, PaymentsController, PaymentNotificationsController, RefundsController, BillingRisksController],
  providers: [PointsService, CatalogService, QuotaService, OrdersService, BillingOutboxService, BillingWorker, PaymentsService, SettlementService, WechatProvider, AlipayProvider, PaymentConfigService, AppleProvider, GoogleProvider, PaymentSecretsService, RefundsService, ReconciliationService],
  exports: [PointsService, CatalogService, QuotaService, OrdersService, BillingOutboxService, BillingWorker],
})
export class BillingModule {}
