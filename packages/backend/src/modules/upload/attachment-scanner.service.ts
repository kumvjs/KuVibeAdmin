import { Injectable } from '@nestjs/common'

/** Override this provider to integrate a deployment-owned antivirus/quarantine service. */
@Injectable()
export class AttachmentScanner {
  async scan(_path: string): Promise<'unscanned' | 'clean' | 'rejected'> {
    return 'unscanned'
  }
}
