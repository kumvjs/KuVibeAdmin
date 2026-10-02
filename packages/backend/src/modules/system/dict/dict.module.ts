import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DictCacheService } from './dict-cache.service.js'
import { DictController } from './dict.controller.js'
import { DictService } from './dict.service.js'
import { SysDictEntity } from './entities/dict.entity.js'

@Module({
  imports: [TypeOrmModule.forFeature([SysDictEntity])],
  controllers: [DictController],
  providers: [DictService, DictCacheService],
  exports: [DictService],
})
export class DictModule {}
