import { CommonEntity } from "#/common/entity/common.entity.js";
import { TraceContext } from "#/shared/logger/logger.service.js";
import { Injectable } from "@nestjs/common";
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from "typeorm";

@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
  ) {
    dataSource.subscribers.push(this);  // 手动注册，避免与 DI 冲突
  }

  listenTo() {
    return CommonEntity;  // 只监听继承了 CommonEntity 的表
  }

  beforeInsert(event: InsertEvent<CommonEntity>) {
    const { userId } = TraceContext.storage.getStore() ?? {}
    if (userId) {
      event.entity.createdBy = userId;
      event.entity.updatedBy = userId;
    }
  }

  beforeUpdate(event: UpdateEvent<CommonEntity>) {
    const { userId } = TraceContext.storage.getStore() ?? {}
    if (userId && event.entity) {
      const entity = event.entity as CommonEntity;
      entity.updatedBy = userId;
    }
  }
}