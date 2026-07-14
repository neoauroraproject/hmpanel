import { Injectable } from '@nestjs/common';
@Injectable()
export class StoreCustomerService {
  async getByToken(token: string): Promise<any> { return {} as any; }
  async listForAdmin(adminId: string): Promise<any> { return []; }
  async getDetail(adminId: string, customerId: string): Promise<any> { return {} as any; }
  async findOrCreate(adminId: string, data: any): Promise<any> { return {} as any; }
}
