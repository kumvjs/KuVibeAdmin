import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { APP_CONFIG } from '#/config/app.config.js'
import { PlaygroundUploadService } from './playground-upload.service.js'
import { PlaygroundController } from './playground.controller.js'
import { PlaygroundModule } from './playground.module.js'

describe('playground module configuration injection', () => {
  it('resolves upload dependencies with the globally registered app configuration', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [APP_CONFIG],
        }),
        PlaygroundModule,
      ],
    }).compile()

    try {
      expect(module.get(PlaygroundUploadService)).toBeInstanceOf(PlaygroundUploadService)
      expect(module.get(PlaygroundController)).toBeInstanceOf(PlaygroundController)
    }
    finally {
      await module.close()
    }
  })
})
