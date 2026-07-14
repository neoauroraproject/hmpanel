import { Injectable } from '@nestjs/common';
@Injectable()
export class StoreCustomerAuthService {
  async validateSession(token: string): Promise<any> { return {} as any; }
}
