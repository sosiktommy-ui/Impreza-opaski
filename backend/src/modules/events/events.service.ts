import { Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth.types';

@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');
  private loggedDisabled = false;

  async list(_user: AuthUser): Promise<unknown[]> {
    if (!this.loggedDisabled) {
      this.logger.log('External events integration is disabled. Returning an empty list.');
      this.loggedDisabled = true;
    }
    return [];
  }
}
