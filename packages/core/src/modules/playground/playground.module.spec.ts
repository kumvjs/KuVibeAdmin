import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { APP_CONFIG } from '#/config/app.config.js'
import { PlaygroundController } from './playground.controller.js'
import { PlaygroundModule } from './playground.module.js'

describe('playground module', () => {
  it('resolves the remaining demo controller without upload dependencies', async () => {
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
      expect(module.get(PlaygroundController)).toBeInstanceOf(PlaygroundController)
    }
    finally {
      await module.close()
    }
  })
})
